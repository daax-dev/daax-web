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

// Configuration
import { PORT, HOST } from "./config/constants";
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
