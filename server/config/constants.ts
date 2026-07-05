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
//
// The default agent image is pinned by manifest-list digest (not the mutable
// `:latest` tag) so a compromised/typosquatted upstream push cannot silently
// land arbitrary code in every future agent session (Fable M5 / issue #195).
// This is the top-level manifest-list digest of `jpoley/daax-agents:latest`,
// resolved via `docker buildx imagetools inspect` — it stays multi-arch
// (linux/amd64 + linux/arm64) and can only be advanced by an intentional edit.
// When bumping to a new image, also update PINNED_AGENT_DIGEST in
// scripts/refresh-agent-images.sh and the digest guard in
// tests/server/config/constants.test.ts.
//
// Operators can still override with CLAUDE_CONTAINER_IMAGE (tag or digest).
export const DEFAULT_CONTAINER_IMAGE =
  process.env.CLAUDE_CONTAINER_IMAGE ||
  "jpoley/daax-agents@sha256:2153f137b3f47de007698d1e5f0d31a684cb45a7e1ebc1326f668ee458f55bc5";
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
