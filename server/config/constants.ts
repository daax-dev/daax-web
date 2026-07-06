/**
 * Terminal Server Configuration Constants
 *
 * Centralized configuration values for the terminal server.
 */

import { homedir } from "os";
import { join } from "path";

// Server configuration
export const PORT = parseInt(process.env.TERMINAL_PORT || "4201", 10);
export const HOST = process.env.TERMINAL_HOST || "localhost";

/**
 * Build a base URL for parsing a request's relative URL with `new URL(url, base)`.
 * An IPv6 literal host (e.g. `::`, `::1`, `2001:db8::1`) MUST be bracketed or
 * `new URL("http://::4201")` throws — which would mis-dispatch the connection.
 * IPv4 addresses and hostnames contain no colon and are used verbatim; an
 * already-bracketed host is left untouched.
 */
export function localBaseUrl(host: string, port: number): string {
  const bracketed =
    host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
  return `http://${bracketed}:${port}`;
}

// Error handling configuration
export const MAX_GLOBAL_ERRORS = 10;
export const ERROR_WINDOW_MS = 60000; // 1 minute sliding window
export const SHUTDOWN_TIMEOUT_MS = 5000;

// Docker configuration
export const DEFAULT_CONTAINER_IMAGE =
  process.env.CLAUDE_CONTAINER_IMAGE || "jpoley/daax-agents:latest";
export const FALLBACK_CONTAINER_IMAGE = "daax-agents:local";
export const DOCKER_NETWORK = process.env.DOCKER_NETWORK || "daax-net";

// Host workspace path for volume mounts when running in container
// When Daax runs in a container, we need the HOST path, not the container path
export const HOST_WORKSPACE_PATH = process.env.HOST_WORKSPACE_PATH || "";

// Container's mounted workspace path (maps to HOST_WORKSPACE_PATH)
export const CONTAINER_WORKSPACE_PATH = "/workspace";

// Terminal recordings storage path
export const RECORDINGS_DIR = join(homedir(), ".daax", "recordings");

// Recording buffer configuration
export const BUFFER_FLUSH_INTERVAL_MS = 100; // Flush every 100ms
export const BUFFER_MAX_SIZE = 50; // Or when buffer reaches 50 entries

// Default terminal dimensions
export const DEFAULT_TERMINAL_COLS = 120;
export const DEFAULT_TERMINAL_ROWS = 30;

// Re-export expandPath from shared utilities to avoid duplication
export { expandPath } from "../../lib/path-utils";

// Re-export isAllowedOrigin from the dedicated, dependency-free allowlist module
// (issue #181). The logic was extracted so `middleware.ts` can import the Origin
// check without pulling this file's os/path/homedir + terminal-server constants
// into the per-request middleware bundle. Existing importers keep working
// unchanged via this re-export.
export { isAllowedOrigin } from "./origin-allowlist";
