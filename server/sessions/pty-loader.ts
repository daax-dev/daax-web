/**
 * PTY Loader
 *
 * Handles optional loading of node-pty dependency with graceful fallback.
 * Defers error logging until getPty()/isPtyAvailable() is first called
 * to avoid noisy import-time errors in tests or non-terminal code paths.
 */

import { NodePtyModule } from "./types";

// Runtime check for optional node-pty dependency
let pty: NodePtyModule | null = null;
let loadAttempted = false;
let loadError: unknown = null;

function ensureLoaded(): void {
  if (loadAttempted) return;
  loadAttempted = true;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    pty = require("node-pty");
  } catch (err) {
    loadError = err;
    pty = null;
  }
}

/**
 * Get the node-pty module if available, or null if not installed.
 * Logs an error on first call if node-pty is unavailable.
 */
export function getPty(): NodePtyModule | null {
  ensureLoaded();
  if (!pty && loadError) {
    console.warn(
      "[Terminal Server] node-pty is not installed. Terminal functionality will be unavailable.\n" +
        "To enable terminal support, install node-pty:\n" +
        "  bun add node-pty\n" +
        "Note: node-pty requires build tools (python, make, g++) and may fail on some systems.",
    );
    // Only log once
    loadError = null;
  }
  return pty;
}

/**
 * Check if node-pty is available.
 */
export function isPtyAvailable(): boolean {
  ensureLoaded();
  return pty !== null;
}
