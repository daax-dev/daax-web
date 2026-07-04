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
import { requireAuth } from "@/lib/auth";
import { confineToRoot, PathConfinementError } from "@/lib/path-confine";
import { expandPath, getSettings } from "@/lib/settings";

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

// Resolve the CONFIGURED workspace root (server-side settings, never the
// request body). The untrusted `project` segment is NOT joined here — it is
// confined separately below so a traversal payload cannot escape this root.
//
// Security: the root must come from server config, not the client. Deriving it
// from a request-body `basePath` would let an attacker set the root to its own
// target (e.g. `/etc`), making confinement a no-op in host-dev mode.
function resolveWorkspaceRoot(): string {
  // In container mode, /workspace is the mount point.
  return process.env.HOST_WORKSPACE_PATH
    ? "/workspace"
    : expandPath(getSettings().basePath);
}

export async function POST(request: Request) {
  // Require authentication before parsing the body or touching the filesystem.
  const auth = await requireAuth();
  if (!auth.authenticated) {
    return auth.response;
  }

  try {
    const body: SaveLocalRequest = await request.json();
    // Note: `body.basePath` is intentionally ignored for path resolution — the
    // confinement root is derived from server config only (see resolveWorkspaceRoot).
    const { project, name, devcontainerJson, destination } = body;

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

    // Confine the client-controlled `project` to the workspace root: reject any
    // value that resolves (after normalization) outside the root. This blocks
    // `../../…` traversal and absolute-path escapes before any write.
    const workspaceRoot = resolveWorkspaceRoot();
    let fullProjectPath: string;
    try {
      fullProjectPath = confineToRoot(workspaceRoot, project);
    } catch (err) {
      if (err instanceof PathConfinementError) {
        return NextResponse.json(
          { error: "Project path escapes the workspace root" },
          { status: 403 },
        );
      }
      throw err;
    }

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
