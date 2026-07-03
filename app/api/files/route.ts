import { NextResponse } from "next/server";
import { readdir, readFile, stat, realpath } from "fs/promises";
import { existsSync } from "fs";
import { join, relative, basename } from "path";
import { requireAuth } from "@/lib/auth";

// Maximum directory depth to prevent infinite recursion and performance issues
const MAX_DEPTH = 10;

// Get workspace path
function getWorkspacePath(): string {
  if (existsSync("/workspace")) {
    return "/workspace";
  }
  // Fall back to prj directory for host mode
  const prjPath = join(process.env.HOME || "", "prj");
  if (existsSync(prjPath)) {
    return prjPath;
  }
  return process.cwd();
}

// Discover all projects with .logs directories
async function discoverProjectLogs(
  workspacePath: string,
): Promise<Map<string, string>> {
  const projectLogs = new Map<string, string>();

  // Scan up to 3 levels deep for .logs directories
  const scanDir = async (
    dir: string,
    depth: number,
    projectName: string = "",
  ) => {
    if (depth > 3) return;

    try {
      const entries = await readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name.startsWith(".") && entry.name !== ".logs") continue;

        const fullPath = join(dir, entry.name);

        if (entry.name === ".logs") {
          // Found a .logs directory - use parent as project name
          const name = projectName || basename(dir);
          projectLogs.set(name, fullPath);
        } else {
          // Recurse into subdirectory
          const newProjectName = projectName
            ? `${projectName}/${entry.name}`
            : entry.name;
          await scanDir(fullPath, depth + 1, newProjectName);
        }
      }
    } catch {
      // Skip directories we can't read
    }
  };

  await scanDir(workspacePath, 0);
  return projectLogs;
}

interface FileInfo {
  name: string;
  path: string;
  recordCount: number;
  lastModified: string;
  content: string;
}

interface FileReadError {
  path: string;
  error: string;
}

interface FindResult {
  files: FileInfo[];
  errors: FileReadError[];
}

/**
 * Recursively find all .jsonl files in directory with depth limit and symlink cycle detection
 * @param dir - Directory to search
 * @param baseDir - Base directory for relative path calculation
 * @param depth - Current recursion depth (default 0)
 * @param visitedPaths - Set of already visited real paths for cycle detection
 * @returns Promise containing files found and any errors encountered
 */
async function findJsonlFiles(
  dir: string,
  baseDir: string,
  depth: number = 0,
  visitedPaths: Set<string> = new Set(),
): Promise<FindResult> {
  const files: FileInfo[] = [];
  const errors: FileReadError[] = [];

  // Depth limit check to prevent stack overflow and performance issues
  if (depth > MAX_DEPTH) {
    errors.push({
      path: dir,
      error: `Maximum directory depth (${MAX_DEPTH}) exceeded`,
    });
    return { files, errors };
  }

  try {
    // Resolve real path for symlink cycle detection
    const realDir = await realpath(dir);
    if (visitedPaths.has(realDir)) {
      errors.push({
        path: dir,
        error: "Symlink cycle detected, skipping directory",
      });
      return { files, errors };
    }
    visitedPaths.add(realDir);

    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        // Recursively search subdirectories with incremented depth
        const subResult = await findJsonlFiles(
          fullPath,
          baseDir,
          depth + 1,
          visitedPaths,
        );
        files.push(...subResult.files);
        errors.push(...subResult.errors);
      } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        try {
          const fileStat = await stat(fullPath);
          const content = await readFile(fullPath, "utf-8");

          // Count non-empty lines (records)
          const lines = content.split("\n").filter((line) => line.trim());

          // Use relative path from base directory for display
          const relativePath = relative(baseDir, fullPath);

          files.push({
            name: relativePath,
            path: relativePath,
            recordCount: lines.length,
            lastModified: fileStat.mtime.toISOString(),
            content,
          });
        } catch (err) {
          const errorMessage =
            err instanceof Error ? err.message : "Unknown error";
          console.error(`Error reading file ${fullPath}:`, err);
          errors.push({
            path: relative(baseDir, fullPath),
            error: errorMessage,
          });
        }
      }
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    console.error(`Error reading directory ${dir}:`, err);
    errors.push({
      path: relative(baseDir, dir) || dir,
      error: errorMessage,
    });
  }

  return { files, errors };
}

export async function GET(request: Request) {
  // Require authentication before any filesystem access. These .jsonl logs can
  // contain tokens, transcripts, and decision records, so an unauthenticated
  // request must be rejected before the recursive walk runs (#194).
  const auth = await requireAuth();
  if (!auth.authenticated) {
    return auth.response;
  }

  const { searchParams } = new URL(request.url);
  const projectFilter = searchParams.get("project"); // Optional: filter by project name

  // Validate projectFilter to prevent path traversal attacks
  // Allow "/" for nested project names (e.g., "org/repo") but block dangerous patterns
  if (projectFilter) {
    // Normalize the path first to catch edge cases
    const normalized = projectFilter
      .replace(/\/+/g, "/") // Collapse multiple consecutive slashes
      .replace(/^\/+/, "") // Remove leading slashes
      .replace(/\/+$/, ""); // Remove trailing slashes

    // Block path traversal sequences
    if (
      normalized.includes("..") ||
      normalized.includes("\\") ||
      projectFilter !== normalized // Reject if normalization changed the input
    ) {
      return NextResponse.json(
        { error: "Invalid project name: path traversal sequences not allowed" },
        { status: 400 },
      );
    }
  }

  try {
    const workspacePath = getWorkspacePath();
    const projectLogs = await discoverProjectLogs(workspacePath);

    console.log(
      `[files API] Found ${projectLogs.size} projects with .logs directories`,
    );

    // Build response with project structure
    const projects: Record<
      string,
      { path: string; files: FileInfo[]; errors: FileReadError[] }
    > = {};

    for (const [projectName, logsPath] of projectLogs) {
      // Skip if filtering by project and this isn't it
      if (projectFilter && projectName !== projectFilter) continue;

      const result = await findJsonlFiles(logsPath, logsPath);
      result.files.sort((a, b) => a.path.localeCompare(b.path));

      projects[projectName] = {
        path: logsPath,
        files: result.files,
        errors: result.errors,
      };
    }

    // Also return flat file list for backwards compatibility
    const allFiles: FileInfo[] = [];
    const allErrors: FileReadError[] = [];

    for (const [projectName, data] of Object.entries(projects)) {
      for (const file of data.files) {
        allFiles.push({
          ...file,
          name: `${projectName}/${file.name}`,
          path: `${projectName}/${file.path}`,
        });
      }
      allErrors.push(
        ...data.errors.map((e) => ({ ...e, path: `${projectName}/${e.path}` })),
      );
    }

    return NextResponse.json({
      projects,
      projectList: Object.keys(projects).sort(),
      // Backwards compatible flat list
      files: allFiles,
      errors: allErrors,
      ...(allErrors.length > 0 && {
        warning: `${allErrors.length} file(s) could not be read`,
      }),
    });
  } catch (error) {
    console.error("Error reading logs:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      {
        error: "Failed to read files",
        details: errorMessage,
        projects: {},
        projectList: [],
        files: [],
        errors: [],
      },
      { status: 500 },
    );
  }
}
