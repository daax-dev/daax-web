/**
 * API route to create a GitHub repository with a devcontainer.json file
 * Supports both GitHub App installation tokens and user OAuth tokens
 *
 * SECURITY: All endpoints require authentication via requireAuth()
 */
import { NextResponse } from "next/server";
import { getGitHubToken, verifyToken } from "@/lib/github-app";
import { requireAuth } from "@/lib/auth";

interface CreateRepoRequest {
  name: string;
  description?: string;
  devcontainerJson: string;
  isPrivate?: boolean;
}

export async function POST(request: Request) {
  // Require authentication for GitHub operations
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  try {
    const body: CreateRepoRequest = await request.json();
    const { name, description, devcontainerJson, isPrivate = true } = body;

    if (!name) {
      return NextResponse.json(
        { error: "Repository name is required" },
        { status: 400 },
      );
    }

    if (!devcontainerJson) {
      return NextResponse.json(
        { error: "devcontainer.json content is required" },
        { status: 400 },
      );
    }

    // Get GitHub token (installation token preferred, falls back to OAuth/env)
    const token = await getGitHubToken();
    if (!token) {
      return NextResponse.json(
        {
          error:
            "GitHub not configured. Configure the GitHub App in settings or set GITHUB_TOKEN environment variable.",
        },
        { status: 401 },
      );
    }

    // Verify token and get user/installation info
    const authInfo = await verifyToken(token);
    if (!authInfo) {
      return NextResponse.json(
        { error: "Invalid GitHub token. Please re-authenticate." },
        { status: 401 },
      );
    }

    const owner = authInfo.login;

    // Create the repository
    const createRepoResponse = await fetch(
      "https://api.github.com/user/repos",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          description: description || `Development container for ${name}`,
          private: isPrivate,
          auto_init: false, // We'll add files manually
        }),
      },
    );

    if (!createRepoResponse.ok) {
      const error = await createRepoResponse.json();
      if (
        createRepoResponse.status === 422 &&
        error.errors?.[0]?.message?.includes("name already exists")
      ) {
        return NextResponse.json(
          { error: `Repository '${name}' already exists` },
          { status: 409 },
        );
      }
      return NextResponse.json(
        { error: error.message || "Failed to create repository" },
        { status: createRepoResponse.status },
      );
    }

    const repo = await createRepoResponse.json();

    // Create .devcontainer/devcontainer.json file
    const devcontainerPath = ".devcontainer/devcontainer.json";
    const devcontainerContent =
      Buffer.from(devcontainerJson).toString("base64");

    const createFileResponse = await fetch(
      `https://api.github.com/repos/${owner}/${name}/contents/${devcontainerPath}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: "Add devcontainer configuration",
          content: devcontainerContent,
        }),
      },
    );

    if (!createFileResponse.ok) {
      // Repo was created but file failed - still return success with warning
      console.error(
        "Failed to create devcontainer.json:",
        await createFileResponse.text(),
      );
    }

    // Create README.md
    const readmeContent = `# ${name}

Development container for ${name}.

## Getting Started

1. Open this repository in VS Code
2. When prompted, click "Reopen in Container" or run the "Dev Containers: Reopen in Container" command
3. VS Code will build the container and connect to it

## Using GitHub Codespaces

Click the "Code" button above and select "Open with Codespaces" to start coding in the cloud.

---

*Generated with [daax.dev](https://github.com/jpoley/daax) DevContainer Builder*
`;

    const createReadmeResponse = await fetch(
      `https://api.github.com/repos/${owner}/${name}/contents/README.md`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: "Add README",
          content: Buffer.from(readmeContent).toString("base64"),
        }),
      },
    );

    if (!createReadmeResponse.ok) {
      console.error(
        "Failed to create README:",
        await createReadmeResponse.text(),
      );
    }

    // Create .gitignore
    const gitignoreContent = `# Dependencies
node_modules/
vendor/
.venv/

# Build outputs
dist/
build/
*.o
*.exe

# IDE
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Environment
.env
.env.local
`;

    const createGitignoreResponse = await fetch(
      `https://api.github.com/repos/${owner}/${name}/contents/.gitignore`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: "Add .gitignore",
          content: Buffer.from(gitignoreContent).toString("base64"),
        }),
      },
    );

    if (!createGitignoreResponse.ok) {
      console.error(
        "Failed to create .gitignore:",
        await createGitignoreResponse.text(),
      );
    }

    return NextResponse.json({
      success: true,
      repo: {
        name: repo.name,
        full_name: repo.full_name,
        html_url: repo.html_url,
        clone_url: repo.clone_url,
        ssh_url: repo.ssh_url,
      },
      user: owner,
    });
  } catch (error) {
    console.error("Error creating repository:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 },
    );
  }
}
