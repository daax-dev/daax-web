/**
 * Project Cleanup Module
 *
 * Handles stopping services when switching projects based on user settings.
 * Services that can be stopped:
 * - Code Server (Docker container)
 * - Backlog Server (subprocess)
 * - Terminal/AI Sessions (WebSocket connections)
 */

import { toast } from "sonner";
import { getSettings } from "./settings";
import { stopServer as stopBacklogServer } from "./backlog/api-client";

/**
 * Stop the code-server Docker container
 */
export async function stopCodeServer(): Promise<boolean> {
  try {
    const res = await fetch("/api/code-server", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "stop" }),
    });
    return res.ok;
  } catch (error) {
    console.error("[project-cleanup] Failed to stop code-server:", error);
    return false;
  }
}

/**
 * Callbacks for stopping services that require React context access
 */
export interface CleanupCallbacks {
  stopAllTerminals?: () => void;
}

/**
 * Perform cleanup actions based on user settings when switching projects.
 * Called before the active project state is updated.
 *
 * @param callbacks - Functions to call for context-dependent cleanup (like stopping terminals)
 */
export async function cleanupOnProjectSwitch(
  callbacks: CleanupCallbacks,
): Promise<void> {
  const settings = getSettings();

  // Check if any cleanup is needed
  const needsCleanup =
    settings.projectSwitchStopCodeServer ||
    settings.projectSwitchStopBacklog ||
    settings.projectSwitchStopTerminals;

  if (!needsCleanup) {
    return;
  }

  // Stop code-server if enabled
  if (settings.projectSwitchStopCodeServer) {
    try {
      const success = await stopCodeServer();
      if (success) {
        toast.success("Code Server stopped");
      }
    } catch (error) {
      console.error("[project-cleanup] Error stopping code server:", error);
    }
  }

  // Stop backlog server if enabled
  if (settings.projectSwitchStopBacklog) {
    try {
      await stopBacklogServer();
      toast.success("Backlog Server stopped");
    } catch (error) {
      console.error("[project-cleanup] Error stopping backlog server:", error);
    }
  }

  // Stop all terminal sessions if enabled
  if (settings.projectSwitchStopTerminals && callbacks.stopAllTerminals) {
    try {
      callbacks.stopAllTerminals();
      toast.success("Terminal sessions stopped");
    } catch (error) {
      console.error("[project-cleanup] Error stopping terminals:", error);
    }
  }
}
