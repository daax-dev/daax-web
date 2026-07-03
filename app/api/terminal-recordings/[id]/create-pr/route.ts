import { NextRequest, NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { execFileSync } from "child_process";
import { getGitHubToken } from "@/lib/github-app";
import { requireAuth } from "@/lib/auth";
import {
  generateRecordingHtml,
  generateExportFilename,
} from "@/plugins/terminal-recorder/lib/html-export";
import type { TerminalRecording } from "@/plugins/terminal-recorder/types";
import { isValidRecordingId } from "@/server/recording/recorder";

const RECORDINGS_DIR = join(homedir(), ".daax", "recordings");

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

interface GitRepoInfo {
  owner: string;
  repo: string;
  defaultBranch: string;
  currentBranch: string;
  gitRoot: string;
}

/**
 * Parse GitHub remote URL to get owner and repo
 */
function parseGitRemote(
  remoteUrl: string,
): { owner: string; repo: string } | null {
  // Handle SSH: git@github.com:owner/repo.git
  const sshMatch = remoteUrl.match(/git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/);
  if (sshMatch) {
    return { owner: sshMatch[1], repo: sshMatch[2] };
  }

  // Handle HTTPS: https://github.com/owner/repo.git
  const httpsMatch = remoteUrl.match(/github\.com\/([^/]+)\/(.+?)(?:\.git)?$/);
  if (httpsMatch) {
    return { owner: httpsMatch[1], repo: httpsMatch[2] };
  }

  return null;
}

/**
 * Check if a Git branch exists
 */
function branchExists(cwd: string, branch: string): boolean {
  try {
    execFileSync("git", ["rev-parse", "--verify", branch], {
      cwd,
      encoding: "utf-8",
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the default branch name (main or master)
 */
function getDefaultBranch(cwd: string): string {
  try {
    const remoteBranch = execFileSync(
      "git",
      ["symbolic-ref", "refs/remotes/origin/HEAD"],
      { cwd, encoding: "utf-8" },
    ).trim();
    return remoteBranch.replace("refs/remotes/origin/", "");
  } catch {
    // Fallback: check if main exists, otherwise master, otherwise default to main
    if (branchExists(cwd, "origin/main")) return "main";
    if (branchExists(cwd, "origin/master")) return "master";
    return "main"; // Default fallback
  }
}

/**
 * Get git repository information
 */
function getGitRepoInfo(): GitRepoInfo | null {
  try {
    const cwd = process.cwd();
    const gitRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf-8",
    }).trim();
    const remoteUrl = execFileSync("git", ["remote", "get-url", "origin"], {
      cwd,
      encoding: "utf-8",
    }).trim();
    const currentBranch = execFileSync(
      "git",
      ["rev-parse", "--abbrev-ref", "HEAD"],
      { cwd, encoding: "utf-8" },
    ).trim();

    // Get default branch (usually main or master)
    const defaultBranch = getDefaultBranch(cwd);

    const parsed = parseGitRemote(remoteUrl);
    if (!parsed) return null;

    return {
      owner: parsed.owner,
      repo: parsed.repo,
      defaultBranch,
      currentBranch,
      gitRoot,
    };
  } catch {
    return null;
  }
}

/**
 * GitHub API helper
 */
async function githubApi(
  token: string,
  endpoint: string,
  method: string = "GET",
  body?: unknown,
): Promise<Response> {
  const response = await fetch(`https://api.github.com${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return response;
}

/**
 * POST /api/terminal-recordings/[id]/create-pr
 * Create a PR with the recording for audit
 *
 * SECURITY: Requires authentication for GitHub operations
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  // Require authentication for GitHub operations
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
    const body = await request.json().catch(() => ({}));
    const exportPath = body.exportPath || "docs/recordings";
    const prTitle = body.title || `Add AI session recording for audit`;

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

    // Check for GitHub token
    const token = await getGitHubToken();
    if (!token) {
      return NextResponse.json(
        {
          error: "GitHub not connected. Please add a GitHub token in Settings.",
        },
        { status: 401 },
      );
    }

    // Get repository info
    const repoInfo = getGitRepoInfo();
    if (!repoInfo) {
      return NextResponse.json(
        { error: "Not in a GitHub repository or unable to parse remote URL." },
        { status: 400 },
      );
    }

    // Check recording exists
    const metaPath = join(RECORDINGS_DIR, `${id}.json`);
    const castPath = join(RECORDINGS_DIR, `${id}.cast`);

    if (!existsSync(metaPath) || !existsSync(castPath)) {
      return NextResponse.json(
        { error: "Recording not found" },
        { status: 404 },
      );
    }

    // Read recording data
    const metadata: TerminalRecording = JSON.parse(
      readFileSync(metaPath, "utf-8"),
    );
    const castContent = readFileSync(castPath, "utf-8");

    // Generate HTML and filenames
    const html = generateRecordingHtml(metadata, castContent, {
      branch: repoInfo.currentBranch,
      projectPath: repoInfo.gitRoot,
    });
    const htmlFilename = generateExportFilename(metadata);
    const castFilename = htmlFilename.replace(".html", ".cast");

    // Create branch name
    const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const branchName = `recording/${timestamp}-${metadata.sessionType}-${id.slice(-8)}`;

    // Get the SHA of the base branch
    const baseRefResponse = await githubApi(
      token,
      `/repos/${repoInfo.owner}/${repoInfo.repo}/git/ref/heads/${repoInfo.defaultBranch}`,
    );

    if (!baseRefResponse.ok) {
      const error = await baseRefResponse.json();
      return NextResponse.json(
        {
          error: `Failed to get base branch: ${error.message || baseRefResponse.statusText}`,
        },
        { status: 400 },
      );
    }

    const baseRef = await baseRefResponse.json();
    const baseSha = baseRef.object.sha;

    // Create a new branch
    const createBranchResponse = await githubApi(
      token,
      `/repos/${repoInfo.owner}/${repoInfo.repo}/git/refs`,
      "POST",
      {
        ref: `refs/heads/${branchName}`,
        sha: baseSha,
      },
    );

    if (!createBranchResponse.ok) {
      const error = await createBranchResponse.json();
      return NextResponse.json(
        {
          error: `Failed to create branch: ${error.message || createBranchResponse.statusText}`,
        },
        { status: 400 },
      );
    }

    // Create the files using the GitHub API (creates a commit)
    // First, get the current tree
    // Get base tree (not currently used but kept for future reference)
    // const baseTreeResponse = await githubApi(
    //   token,
    //   `/repos/${repoInfo.owner}/${repoInfo.repo}/git/trees/${baseSha}`
    // );
    // const baseTree = await baseTreeResponse.json();

    // Create blobs for our files
    const htmlBlobResponse = await githubApi(
      token,
      `/repos/${repoInfo.owner}/${repoInfo.repo}/git/blobs`,
      "POST",
      {
        content: Buffer.from(html).toString("base64"),
        encoding: "base64",
      },
    );
    const htmlBlob = await htmlBlobResponse.json();

    const castBlobResponse = await githubApi(
      token,
      `/repos/${repoInfo.owner}/${repoInfo.repo}/git/blobs`,
      "POST",
      {
        content: Buffer.from(castContent).toString("base64"),
        encoding: "base64",
      },
    );
    const castBlob = await castBlobResponse.json();

    // Create a new tree with our files
    const newTreeResponse = await githubApi(
      token,
      `/repos/${repoInfo.owner}/${repoInfo.repo}/git/trees`,
      "POST",
      {
        base_tree: baseSha,
        tree: [
          {
            path: `${exportPath}/${htmlFilename}`,
            mode: "100644",
            type: "blob",
            sha: htmlBlob.sha,
          },
          {
            path: `${exportPath}/${castFilename}`,
            mode: "100644",
            type: "blob",
            sha: castBlob.sha,
          },
        ],
      },
    );
    const newTree = await newTreeResponse.json();

    // Create a commit
    const sessionDate = new Date(metadata.startTime).toLocaleDateString(
      "en-US",
      {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      },
    );

    const commitMessage = `Add AI session recording: ${metadata.sessionType}

Recording from ${sessionDate}
Command: ${metadata.command}
Duration: ${metadata.endTime ? Math.round((metadata.endTime - metadata.startTime) / 1000) + "s" : "In progress"}

Files:
- ${exportPath}/${htmlFilename} (web player)
- ${exportPath}/${castFilename} (asciinema format)

🤖 Generated with Daax`;

    const commitResponse = await githubApi(
      token,
      `/repos/${repoInfo.owner}/${repoInfo.repo}/git/commits`,
      "POST",
      {
        message: commitMessage,
        tree: newTree.sha,
        parents: [baseSha],
      },
    );
    const commit = await commitResponse.json();

    // Update the branch to point to the new commit
    await githubApi(
      token,
      `/repos/${repoInfo.owner}/${repoInfo.repo}/git/refs/heads/${branchName}`,
      "PATCH",
      {
        sha: commit.sha,
      },
    );

    // Create the PR
    const prBody = `## AI Session Recording

This PR adds a terminal recording for audit and review purposes.

### Recording Details
- **Session Type**: ${metadata.sessionType}
- **Date**: ${sessionDate}
- **Command**: \`${metadata.command}\`
- **Duration**: ${metadata.endTime ? Math.round((metadata.endTime - metadata.startTime) / 1000) + " seconds" : "In progress"}

### Files Added
- \`${exportPath}/${htmlFilename}\` - Standalone HTML player (open in browser)
- \`${exportPath}/${castFilename}\` - Raw asciinema v2 format

### How to View
1. After merge, open \`${exportPath}/${htmlFilename}\` in a browser
2. Or use \`asciinema play ${exportPath}/${castFilename}\`

---
🤖 *Generated with [Daax](https://github.com/anthropics/claude-code)*`;

    const prResponse = await githubApi(
      token,
      `/repos/${repoInfo.owner}/${repoInfo.repo}/pulls`,
      "POST",
      {
        title: prTitle,
        body: prBody,
        head: branchName,
        base: repoInfo.defaultBranch,
      },
    );

    if (!prResponse.ok) {
      const error = await prResponse.json();
      return NextResponse.json(
        {
          error: `Failed to create PR: ${error.message || prResponse.statusText}`,
        },
        { status: 400 },
      );
    }

    const pr = await prResponse.json();

    return NextResponse.json({
      success: true,
      pr: {
        number: pr.number,
        url: pr.html_url,
        title: pr.title,
        branch: branchName,
      },
      files: {
        html: `${exportPath}/${htmlFilename}`,
        cast: `${exportPath}/${castFilename}`,
      },
    });
  } catch (error) {
    console.error("[Terminal Recordings API] Error creating PR:", error);
    return NextResponse.json(
      { error: "Failed to create PR", details: String(error) },
      { status: 500 },
    );
  }
}
