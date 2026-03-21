import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs/promises";
import * as path from "path";

interface SavedContainer {
  projectPath: string;
  name: string;
  image?: string;
  features: number;
  extensions: number;
  modifiedAt: string;
}

/**
 * API to list devcontainers found in projects
 *
 * GET /api/devcontainers/list
 */
export async function GET(_request: NextRequest) {
  try {
    // Get basePath from environment or default
    const basePath =
      process.env.DAAX_BASE_PATH || process.env.HOME
        ? path.join(process.env.HOME || "", "prj")
        : "/workspace";

    const containers: SavedContainer[] = [];

    // Scan directories for .devcontainer folders
    await scanForDevContainers(basePath, containers, basePath, 3);

    return NextResponse.json({
      containers,
      basePath,
    });
  } catch (error) {
    console.error("[API] Failed to list devcontainers:", error);
    return NextResponse.json(
      {
        error: "Failed to list devcontainers",
        message: error instanceof Error ? error.message : "Unknown error",
        containers: [],
      },
      { status: 500 },
    );
  }
}

/**
 * Recursively scan for .devcontainer directories
 */
async function scanForDevContainers(
  dir: string,
  containers: SavedContainer[],
  basePath: string,
  maxDepth: number,
): Promise<void> {
  if (maxDepth <= 0) return;

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      // Skip hidden directories (except .devcontainer) and common non-project dirs
      if (entry.name.startsWith(".") && entry.name !== ".devcontainer")
        continue;
      if (
        [
          "node_modules",
          "vendor",
          "target",
          "build",
          "dist",
          "__pycache__",
        ].includes(entry.name)
      )
        continue;

      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (entry.name === ".devcontainer") {
          // Found a devcontainer - parse it
          const container = await parseDevContainer(dir, basePath);
          if (container) {
            containers.push(container);
          }
        } else {
          // Recurse into subdirectory
          await scanForDevContainers(
            fullPath,
            containers,
            basePath,
            maxDepth - 1,
          );
        }
      }
    }
  } catch (error) {
    // Silently ignore permission errors, etc.
    console.debug(`[API] Could not scan ${dir}:`, error);
  }
}

/**
 * Parse a devcontainer.json file
 */
async function parseDevContainer(
  projectDir: string,
  basePath: string,
): Promise<SavedContainer | null> {
  const devcontainerPath = path.join(
    projectDir,
    ".devcontainer",
    "devcontainer.json",
  );

  try {
    const content = await fs.readFile(devcontainerPath, "utf-8");
    const config = JSON.parse(content);
    const stats = await fs.stat(devcontainerPath);

    // Calculate relative path from basePath
    const relativePath = path.relative(basePath, projectDir);

    return {
      projectPath: relativePath || projectDir,
      name: config.name || relativePath || "Unknown",
      image: config.image,
      features: config.features ? Object.keys(config.features).length : 0,
      extensions: config.customizations?.vscode?.extensions?.length || 0,
      modifiedAt: stats.mtime.toISOString(),
    };
  } catch (error) {
    console.debug(`[API] Could not parse ${devcontainerPath}:`, error);
    return null;
  }
}
