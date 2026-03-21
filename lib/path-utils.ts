/**
 * Shared path utilities for cross-platform path handling
 */

import { join } from "path";
import { homedir } from "os";

/**
 * Expand ~ to home directory for cross-platform compatibility
 * Uses path.join for proper separator handling on Windows
 */
export function expandPath(path: string): string {
  if (path === "~") {
    return homedir();
  }
  // Only expand a leading "~/", preserving the rest of the path.
  // Use path.join for cross-platform separator handling.
  if (path.startsWith("~/")) {
    return join(homedir(), path.substring(2));
  }
  return path;
}

/**
 * Validate a port number is within acceptable range
 * @returns true if port is valid, false otherwise
 */
export function isValidPort(port: unknown): port is number {
  return (
    typeof port === "number" &&
    Number.isInteger(port) &&
    port >= 1024 &&
    port <= 65535
  );
}
