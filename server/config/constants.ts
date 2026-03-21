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

/**
 * Helper to validate port number is in valid range (1-65535)
 */
function isValidPort(portStr: string | undefined): boolean {
  if (!portStr) return true; // No port is valid (uses default)
  const port = parseInt(portStr, 10);
  return !isNaN(port) && port >= 1 && port <= 65535;
}

/**
 * Check if an origin is allowed (localhost, Tailscale IPs, production domains)
 * When running in container, the external port may differ from internal port
 */
export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true; // Allow no origin (direct connections)

  // Extract port from origin for validation
  const portMatch = origin.match(/:(\d+)$/);
  const port = portMatch?.[1];
  if (!isValidPort(port)) return false;

  // Allow any localhost origin (different ports for container mapping)
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;

  // Allow Tailscale IPs (100.64.0.0/10 = 100.64.0.0 – 100.127.255.255)
  // This is the CGNAT range used by Tailscale, not the full 100/8 block
  // Octets 3 & 4 are validated to 0-255 range
  if (/^https?:\/\/100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\.(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])\.(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])(:\d{1,5})?$/.test(origin)) return true;

  // Allow production domains (daax.HOSTNAME.poley.dev)
  // This regex matches the Origin header (scheme + host), not full URLs with paths
  // Optional :443 port for robustness when explicitly specified in URL
  if (/^https:\/\/daax\.[\w-]+\.poley\.dev(?::443)?$/.test(origin)) return true;

  return false;
}
