/**
 * Terminal Server
 *
 * WebSocket server providing terminal functionality for the Daax workbench.
 * This is the main entry point that orchestrates the various modules:
 *
 * - config/: Server configuration and constants
 * - docker/: Docker image management and auth paths
 * - recording/: Terminal session recording
 * - sessions/: PTY and session management
 * - handlers/: WebSocket message and connection handling
 */

import { WebSocketServer } from "ws";
import { existsSync, accessSync, statSync, constants as fsConstants } from "fs";

// Configuration
import { PORT, HOST, HOST_WORKSPACE_PATH } from "./config/constants";
import { WS_TICKET_SUBPROTOCOL } from "../lib/ws-ticket-protocol";

// Docker/Auth initialization
import {
  initializeClaudeAuthDir,
  initializeOpenCodeAuthDir,
} from "./docker/auth-paths";
import { DEFAULT_CONTAINER_IMAGE } from "./docker/image-manager";

// Recording initialization
import { initializeRecordingsDir } from "./recording/recorder";

// Handlers
import { registerGlobalErrorHandlers } from "./handlers/error-handler";
import { registerSignalHandlers } from "./handlers/signal-handler";
import { handleConnection, setAuthPaths } from "./handlers/connection-handler";

// Initialize BacklogServer integration
import "./startup";

// =============================================================================
// INITIALIZATION
// =============================================================================

// Register global error handlers first (catches startup errors too)
registerGlobalErrorHandlers();

/**
 * Boot-time Docker-socket reachability preflight (#185).
 *
 * The container runs as the non-root `node` user and reaches the Docker socket
 * by GROUP membership (compose `group_add: ${DOCKER_GID}`). If DOCKER_GID is
 * wrong (e.g. a bare `docker compose up` with it unset on a host whose socket
 * GID != the 999 default), the socket is mounted but inaccessible — spawns would
 * fail only when first triggered, with no boot signal. Fail LOUD at boot instead.
 *
 * Cannot false-positive a healthy host: it only enforces in container mode
 * (HOST_WORKSPACE_PATH set) — host-dev may legitimately use `sudo docker` — it
 * skips remote (tcp) daemons, and it uses access(2) which honors the process's
 * real uid/gid + supplementary groups exactly as the kernel does. A socket that
 * is simply not mounted is a tolerated (non-spawning) config: warn, don't crash.
 */
function preflightDockerSocket(): void {
  if (!HOST_WORKSPACE_PATH) return; // host-dev / non-container: skip

  const dockerHost = process.env.DOCKER_HOST || "/var/run/docker.sock";
  if (/^(tcp|https?):\/\//.test(dockerHost)) return; // remote daemon: not group-gated
  const socketPath = dockerHost.startsWith("unix://")
    ? dockerHost.slice("unix://".length)
    : dockerHost;

  if (!existsSync(socketPath)) {
    console.warn(
      `[Terminal Server] Docker socket ${socketPath} is not present; container ` +
        "spawning will be unavailable. Mount /var/run/docker.sock to enable it.",
    );
    return;
  }

  try {
    accessSync(socketPath, fsConstants.R_OK | fsConstants.W_OK);
  } catch {
    let requiredGid: string;
    try {
      requiredGid = String(statSync(socketPath).gid);
    } catch {
      requiredGid = `<run: stat -c '%g' ${socketPath}>`;
    }
    const groups =
      typeof process.getgroups === "function"
        ? process.getgroups().join(",")
        : "unknown";
    console.error(
      `[Terminal Server] FATAL: the Docker socket ${socketPath} exists but is NOT ` +
        `accessible by this process (uid=${process.getuid?.() ?? "?"}, ` +
        `gid=${process.getgid?.() ?? "?"}, groups=${groups}).\n` +
        "This container runs as the non-root 'node' user (UID 1000) and reaches the " +
        "socket by GROUP membership, so DOCKER_GID must equal the host socket's group.\n" +
        `  Required: DOCKER_GID=${requiredGid}   (host: stat -c '%g' ${socketPath} on Linux; stat -f '%g' ${socketPath} on macOS/BSD)\n` +
        "  A bare `docker compose up` needs `export DOCKER_GID=$(stat -c '%g' " +
        `${socketPath})\` first (Linux) or \`export DOCKER_GID=$(stat -f '%g' ` +
        `${socketPath})\` (macOS/BSD); rebuild.sh and deploy-local.sh derive it automatically.`,
    );
    process.exit(1);
  }
}

// Fail loud at boot if the socket is mounted but unreachable (wrong DOCKER_GID).
preflightDockerSocket();

// Initialize Claude auth directory (exits on failure - required)
const claudeAuth = initializeClaudeAuthDir();

// Initialize OpenCode auth directory (non-fatal - optional)
const openCodeAuth = initializeOpenCodeAuthDir();

// Pass auth paths to connection handler
setAuthPaths(claudeAuth.hostPath, openCodeAuth.hostPath);

// Initialize recordings directory
initializeRecordingsDir();

// =============================================================================
// WEBSOCKET SERVER
// =============================================================================

// handleProtocols echoes back ONLY the ticket subprotocol name (never the
// token) when the client offers it (F1b, issue #95). Returning false when it is
// absent leaves the connection without a negotiated subprotocol, which is fine
// for the loopback/forwarded-identity paths that send no subprotocol.
const wss = new WebSocketServer({
  port: PORT,
  host: HOST,
  handleProtocols: (protocols: Set<string>) =>
    protocols.has(WS_TICKET_SUBPROTOCOL) ? WS_TICKET_SUBPROTOCOL : false,
});

console.log(`Terminal WebSocket server running on ws://${HOST}:${PORT}`);
console.log(`Default container image: ${DEFAULT_CONTAINER_IMAGE}`);

// Startup posture warnings (F1b, #95).
// Containers reach this server through Docker's published port, so the TCP peer
// is the bridge gateway (not loopback) — the loopback bypass/forwarded path do
// NOT apply in containers, which therefore require the bearer-ticket path and
// thus DAAX_WS_TOKEN_SECRET. Flag the footgun where a secret is set but strict
// auth is off while bound to all interfaces: tickets can then be minted by the
// non-strict LOCAL_OPERATOR, so safety depends on a trusted network (tailnet ACL).
if (
  HOST === "0.0.0.0" &&
  process.env.DAAX_WS_TOKEN_SECRET &&
  process.env.DAAX_REQUIRE_AUTH !== "1"
) {
  console.warn(
    "[ws-auth] Terminal server is bound to 0.0.0.0 with DAAX_WS_TOKEN_SECRET set " +
      "but DAAX_REQUIRE_AUTH unset: WS tickets can be minted without authentication " +
      "(non-strict LOCAL_OPERATOR). Only safe behind a trusted tailnet ACL — set " +
      "DAAX_REQUIRE_AUTH=1 (with Traefik/Pocket ID) for any untrusted exposure.",
  );
}

// Handle new connections
wss.on("connection", handleConnection);

// Register signal handlers for graceful shutdown
registerSignalHandlers(wss);
