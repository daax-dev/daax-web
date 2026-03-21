/**
 * Daax Server Startup
 * Coordinates startup of terminal server and backlog server
 */

import { backlogServer } from "./backlog-server";
import { getSettings } from "../lib/settings";
import { join, sep } from "path";
import { existsSync } from "fs";
import { expandPath } from "../lib/path-utils";

/**
 * Initialize BacklogServer if a default project is configured
 */
async function initializeBacklogServer(): Promise<void> {
  try {
    const settings = getSettings();

    // Check if we have a default project configured
    // This could come from settings, environment, or last used project
    const defaultProject =
      process.env.DEFAULT_PROJECT || settings.defaultProject;

    if (!defaultProject || defaultProject.trim() === "") {
      console.log(
        "[Startup] No default project configured - BacklogServer will start on demand",
      );
      return;
    }

    // Validate default project name to prevent path traversal
    // Only allow simple project identifiers without path separators or parent directory segments
    // Use path.sep for platform-appropriate separator check
    if (defaultProject.includes("..") || defaultProject.includes(sep)) {
      console.warn(
        `[Startup] Ignoring invalid default project value due to potential path traversal: ${defaultProject}`,
      );
      return;
    }

    // Build project path
    const basePath = expandPath(settings.basePath || "~/prj");
    const projectPath = join(basePath, defaultProject);

    // Verify project exists
    if (!existsSync(projectPath)) {
      console.warn(
        `[Startup] Default project path does not exist: ${projectPath}`,
      );
      return;
    }

    // Check if backlog is initialized
    const backlogConfigPath = join(
      projectPath,
      "backlog",
      ".backlog",
      "config.json",
    );
    if (!existsSync(backlogConfigPath)) {
      console.log(
        `[Startup] Backlog not initialized for ${defaultProject} - skipping auto-start`,
      );
      return;
    }

    // Start BacklogServer
    const port = settings.backlogPort || 6420;
    console.log(
      `[Startup] Starting BacklogServer for ${defaultProject} on port ${port}...`,
    );

    await backlogServer.start({
      port,
      projectPath,
      openBrowser: false,
    });

    console.log(`[Startup] BacklogServer started successfully`);
  } catch (error) {
    console.error("[Startup] Failed to start BacklogServer:", error);
    // Don't fail the entire startup - backlog server is optional
  }
}

/**
 * Graceful shutdown handler
 * Fix #9: Don't call process.exit() - let the process exit naturally
 * to allow other cleanup handlers to run
 */
async function shutdown(signal: string): Promise<void> {
  console.log(`\n[Startup] Received ${signal}, shutting down...`);

  try {
    // Stop BacklogServer if running
    const status = backlogServer.getStatus();
    if (status.running) {
      console.log("[Startup] Stopping BacklogServer...");
      await backlogServer.stop();
    }

    console.log("[Startup] Shutdown complete");
    // Fix #9: Don't call process.exit() - let other handlers complete
    // The process will exit naturally when all cleanup is done
  } catch (error) {
    console.error("[Startup] Error during shutdown:", error);
    // Still don't force exit - log the error and let process continue cleanup
  }
}

// NOTE: Signal handlers (SIGINT/SIGTERM) are now managed by terminal-server.ts
// to avoid conflicts between multiple handlers. terminal-server.ts imports and calls
// the shutdown() function directly during its graceful shutdown.
// See terminal-server.ts gracefulShutdown() function.

// Initialize when this module is imported by another module (e.g., terminal-server)
// When require.main !== module, this file is being imported (not run directly via `node startup.ts`)
// We only want initialization when imported, not when executed directly for testing
if (require.main !== module) {
  initializeBacklogServer().catch((error) => {
    console.error("[Startup] Initialization failed:", error);
  });
}

export { initializeBacklogServer, shutdown };
