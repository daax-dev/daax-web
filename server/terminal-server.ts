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

const wss = new WebSocketServer({ port: PORT, host: HOST });

console.log(`Terminal WebSocket server running on ws://${HOST}:${PORT}`);
console.log(`Default container image: ${DEFAULT_CONTAINER_IMAGE}`);

// Handle new connections
wss.on("connection", handleConnection);

// Register signal handlers for graceful shutdown
registerSignalHandlers(wss);
