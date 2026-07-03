import { NextRequest, NextResponse } from "next/server";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  copyFileSync,
  readdirSync,
} from "fs";
import { join } from "path";
import { execFileSync } from "child_process";
import {
  generateRecordingHtml,
  generateExportFilename,
} from "@/plugins/terminal-recorder/lib/html-export";
import type { TerminalRecording } from "@/plugins/terminal-recorder/types";
import { isValidRecordingId } from "@/server/recording/recorder";
import { RECORDINGS_DIR } from "@/server/config/constants";

/**
 * Validate export path to prevent path traversal attacks
 */
function isValidExportPath(path: string): boolean {
  // No absolute paths
  if (path.startsWith("/")) return false;
  // No path traversal sequences
  if (path.includes("..")) return false;
  // Allow alphanumeric, dash, underscore, forward slash, spaces, and dots
  if (!/^[a-zA-Z0-9/_\- .]+$/.test(path)) return false;
  return true;
}

interface GitInfo {
  branch?: string;
  commit?: string;
  remote?: string;
  projectPath?: string;
}

/**
 * Get git information and project root
 */
function getGitInfo(): GitInfo & { gitRoot?: string } {
  const cwd = process.cwd();

  // First, determine if we are inside a Git repository and get the root
  let gitRoot: string;
  try {
    gitRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf-8",
    }).trim();
  } catch {
    // Either Git is not installed or the current directory is not a Git repository
    // In this case, we return an empty object to indicate that no Git info is available
    return {};
  }

  const info: GitInfo & { gitRoot?: string } = {
    projectPath: gitRoot,
    gitRoot,
  };

  // Try to get the current branch; this can fail in detached HEAD state
  try {
    info.branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd,
      encoding: "utf-8",
    }).trim();
  } catch {
    // Branch information is optional; ignore failures
  }

  // Try to get the current commit hash
  try {
    info.commit = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd,
      encoding: "utf-8",
    }).trim();
  } catch {
    // Commit information is optional; ignore failures
  }

  // Try to get the "origin" remote URL
  try {
    const remote = execFileSync("git", ["remote", "get-url", "origin"], {
      cwd,
      encoding: "utf-8",
    })
      .trim()
      .replace(/\.git$/, "");

    if (remote) {
      info.remote = remote;
    }
  } catch {
    // No remote configured or Git error while retrieving it; remote is optional
  }

  return info;
}

/**
 * Generate an index.html file that lists all recordings in a directory
 */
function generateIndexHtml(recordingsPath: string): string {
  // Find all HTML files in the directory
  const files = existsSync(recordingsPath)
    ? readdirSync(recordingsPath)
        .filter((f: string) => f.endsWith(".html") && f !== "index.html")
        .sort()
        .reverse() // Newest first
    : [];

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Terminal Recordings</title>
  <style>
    body {
      margin: 0;
      padding: 20px;
      background: #0d1117;
      color: #e6edf3;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    }
    .container { max-width: 800px; margin: 0 auto; }
    h1 { margin-bottom: 24px; }
    .recordings { list-style: none; padding: 0; }
    .recording {
      display: block;
      padding: 12px 16px;
      margin-bottom: 8px;
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 6px;
      color: #58a6ff;
      text-decoration: none;
    }
    .recording:hover { background: #21262d; }
    .empty { color: #8b949e; font-style: italic; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Terminal Recordings</h1>
    ${
      files.length > 0
        ? `
    <ul class="recordings">
      ${files.map((f: string) => `<li><a class="recording" href="${f}">${f}</a></li>`).join("\n      ")}
    </ul>
    `
        : '<p class="empty">No recordings yet.</p>'
    }
  </div>
</body>
</html>`;
}

/**
 * POST /api/terminal-recordings/[id]/publish
 * Publish a recording to the project's recordings folder
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    if (!isValidRecordingId(id)) {
      return NextResponse.json(
        { error: "invalid recording id" },
        { status: 400 },
      );
    }
    const body = await request.json().catch(() => ({}));
    const exportPath = body.exportPath || "docs/recordings";

    // Validate export path to prevent path traversal
    if (!isValidExportPath(exportPath)) {
      return NextResponse.json(
        {
          error:
            'Invalid export path. Path must be relative and cannot contain ".." sequences.',
        },
        { status: 400 },
      );
    }

    const metaPath = join(RECORDINGS_DIR, `${id}.json`);
    const castPath = join(RECORDINGS_DIR, `${id}.cast`);

    if (!existsSync(metaPath) || !existsSync(castPath)) {
      return NextResponse.json(
        { error: "Recording not found" },
        { status: 404 },
      );
    }

    // Get git info
    const gitInfo = getGitInfo();
    if (!gitInfo.gitRoot) {
      return NextResponse.json(
        { error: "Not in a git repository. Cannot publish recordings." },
        { status: 400 },
      );
    }

    // Read recording data
    const metadata: TerminalRecording = JSON.parse(
      readFileSync(metaPath, "utf-8"),
    );
    const castContent = readFileSync(castPath, "utf-8");

    // Determine output paths
    const outputDir = join(gitInfo.gitRoot, exportPath);
    const htmlFilename = generateExportFilename(metadata);
    const castFilename = htmlFilename.replace(".html", ".cast");
    const htmlPath = join(outputDir, htmlFilename);
    const castOutputPath = join(outputDir, castFilename);

    // Create output directory if needed
    mkdirSync(outputDir, { recursive: true });

    // Generate and write HTML
    const html = generateRecordingHtml(metadata, castContent, gitInfo);
    writeFileSync(htmlPath, html, "utf-8");

    // Copy cast file
    copyFileSync(castPath, castOutputPath);

    // Update index.html
    const indexPath = join(outputDir, "index.html");
    const indexHtml = generateIndexHtml(outputDir);
    writeFileSync(indexPath, indexHtml, "utf-8");

    // Get relative paths for response
    const relativeHtmlPath = join(exportPath, htmlFilename);
    const relativeCastPath = join(exportPath, castFilename);

    return NextResponse.json({
      success: true,
      message: `Recording published to ${exportPath}`,
      files: {
        html: relativeHtmlPath,
        cast: relativeCastPath,
        index: join(exportPath, "index.html"),
      },
      gitInfo: {
        branch: gitInfo.branch,
        projectPath: gitInfo.gitRoot,
      },
    });
  } catch (error) {
    console.error(
      "[Terminal Recordings API] Error publishing recording:",
      error,
    );
    return NextResponse.json(
      { error: "Failed to publish recording", details: String(error) },
      { status: 500 },
    );
  }
}
