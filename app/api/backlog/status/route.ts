import { NextResponse } from "next/server";
import {
  backlogServer,
  isBacklogInitialized,
  initializeBacklog,
} from "@/server/backlog-server";
import { expandPath, isValidPort } from "@/lib/path-utils";
import { getSettings } from "@/lib/settings";
import { existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

// Default base path for project resolution
const DEFAULT_BASE_PATH = "~/prj";

/**
 * Resolve workspace base path for the current environment.
 *
 * - In container mode: /workspace (where host ~/prj is mounted)
 * - In host mode: expand ~ to actual home directory
 *
 * This mirrors the logic in /api/workspace/route.ts for consistency.
 */
function resolveWorkspacePath(basePath: string): string {
  // Check if we're in a container (workspace mounted at /workspace)
  if (existsSync("/workspace") && process.env.HOST_WORKSPACE_PATH) {
    // Container mode: use /workspace
    // Handle subdirectories if basePath is like ~/prj/ps
    const hostBase = process.env.HOST_WORKSPACE_PATH.replace(
      /^.*\/([^\/]+)$/,
      "~/$1",
    );

    if (basePath.startsWith(hostBase) && basePath.length > hostBase.length) {
      const subdir = basePath.slice(hostBase.length + 1);
      return `/workspace/${subdir}`;
    }

    return "/workspace";
  }

  // Host mode: expand ~ to home directory
  return expandPath(basePath);
}

/**
 * Get the full project path for backlog server subprocess.
 *
 * Unlike code-server which spawns a Docker container (needing HOST mount paths),
 * backlog spawns a subprocess IN THE SAME ENVIRONMENT as Daax.
 */
function getBacklogProjectPath(projectName: string, basePath: string): string {
  const workspacePath = resolveWorkspacePath(basePath);
  return join(workspacePath, projectName);
}

/**
 * GET /api/backlog/status
 * Returns the status of the BacklogServer subprocess
 */
export async function GET() {
  try {
    const status = backlogServer.getStatus();
    const health = status.running
      ? await backlogServer.healthCheck()
      : { healthy: false };

    return NextResponse.json({
      ...status,
      healthy: health.healthy,
    });
  } catch (error) {
    console.error("[Backlog API] Error getting status:", error);
    return NextResponse.json(
      {
        running: false,
        healthy: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

/**
 * POST /api/backlog/status
 * Control the BacklogServer subprocess
 *
 * Body: { action: "start" | "stop" | "restart", port?: number, projectName?: string }
 */
export async function POST(request: Request) {
  // Parse JSON body with explicit error handling
  let body: unknown;
  try {
    body = await request.json();
  } catch (parseError) {
    console.error("[Backlog API] Invalid JSON body:", parseError);
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body === null || typeof body !== "object") {
    return NextResponse.json(
      { error: "Request body must be a JSON object" },
      { status: 400 },
    );
  }

  const { action, port, projectName } = body as {
    action?: string;
    port?: number;
    projectName?: string;
  };

  // Validate action is a string before processing
  if (typeof action !== "string") {
    return NextResponse.json(
      { error: "action is required and must be a string" },
      { status: 400 },
    );
  }

  try {
    switch (action) {
      case "start": {
        if (!projectName) {
          return NextResponse.json(
            { error: "projectName is required for start action" },
            { status: 400 },
          );
        }

        // Security: Reject path traversal attempts
        if (projectName.includes("..")) {
          return NextResponse.json(
            { error: "Invalid project name" },
            { status: 400 },
          );
        }

        // Validate port is a number in acceptable range (1024-65535)
        if (!isValidPort(port)) {
          return NextResponse.json(
            { error: "port must be a number between 1024 and 65535" },
            { status: 400 },
          );
        }

        // Get the project path for the backlog subprocess
        const projectPath = getBacklogProjectPath(
          projectName,
          DEFAULT_BASE_PATH,
        );

        // Detailed logging for debugging
        console.log(`[Backlog API] Environment check:`);
        console.log(
          `  - existsSync("/workspace"): ${existsSync("/workspace")}`,
        );
        console.log(
          `  - HOST_WORKSPACE_PATH: ${process.env.HOST_WORKSPACE_PATH || "not set"}`,
        );
        console.log(`  - homedir(): ${homedir()}`);
        console.log(`[Backlog API] Path resolution:`);
        console.log(`  - projectName: ${projectName}`);
        console.log(`  - basePath: ${DEFAULT_BASE_PATH}`);
        console.log(`  - resolved projectPath: ${projectPath}`);
        console.log(`  - existsSync(projectPath): ${existsSync(projectPath)}`);

        // Verify path exists before starting
        if (!existsSync(projectPath)) {
          console.error(
            `[Backlog API] ERROR: Project path does not exist: ${projectPath}`,
          );
          return NextResponse.json(
            { error: `Project path does not exist: ${projectPath}` },
            { status: 400 },
          );
        }

        // Check if backlog is initialized, auto-init if enabled
        const settings = getSettings();
        const backlogInitialized = isBacklogInitialized(projectPath);
        console.log(`[Backlog API] Backlog initialized: ${backlogInitialized}`);

        if (!backlogInitialized) {
          if (settings.backlogDefaults.autoInit) {
            console.log(
              `[Backlog API] Auto-initializing backlog for ${projectName}...`,
            );
            try {
              // Extract just the project name (last part of path) for init
              const shortName = projectName.split("/").pop() || projectName;
              await initializeBacklog(
                projectPath,
                shortName,
                settings.backlogDefaults,
              );
              console.log(`[Backlog API] Backlog initialized successfully`);
            } catch (initError) {
              console.error(
                `[Backlog API] Failed to initialize backlog:`,
                initError,
              );
              return NextResponse.json(
                {
                  error: `Failed to initialize backlog: ${initError instanceof Error ? initError.message : "Unknown error"}`,
                  hint: "Run 'backlog init' manually in the project directory",
                },
                { status: 500 },
              );
            }
          } else {
            console.log(
              `[Backlog API] Backlog not initialized and autoInit is disabled`,
            );
            return NextResponse.json(
              {
                error: "Backlog not initialized in this project",
                hint: "Run 'backlog init' in the project directory, or enable auto-init in Settings",
              },
              { status: 400 },
            );
          }
        }

        console.log(`[Backlog API] Starting backlog server...`);

        await backlogServer.start({
          port,
          projectPath,
          openBrowser: false,
        });

        console.log(`[Backlog API] Server start command completed`);

        return NextResponse.json({
          success: true,
          message: "BacklogServer started",
          status: backlogServer.getStatus(),
        });
      }

      case "stop": {
        await backlogServer.stop();

        return NextResponse.json({
          success: true,
          message: "BacklogServer stopped",
        });
      }

      case "restart": {
        // If projectName provided, construct full path; otherwise restart with existing config
        if (projectName) {
          if (projectName.includes("..")) {
            return NextResponse.json(
              { error: "Invalid project name" },
              { status: 400 },
            );
          }

          // Get the project path for the backlog subprocess
          const projectPath = getBacklogProjectPath(
            projectName,
            DEFAULT_BASE_PATH,
          );
          console.log(
            `[Backlog API] Restarting server for project: ${projectName} at path: ${projectPath}`,
          );

          await backlogServer.restart(projectPath);
        } else {
          await backlogServer.restart();
        }

        return NextResponse.json({
          success: true,
          message: "BacklogServer restarted",
          status: backlogServer.getStatus(),
        });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 },
        );
    }
  } catch (error) {
    console.error("[Backlog API] Error controlling server:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
