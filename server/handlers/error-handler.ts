/**
 * Global Error Handler
 *
 * Handles uncaught exceptions and unhandled rejections with a sliding
 * window approach to prevent transient errors from accumulating.
 */

import { shutdown as shutdownBacklogServer } from "../startup";
import {
  MAX_GLOBAL_ERRORS,
  ERROR_WINDOW_MS,
  SHUTDOWN_TIMEOUT_MS,
} from "../config/constants";

// Global error tracking with sliding window
const errorTimestamps: number[] = [];

// Guard to prevent multiple shutdown attempts
let isShuttingDown = false;

/**
 * Reset error tracking state (for testing only)
 * @internal
 */
export function __resetErrorTimestamps(): void {
  errorTimestamps.length = 0;
  isShuttingDown = false;
}

/**
 * Handle global errors (uncaught exceptions and unhandled rejections)
 * Uses a sliding window to only count errors within ERROR_WINDOW_MS.
 * This prevents transient errors from accumulating over hours/days toward shutdown.
 */
export function handleGlobalError(
  type: "uncaughtException" | "unhandledRejection",
  error: unknown,
): void {
  const now = Date.now();

  // Add current error timestamp
  errorTimestamps.push(now);

  // Remove timestamps outside the sliding window
  while (
    errorTimestamps.length > 0 &&
    errorTimestamps[0] < now - ERROR_WINDOW_MS
  ) {
    errorTimestamps.shift();
  }

  const recentErrorCount = errorTimestamps.length;
  const prefix = "[Terminal Server] " + type;
  console.error(
    `${prefix} (recent errors in last ${ERROR_WINDOW_MS / 1000}s: ${recentErrorCount}):`,
    error,
  );

  if (recentErrorCount < MAX_GLOBAL_ERRORS) {
    // Preserve existing behavior: try to keep running for infrequent errors
    return;
  }

  // Guard: Only initiate shutdown once to prevent multiple timers/cleanup calls
  if (isShuttingDown) {
    console.error(
      "[Terminal Server] Shutdown already in progress, ignoring additional error.",
    );
    return;
  }
  isShuttingDown = true;

  console.error(
    "[Terminal Server] Too many global errors, initiating graceful shutdown and exiting.",
  );

  // Set shutdown timeout BEFORE starting async cleanup to avoid race condition
  // If cleanup completes first, we'll clear the timeout; otherwise, force exit after timeout
  const shutdownTimer = setTimeout(() => {
    console.error("[Terminal Server] Graceful shutdown timeout, forcing exit.");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  // unref() allows process to exit if this is the only timer
  shutdownTimer.unref();

  // Attempt graceful cleanup before exiting
  shutdownBacklogServer("FATAL_ERROR")
    .catch((shutdownError) => {
      console.error(
        "[Terminal Server] Error during graceful shutdown:",
        shutdownError,
      );
    })
    .finally(() => {
      // Clear timeout since we're exiting anyway
      clearTimeout(shutdownTimer);
      // Exit to avoid running in a potentially unsafe state
      process.exit(1);
    });
}

/**
 * Register global error handlers
 */
export function registerGlobalErrorHandlers(): void {
  process.on("uncaughtException", (err) => {
    handleGlobalError("uncaughtException", err);
  });

  process.on("unhandledRejection", (reason) => {
    handleGlobalError("unhandledRejection", reason);
  });
}
