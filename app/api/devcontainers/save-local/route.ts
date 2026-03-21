/**
 * API route to save a devcontainer.json locally to a project
 * Supports two destinations:
 * - .devcontainer/ (standard VS Code/Codespaces location)
 * - containers/<name>/ (custom multi-config location)
 */
import { NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { join, dirname } from "path";
import { existsSync } from "fs";

interface SaveLocalRequest {
  // Project path relative to workspace root (e.g., "ps/daax")
  project: string;
  // Container name (used as subdirectory name for containers/ location)
  name: string;
  // The devcontainer.json content
  devcontainerJson: string;
  // Destination: "devcontainer" for .devcontainer/, "containers" for containers/<name>/
  destination: "devcontainer" | "containers";
  // Base path for workspace
  basePath?: string;
}

// Resolve workspace path (handle ~ and container paths)
function resolveWorkspacePath(basePath: string, projectPath: string): string {
  // In container mode, /workspace is the mount point
  const workspaceRoot = process.env.HOST_WORKSPACE_PATH
    ? "/workspace"
    : basePath.replace(/^~/, process.env.HOME || "");

  return join(workspaceRoot, projectPath);
}

export async function POST(request: Request) {
  try {
    const body: SaveLocalRequest = await request.json();
    const {
      project,
      name,
      devcontainerJson,
      destination,
      basePath = "~/prj",
    } = body;

    if (!project) {
      return NextResponse.json(
        { error: "Project path is required" },
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

    if (!destination || !["devcontainer", "containers"].includes(destination)) {
      return NextResponse.json(
        { error: "Destination must be 'devcontainer' or 'containers'" },
        { status: 400 },
      );
    }

    const fullProjectPath = resolveWorkspacePath(basePath, project);

    // Sanitize the name for use as a directory name
    const safeName = name
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");

    // Determine the file path based on destination
    let filePath: string;
    let relativePath: string;

    if (destination === "devcontainer") {
      // For .devcontainer/, use the name as subdirectory if it's not "default"
      // This supports multi-container setups
      if (safeName === "default" || safeName === "devcontainer") {
        filePath = join(fullProjectPath, ".devcontainer", "devcontainer.json");
        relativePath = ".devcontainer/devcontainer.json";
      } else {
        filePath = join(
          fullProjectPath,
          ".devcontainer",
          safeName,
          "devcontainer.json",
        );
        relativePath = `.devcontainer/${safeName}/devcontainer.json`;
      }
    } else {
      // For containers/<name>/
      filePath = join(
        fullProjectPath,
        "containers",
        safeName,
        "devcontainer.json",
      );
      relativePath = `containers/${safeName}/devcontainer.json`;
    }

    // Check if file already exists
    const fileExists = existsSync(filePath);

    // Create directory if it doesn't exist
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }

    // Write the file
    await writeFile(filePath, devcontainerJson, "utf-8");

    return NextResponse.json({
      success: true,
      action: fileExists ? "updated" : "created",
      file: {
        path: relativePath,
        fullPath: filePath,
      },
      project,
    });
  } catch (error) {
    console.error("Error saving devcontainer locally:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 },
    );
  }
}
