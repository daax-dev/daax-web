import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs/promises";
import * as path from "path";
import { requireAuth } from "@/lib/auth";

/**
 * API to save devcontainer files to a project
 *
 * POST /api/devcontainers/save
 * Body: { projectPath: string, files: { [filename]: content } }
 *
 * SECURITY: Requires authentication for filesystem write operations
 */
export async function POST(request: NextRequest) {
  // Require authentication for filesystem write operations
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  try {
    const body = await request.json();
    const { projectPath, files } = body;

    if (!projectPath || typeof projectPath !== "string") {
      return NextResponse.json(
        { error: "projectPath is required" },
        { status: 400 },
      );
    }

    if (!files || typeof files !== "object") {
      return NextResponse.json(
        { error: "files object is required" },
        { status: 400 },
      );
    }

    // Resolve the full project path
    // Support relative paths from basePath or absolute paths
    let fullProjectPath: string;
    if (path.isAbsolute(projectPath)) {
      fullProjectPath = projectPath;
    } else {
      // Get basePath from environment or default
      const basePath =
        process.env.DAAX_BASE_PATH || process.env.HOME
          ? path.join(process.env.HOME || "", "prj")
          : "/workspace";
      fullProjectPath = path.join(basePath, projectPath);
    }

    // Ensure project directory exists
    try {
      await fs.access(fullProjectPath);
    } catch {
      return NextResponse.json(
        { error: `Project directory not found: ${fullProjectPath}` },
        { status: 404 },
      );
    }

    // Create .devcontainer directory
    const devcontainerDir = path.join(fullProjectPath, ".devcontainer");
    await fs.mkdir(devcontainerDir, { recursive: true });

    // Write each file
    const writtenFiles: string[] = [];
    for (const [filename, content] of Object.entries(files)) {
      if (typeof content !== "string") continue;

      const filePath = path.join(devcontainerDir, filename);
      await fs.writeFile(filePath, content, "utf-8");
      writtenFiles.push(filename);
    }

    return NextResponse.json({
      success: true,
      message: `DevContainer saved to ${projectPath}/.devcontainer/`,
      path: devcontainerDir,
      files: writtenFiles,
    });
  } catch (error) {
    console.error("[API] Failed to save devcontainer:", error);
    return NextResponse.json(
      {
        error: "Failed to save devcontainer",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
