import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs/promises";
import * as path from "path";
import { requireAuth } from "@/lib/auth";
import { confineToRoot, PathConfinementError } from "@/lib/path-confine";
import { expandPath, getSettings } from "@/lib/settings";

/**
 * Resolve the CONFIGURED workspace root (server-side settings, never the
 * request body). Deriving the root from a client value would make confinement
 * a no-op, so it is intentionally server-derived — matching the sibling route
 * `devcontainers/save-local`.
 */
function resolveWorkspaceRoot(): string {
  // In container mode, /workspace is the mount point.
  return process.env.HOST_WORKSPACE_PATH
    ? "/workspace"
    : expandPath(getSettings().basePath);
}

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

    // Confine the client-controlled `projectPath` to the server-derived
    // workspace root (never a body value). Blocks `../../…` traversal and
    // absolute-path escapes before any filesystem access.
    const workspaceRoot = resolveWorkspaceRoot();
    let fullProjectPath: string;
    try {
      fullProjectPath = confineToRoot(workspaceRoot, projectPath);
    } catch (err) {
      if (err instanceof PathConfinementError) {
        return NextResponse.json(
          { error: "projectPath escapes the workspace root" },
          { status: 403 },
        );
      }
      throw err;
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

    // Pre-pass: confine EVERY client-supplied filename under the project before
    // writing anything. The `files` object keys are attacker-controlled, so a
    // key like `../../authorized_keys` must be rejected. Confining against the
    // (already in-root) project path is stricter than the workspace root and
    // also blocks intra-workspace escapes. Resolving all targets first keeps
    // the batch atomic: one bad key rejects the whole request with no partial
    // writes.
    const devcontainerDir = path.join(fullProjectPath, ".devcontainer");
    const targets: { filename: string; filePath: string; content: string }[] =
      [];
    for (const [filename, content] of Object.entries(files)) {
      if (typeof content !== "string") continue;

      let filePath: string;
      try {
        filePath = confineToRoot(fullProjectPath, ".devcontainer", filename);
      } catch (err) {
        if (err instanceof PathConfinementError) {
          return NextResponse.json(
            { error: "filename escapes the project directory" },
            { status: 403 },
          );
        }
        throw err;
      }
      targets.push({ filename, filePath, content });
    }

    // Create .devcontainer directory
    await fs.mkdir(devcontainerDir, { recursive: true });

    // Write each confined file
    const writtenFiles: string[] = [];
    for (const { filename, filePath, content } of targets) {
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
