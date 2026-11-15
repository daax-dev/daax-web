/**
 * WebSocket Message Handler
 *
 * Handles incoming WebSocket messages for terminal sessions.
 */

import { WebSocket } from "ws";
import { IPty } from "../sessions/types";
import {
  filterOwned,
  hasPermission,
  ownerKeyFor,
  requireOwnerOrAdmin,
  type Principal,
} from "../../lib/tenancy/ownership";
import {
  startRecording,
  stopRecording,
  listRecordings,
  getRecording,
  deleteRecording,
  recordInput,
} from "../recording/recorder";

export interface MessageHandlerContext {
  sessionId: string;
  sessionType: string;
  command: string;
  shell: string;
  ptyProcess: IPty;
  ws: WebSocket;
  getRecordingId: () => string | undefined;
  setRecordingId: (id: string | undefined) => void;
  /**
   * Who this connection acts as (dx#119). Recording messages are scoped to the
   * principal's own recordings (admins: all); starting/deleting needs
   * `recording:write`.
   */
  principal: Principal;
  /**
   * Owner key stamped on a recording this connection starts, when it is not
   * the principal's: a substrate session's recording belongs to the session's
   * owner even when an admin starts it. Defaults to `ownerKeyFor(principal)`.
   */
  recordingOwner?: string | null;
}

/**
 * Handle an incoming WebSocket message
 */
export function handleMessage(
  message: Buffer | string,
  ctx: MessageHandlerContext,
): void {
  try {
    const msg = JSON.parse(message.toString());

    switch (msg.type) {
      case "input":
        // Guard against non-string data to prevent pty.write() errors
        if (typeof msg.data === "string") {
          ctx.ptyProcess.write(msg.data);
          // Record input if recording is active
          if (ctx.getRecordingId()) {
            recordInput(ctx.sessionId, msg.data);
          }
        }
        break;

      case "resize":
        if (
          typeof msg.cols === "number" &&
          typeof msg.rows === "number" &&
          Number.isInteger(msg.cols) &&
          Number.isInteger(msg.rows) &&
          msg.cols > 0 &&
          msg.rows > 0
        ) {
          ctx.ptyProcess.resize(msg.cols, msg.rows);
        }
        break;

      case "command":
        // Execute a command (like launching claude)
        if (typeof msg.data === "string" && msg.data) {
          ctx.ptyProcess.write(msg.data + "\r");
        }
        break;

      case "startRecording":
        if (!hasPermission(ctx.principal, "recording:write")) break;
        handleStartRecording(msg, ctx);
        break;

      case "stopRecording":
        handleStopRecording(ctx).catch((err) => {
          console.error("[Terminal Server] Error stopping recording:", err);
        });
        break;

      case "listRecordings":
        // List all recordings
        ctx.ws.send(
          JSON.stringify({
            type: "recordingsList",
            recordings: filterOwned(
              ctx.principal,
              listRecordings(),
              (r) => r.owner,
            ),
          }),
        );
        break;

      case "getRecording":
        // Get a specific recording
        if (msg.id) {
          const found = getRecording(msg.id);
          // Not-yours is indistinguishable from not-found (null).
          const recording =
            found && requireOwnerOrAdmin(ctx.principal, found.metadata).ok
              ? found
              : null;
          ctx.ws.send(JSON.stringify({ type: "recordingData", recording }));
        }
        break;

      case "deleteRecording":
        // Delete a recording
        if (msg.id) {
          const found = getRecording(msg.id);
          const allowed =
            hasPermission(ctx.principal, "recording:write") &&
            (ctx.principal.admin ||
              (!!found &&
                requireOwnerOrAdmin(ctx.principal, found.metadata).ok));
          const success = allowed ? deleteRecording(msg.id) : false;
          ctx.ws.send(
            JSON.stringify({ type: "recordingDeleted", id: msg.id, success }),
          );
        }
        break;

      default:
        console.log(`Unknown message type: ${msg.type}`);
    }
  } catch (e) {
    console.error("[Terminal Server] Failed to parse WebSocket message:", e);
  }
}

/**
 * Handle startRecording message
 */
function handleStartRecording(
  msg: { cols?: number; rows?: number; clientSessionId?: string },
  ctx: MessageHandlerContext,
): void {
  // Start recording if not already
  if (!ctx.getRecordingId()) {
    const cols =
      typeof msg.cols === "number" && Number.isInteger(msg.cols) && msg.cols > 0
        ? msg.cols
        : 120;
    const rows =
      typeof msg.rows === "number" && Number.isInteger(msg.rows) && msg.rows > 0
        ? msg.rows
        : 30;
    // Note: msg.clientSessionId can be provided by client for deduplication
    const recordingId = startRecording(
      ctx.sessionId,
      ctx.sessionType,
      ctx.command || ctx.shell,
      cols,
      rows,
      msg.clientSessionId,
      ctx.recordingOwner ?? ownerKeyFor(ctx.principal),
    );
    // startRecording returns null if duplicate (same clientSessionId already recording)
    if (recordingId) {
      ctx.setRecordingId(recordingId);
      ctx.ws.send(
        JSON.stringify({
          type: "recordingStarted",
          recordingId,
        }),
      );
    }
  }
}

/**
 * Handle stopRecording message
 */
async function handleStopRecording(ctx: MessageHandlerContext): Promise<void> {
  // Stop recording if active
  const recordingId = ctx.getRecordingId();
  if (recordingId) {
    const metadata = await stopRecording(ctx.sessionId);
    ctx.setRecordingId(undefined);
    ctx.ws.send(JSON.stringify({ type: "recordingStopped", metadata }));
  }
}
