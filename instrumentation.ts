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

    // Boot RBAC reconcile (F5, #101): project DAAX_ADMIN_USERS onto the identity
    // store under a pg advisory lock so a never-logged-in admin is authorised on
    // first login (no lockout) and stale reconcile grants are pruned. Guarded to
    // when Postgres is configured — host-dev (`bun dev`) without a DB is
    // unaffected and stays usable. Failure is logged, not fatal (fail-open on
    // boot: a failed reconcile must not block the server; enforcement itself
    // fails closed at requireRole time).
    try {
      const { isDbConfigured } = await import("@/lib/db/config");
      if (isDbConfigured()) {
        const { reconcile } = await import("@/lib/rbac/store");
        const plan = await reconcile();
        console.log(
          `[Instrumentation] RBAC reconcile applied: +${plan.userRoleGrantsToAdd.length} grants, ` +
            `-${plan.userRoleGrantsToPrune.length} pruned, ` +
            `+${plan.pendingGrantsToAdd.length} pending, -${plan.pendingGrantsToPrune.length} pending-pruned`,
        );
      } else {
        console.log(
          "[Instrumentation] RBAC reconcile skipped (Postgres not configured).",
        );
      }
    } catch (error) {
      console.error(
        "[Instrumentation] RBAC reconcile failed (non-fatal):",
        error instanceof Error ? error.message : error,
      );
    }

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
