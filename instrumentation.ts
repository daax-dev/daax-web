/**
 * Next.js Instrumentation
 * Runs on server startup before first request
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  // Only run on Node.js runtime (not Edge runtime)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initializeBacklogStore } =
      await import("@/server/backlog-multi-store");
    const { setBacklogHealth } = await import("@/lib/backlog/health");

    // Get workspace path from environment variable
    // In container mode: /workspace exists (mounted from host)
    // In host mode: fall back to ~/prj expanded via os.homedir()
    const { existsSync } = await import("fs");
    const { join } = await import("path");
    const { homedir } = await import("os");

    let workspacePath: string;
    if (process.env.WORKSPACE_PATH) {
      workspacePath = process.env.WORKSPACE_PATH;
    } else if (process.env.DAAX_WORKSPACE) {
      workspacePath = process.env.DAAX_WORKSPACE;
    } else if (existsSync("/workspace")) {
      // Container mode - /workspace is mounted
      workspacePath = "/workspace";
    } else {
      // Host mode - use ~/prj
      workspacePath = join(homedir(), "prj");
    }

    console.log("[Instrumentation] Starting server initialization...");

    try {
      await initializeBacklogStore(workspacePath);
      setBacklogHealth(true);
      console.log("[Instrumentation] Server initialization complete");
    } catch (error) {
      const initError =
        error instanceof Error ? error : new Error(String(error));
      setBacklogHealth(false, initError);
      console.error("[Instrumentation] Server initialization failed:", error);
      console.warn(
        "[Instrumentation] Backlog features will be unavailable. Check /api/health/backlog for status.",
      );
      // Design decision: No automatic retry here for several reasons:
      // 1. initializeBacklogStore has race condition protection and is safe to call multiple times if a manual or future on-demand retry path is added
      // 2. Automatic retry delays would block server startup, degrading UX
      // 3. Persistent failures (e.g., missing workspace) shouldn't be retried silently
      // 4. Health status is tracked - monitoring can detect and alert on failures
      // Don't throw - allow server to start even if backlog init fails
    }
  }
}
