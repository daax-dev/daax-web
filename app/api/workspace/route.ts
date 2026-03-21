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

// Check if a directory has a .git folder
function hasGitFolder(dirPath: string): boolean {
  try {
    return existsSync(join(dirPath, ".git"));
  } catch {
    return false;
  }
}

// Check if a directory has subdirectories with .git folders
function hasGitSubprojects(dirPath: string): boolean {
  try {
    const entries = readdirSync(dirPath, { withFileTypes: true });
    return entries.some(
      (entry) =>
        entry.isDirectory() &&
        !entry.name.startsWith(".") &&
        hasGitFolder(join(dirPath, entry.name)),
    );
  } catch {
    return false;
  }
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

    // Read directory entries
    const entries = readdirSync(workspacePath, { withFileTypes: true });

    // Find all directories (not just Git projects)
    const allProjects: GitProject[] = [];

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

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) {
        continue;
      }

      const fullPath = join(workspacePath, entry.name);
      const displayPath = getUserPath(fullPath);

      // Check what type of directory this is
      const isGitProject = hasGitFolder(fullPath);
      const hasSubprojects = hasGitSubprojects(fullPath);

      if (isGitProject) {
        // It's a Git project
        allProjects.push({
          name: entry.name,
          path: displayPath,
          type: "git",
        });
      } else if (hasSubprojects) {
        // It's a planning project (has git subdirectories)
        allProjects.push({
          name: entry.name,
          path: displayPath,
          type: "planning",
          hasSubprojects: true,
        });

        // Also add the git subprojects
        const subEntries = readdirSync(fullPath, { withFileTypes: true });
        for (const subEntry of subEntries) {
          if (!subEntry.isDirectory() || subEntry.name.startsWith(".")) {
            continue;
          }

          const subPath = join(fullPath, subEntry.name);
          const subDisplayPath = getUserPath(subPath);
          if (hasGitFolder(subPath)) {
            allProjects.push({
              name: `${entry.name}/${subEntry.name}`,
              path: subDisplayPath,
              type: "git",
            });
          }
        }
      } else {
        // It's just a regular folder - but we still want to show it!
        allProjects.push({
          name: entry.name,
          path: displayPath,
          type: "folder",
        });
      }
    }

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
