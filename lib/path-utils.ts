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
 * Map a "~/"-prefixed path onto the host workspace root when the tilde segment
 * names the directory that is bind-mounted at /workspace.
 *
 * Container mode only. `hostWorkspacePath` is the HOST path behind /workspace
 * (e.g. "/home/jpoley/jarvis"), so "~/jarvis" and "~/jarvis/foo" refer to that
 * same host tree. Expanding "~" with expandPath() inside the container would
 * instead yield the CONTAINER's home ("/home/node/jarvis") — meaningless as a
 * bind-mount source, and a path that can never satisfy the #186 mount
 * confinement check against "/workspace".
 *
 * Deliberately takes the workspace root as a parameter (rather than reading
 * HOST_WORKSPACE_PATH or homedir()) so it stays pure: no ambient state to mock
 * in tests, and no way for the host and container home namespaces to collapse
 * into one and mask the very mismatch this guards against.
 *
 * This is the same mapping translatePath() performs in lib/worktree-manager.ts,
 * applied in the opposite direction (tilde -> host rather than host -> container).
 *
 * @param path - The requested path, possibly "~/"-prefixed
 * @param hostWorkspacePath - HOST path bind-mounted at /workspace ("" in host mode)
 * @returns the host path, or null when the mapping does not apply: host mode,
 *          a non-tilde path, or a tilde segment that is not the workspace dir
 *          (e.g. "~/jarvis2" for workspace "jarvis")
 */
export function tildeToHostWorkspace(
  path: string,
  hostWorkspacePath: string,
): string | null {
  if (!hostWorkspacePath || !path.startsWith("~/")) {
    return null;
  }
  // Drop trailing slashes so "/home/jpoley/jarvis/" still yields basename "jarvis".
  const hostRoot = hostWorkspacePath.replace(/\/+$/, "");
  const workspaceName = hostRoot.split("/").pop() || "";
  if (!workspaceName) {
    return null;
  }
  const tildePrefix = `~/${workspaceName}`;
  if (path === tildePrefix) {
    return hostRoot;
  }
  // Full-segment match only, so "~/jarvis2" does not match workspace "jarvis".
  if (path.startsWith(tildePrefix + "/")) {
    return hostRoot + path.slice(tildePrefix.length);
  }
  return null;
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
