/**
 * API route to push a devcontainer.json to an existing GitHub repository
 * Requires only Contents: Read & Write permission (no admin needed)
 *
 * SECURITY: All endpoints require authentication via requireAuth()
 */
import { NextResponse } from "next/server";
import { getGitHubToken } from "@/lib/github-app";
import { requireAuth } from "@/lib/auth";

interface PushConfigRequest {
  // Target repo in "owner/repo" format
  targetRepo: string;
  // Name for the devcontainer (used as subdirectory name)
  name: string;
  // The devcontainer.json content
  devcontainerJson: string;
}

export async function POST(request: Request) {
  // Require authentication for GitHub operations
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  try {
    const body: PushConfigRequest = await request.json();
    const { targetRepo, name, devcontainerJson } = body;

    if (!targetRepo) {
      return NextResponse.json(
        { error: "Target repository is required" },
        { status: 400 },
      );
    }

    if (!name) {
      return NextResponse.json(
        { error: "Container name is required" },
        { status: 400 },
      );
    }

    if (!devcontainerJson) {
      return NextResponse.json(
        { error: "devcontainer.json content is required" },
        { status: 400 },
      );
    }

    // Validate repo format
    const repoMatch = targetRepo.match(/^([^/]+)\/([^/]+)$/);
    if (!repoMatch) {
      return NextResponse.json(
        { error: "Invalid repository format. Use 'owner/repo'" },
        { status: 400 },
      );
    }

    const [, owner, repo] = repoMatch;

    // Get GitHub token
    const token = await getGitHubToken();
    if (!token) {
      return NextResponse.json(
        {
          error:
            "GitHub not configured. Set GITHUB_DAAX_* environment variables.",
        },
        { status: 401 },
      );
    }

    // Sanitize the name for use as a directory name
    const safeName = name
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");

    // Path for the devcontainer file (each config gets its own subdirectory)
    const filePath = `containers/${safeName}/devcontainer.json`;
    const fileUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;

    // Check if file already exists (to get SHA for update)
    let existingSha: string | undefined;
    const checkResponse = await fetch(fileUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    if (checkResponse.ok) {
      const existingFile = await checkResponse.json();
      existingSha = existingFile.sha;
    } else if (checkResponse.status !== 404) {
      // Some other error
      const error = await checkResponse.text();
      console.error("Failed to check existing file:", error);
    }

    // Create or update the file
    const content = Buffer.from(devcontainerJson).toString("base64");
    const commitMessage = existingSha
      ? `Update ${safeName} devcontainer configuration`
      : `Add ${safeName} devcontainer configuration`;

    const createResponse = await fetch(fileUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        message: commitMessage,
        content,
        ...(existingSha && { sha: existingSha }),
      }),
    });

    if (!createResponse.ok) {
      const error = await createResponse.json();
      console.error("Failed to create/update file:", error);
      return NextResponse.json(
        { error: error.message || "Failed to push configuration" },
        { status: createResponse.status },
      );
    }

    const result = await createResponse.json();

    return NextResponse.json({
      success: true,
      action: existingSha ? "updated" : "created",
      file: {
        path: filePath,
        sha: result.content.sha,
        html_url: result.content.html_url,
      },
      repo: {
        full_name: `${owner}/${repo}`,
        html_url: `https://github.com/${owner}/${repo}`,
      },
    });
  } catch (error) {
    console.error("Error pushing configuration:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 },
    );
  }
}
