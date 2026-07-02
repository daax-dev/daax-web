import { NextResponse } from "next/server";
import { readdirSync, existsSync } from "fs";
import { join } from "path";
import { getSettings } from "@/lib/settings";
import { expandPath } from "@/lib/path-utils";

interface GitProject {
  name: string;
  path: string;
  type: "git" | "planning" | "folder";
  hasSubprojects?: boolean;
}

// Get workspace base path from settings
function getWorkspacePath(settings?: { basePath: string }): string {
  const basePath = settings?.basePath || "~/prj";

  // Check if we're in a container and the workspace is mounted at /workspace
  if (existsSync("/workspace") && process.env.HOST_WORKSPACE_PATH) {
    // We're in a container where the workspace is mounted at /workspace
    // The HOST_WORKSPACE_PATH should be something like /home/user/prj
    // and basePath could be ~/prj/ps

    // Extract the part after the base mount (e.g., ~/prj/ps -> ps)
    const hostBase = process.env.HOST_WORKSPACE_PATH.replace(
      /^.*\/([^\/]+)$/,
      "~/$1",
    ); // /home/user/prj -> ~/prj

    if (basePath.startsWith(hostBase) && basePath.length > hostBase.length) {
      // Get subdirectory (e.g., ~/prj/ps -> ps)
      const subdir = basePath.slice(hostBase.length + 1); // +1 for the slash
      const fullPath = `/workspace/${subdir}`;
      console.log(
        `[Workspace API] Container mode - basePath: ${basePath}, hostBase: ${hostBase}, subdir: ${subdir} -> ${fullPath}`,
      );
      return fullPath;
    }

    console.log(
      `[Workspace API] Container mode - basePath: ${basePath} -> /workspace`,
    );
    return "/workspace";
  }

  // Host mode: expand ~ to home directory
  return expandPath(basePath);
}

// Maximum directory depth to walk below the workspace base. Bounds filesystem
// cost while comfortably covering real nesting (e.g. kb/src/terragen).
const MAX_DEPTH = 5;

// Directories never worth descending into when hunting for git repos.
const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  ".turbo",
  "dist",
  "build",
  "out",
  "coverage",
  "vendor",
  "target",
  ".venv",
  "venv",
  "__pycache__",
]);

// Check if a directory has a .git folder
function hasGitFolder(dirPath: string): boolean {
  try {
    return existsSync(join(dirPath, ".git"));
  } catch {
    return false;
  }
}

interface WalkedDir extends GitProject {
  hasRepoDescendant: boolean;
}

/**
 * Recursively walk `dirPath` (whose path relative to the base is `relPrefix`)
 * and collect every directory into `out`. Repos are NOT treated as leaves —
 * the walk keeps descending so repo-in-repo layouts (a git repo that contains
 * nested git repos) stay fully reachable. Returns true if any repo was found
 * at or below `dirPath`.
 */
function walk(
  dirPath: string,
  relPrefix: string,
  depth: number,
  toDisplay: (p: string) => string,
  out: WalkedDir[],
): boolean {
  let entries;
  try {
    entries = readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return false;
  }

  let subtreeHasRepo = false;

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    if (IGNORED_DIRS.has(entry.name)) continue;

    const childPath = join(dirPath, entry.name);
    const childRel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
    const isRepo = hasGitFolder(childPath);

    // Descend unless we've hit the depth cap.
    const childHasRepo =
      depth < MAX_DEPTH
        ? walk(childPath, childRel, depth + 1, toDisplay, out)
        : false;

    if (isRepo || childHasRepo) subtreeHasRepo = true;

    // Emit repos, containers (repo somewhere below), and top-level plain
    // folders. Prune deeper folder-only branches to keep the tree focused.
    const isTopLevel = depth === 0;
    if (isRepo || childHasRepo || isTopLevel) {
      out.push({
        name: childRel,
        path: toDisplay(childPath),
        type: isRepo ? "git" : childHasRepo ? "planning" : "folder",
        hasRepoDescendant: childHasRepo,
      });
    }
  }

  return subtreeHasRepo;
}

export async function GET(request: Request) {
  try {
    // Get basePath from query param if provided (for real-time updates)
    const { searchParams } = new URL(request.url);
    const queryBasePath = searchParams.get("basePath");

    const settings = queryBasePath
      ? { basePath: queryBasePath }
      : getSettings();
    const workspacePath = getWorkspacePath(settings);

    console.log(
      `[Workspace API] Using basePath: ${settings.basePath}, resolved to: ${workspacePath}`,
    );
    console.log(
      `[Workspace API] Checking existence:`,
      existsSync(workspacePath),
    );

    // Check if directory exists
    if (!existsSync(workspacePath)) {
      console.error(
        `[Workspace API] Directory does not exist: ${workspacePath}`,
      );
      return NextResponse.json(
        {
          success: false,
          error: `Directory does not exist: ${settings.basePath}`,
          directories: [],
          basePath: settings.basePath,
          resolvedPath: workspacePath,
        },
        { status: 404 },
      );
    }

    // Helper to convert container paths back to user's preferred paths
    const getUserPath = (containerPath: string): string => {
      if (
        workspacePath === "/workspace" &&
        containerPath.startsWith("/workspace")
      ) {
        // Replace /workspace with the user's basePath
        return containerPath.replace("/workspace", settings.basePath);
      }
      return containerPath;
    };

    // Recursively discover directories (repos at any depth, their containers,
    // and top-level folders). See walk() for the traversal rules.
    const walked: WalkedDir[] = [];
    walk(workspacePath, "", 0, getUserPath, walked);

    // Drop the internal helper flag before returning; keep the public shape.
    const allProjects: GitProject[] = walked.map(
      ({ hasRepoDescendant: _ignored, ...rest }) => rest,
    );

    // Sort projects: planning projects first, then git, then folders, then by name
    allProjects.sort((a, b) => {
      // Priority order: planning > git > folder
      const typeOrder = { planning: 0, git: 1, folder: 2 };
      const orderDiff = typeOrder[a.type] - typeOrder[b.type];
      if (orderDiff !== 0) return orderDiff;
      return a.name.localeCompare(b.name);
    });

    console.log(
      `[Workspace API] Found ${allProjects.length} projects in ${workspacePath}`,
    );

    return NextResponse.json({
      success: true,
      workspacePath,
      directories: allProjects,
      basePath: settings.basePath,
      resolvedPath: workspacePath,
      projectCount: allProjects.length,
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Failed to read workspace",
        directories: [],
      },
      { status: 500 },
    );
  }
}
