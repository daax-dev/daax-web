import { NextRequest, NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { execFileSync } from "child_process";
import {
  generateRecordingHtml,
  generateExportFilename,
} from "@/plugins/terminal-recorder/lib/html-export";
import type { TerminalRecording } from "@/plugins/terminal-recorder/types";
import { requireAuth } from "@/lib/auth";
import { isValidRecordingId } from "@/server/recording/recorder";
import { RECORDINGS_DIR } from "@/server/config/constants";

interface GitInfo {
  branch?: string;
  commit?: string;
  remote?: string;
  projectPath?: string;
}

/**
 * Get git information for the current working directory
 */
function getGitInfo(): GitInfo {
  try {
    const cwd = process.cwd();
    const branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd,
      encoding: "utf-8",
    }).trim();
    const commit = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd,
      encoding: "utf-8",
    }).trim();
    const remote = execFileSync("git", ["remote", "get-url", "origin"], {
      cwd,
      encoding: "utf-8",
    })
      .trim()
      .replace(/\.git$/, "");
    const projectPath = cwd;

    return { branch, commit, remote, projectPath };
  } catch (error) {
    // Swallow expected "no git repository" style errors, but log unexpected ones
    if (error instanceof Error) {
      const message = error.message || "";
      const isExpectedGitError =
        message.includes("not a git repository") ||
        message.includes("no such path") ||
        message.includes("no such file or directory");

      if (!isExpectedGitError) {
        console.error(
          "[Terminal Recordings API] Unexpected error while getting git info:",
          error,
        );
      }
    } else {
      console.error(
        "[Terminal Recordings API] Non-Error thrown while getting git info:",
        error,
      );
    }
    return {};
  }
}

/**
 * GET /api/terminal-recordings/[id]/export
 * Export a recording as standalone HTML
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  // Require authentication before reading recording data
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  try {
    const { id } = await context.params;
    if (!isValidRecordingId(id)) {
      return NextResponse.json(
        { error: "invalid recording id" },
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

    const metadata: TerminalRecording = JSON.parse(
      readFileSync(metaPath, "utf-8"),
    );
    const castContent = readFileSync(castPath, "utf-8");

    // Get git info for context
    const gitInfo = getGitInfo();

    // Generate HTML
    const html = generateRecordingHtml(metadata, castContent, gitInfo);
    const filename = generateExportFilename(metadata);

    // Return as downloadable HTML file
    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error(
      "[Terminal Recordings API] Error exporting recording:",
      error,
    );
    return NextResponse.json(
      { error: "Failed to export recording" },
      { status: 500 },
    );
  }
}
