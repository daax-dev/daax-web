/**
 * Signal Handlers
 *
 * Handles process signals for graceful shutdown.
 */

import { shutdown as shutdownBacklogServer } from "../startup";
import { SHUTDOWN_TIMEOUT_MS } from "../config/constants";
import { getAllSessions, getSessionCount } from "../sessions/session-manager";
import { WebSocketServer } from "ws";

// Track if shutdown is intentional (from SIGINT/SIGTERM)
let isIntentionalShutdown = false;

/**
 * Graceful shutdown helper - async to allow BacklogServer cleanup
 */
export async function gracefulShutdown(
  signal: string,
  wss: WebSocketServer,
): Promise<void> {
  if (isIntentionalShutdown) {
    console.log(
      `[Terminal Server] ${signal} received but already shutting down`,
    );
    return;
  }
  isIntentionalShutdown = true;
  console.log(
    `\n[Terminal Server] ${signal} received, shutting down gracefully...`,
  );
  console.log(`[Terminal Server] Active sessions: ${getSessionCount()}`);

  // First, shutdown BacklogServer if running
  try {
    console.log("[Terminal Server] Shutting down BacklogServer...");
    await shutdownBacklogServer(signal);
    console.log("[Terminal Server] BacklogServer shutdown complete");
  } catch (e) {
    console.error("[Terminal Server] Error shutting down BacklogServer:", e);
  }

  // Then close all terminal sessions
  const sessions = getAllSessions();
  for (const [sessionId, session] of sessions.entries()) {
    try {
      console.log(`[Terminal Server] Closing session ${sessionId}`);
      session.pty.kill();
      session.ws.close();
    } catch (e) {
      console.error(`[Terminal Server] Error closing session ${sessionId}:`, e);
    }
  }

  // Finally close WebSocket server
  try {
    wss.close(() => {
      console.log("[Terminal Server] WebSocket server closed");
      process.exit(0);
    });
    // Timeout in case wss.close() callback never fires (uses shared constant SHUTDOWN_TIMEOUT_MS)
    // unref() for consistency with other shutdown timeouts - allows clean exit
    setTimeout(() => {
      console.log(
        "[Terminal Server] Timeout waiting for WebSocket close, exiting",
      );
      process.exit(0);
    }, SHUTDOWN_TIMEOUT_MS).unref();
  } catch (e) {
    console.error("[Terminal Server] Error closing WebSocket server:", e);
    process.exit(1);
  }
}

/**
 * Register signal handlers for graceful shutdown
 */
export function registerSignalHandlers(wss: WebSocketServer): void {
  // Ignore SIGHUP - this is sent when a controlling terminal closes
  // We don't want PTY exits to bring down the server
  process.on("SIGHUP", () => {
    console.log(
      "[Terminal Server] Received SIGHUP (ignoring - PTY child exit)",
    );
    // Do NOT exit - just ignore this signal
  });

  // Log when process is about to exit (helps debug unexpected exits)
  process.on("beforeExit", (code) => {
    console.log(`[Terminal Server] beforeExit event with code: ${code}`);
  });

  process.on("exit", (code) => {
    console.log(
      `[Terminal Server] exit event with code: ${code}, intentional: ${isIntentionalShutdown}`,
    );
  });

  // Graceful shutdown - only on SIGINT (Ctrl+C) or SIGTERM
  // Use void to indicate we don't need to await the promise in signal handlers
  process.on("SIGINT", () => {
    gracefulShutdown("SIGINT", wss).catch((err) => {
      console.error("[Terminal Server] Error during SIGINT shutdown:", err);
      process.exit(1);
    });
  });

  process.on("SIGTERM", () => {
    gracefulShutdown("SIGTERM", wss).catch((err) => {
      console.error("[Terminal Server] Error during SIGTERM shutdown:", err);
      process.exit(1);
    });
  });
}
