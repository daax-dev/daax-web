/**
 * WebSocket connection dispatch (issue #156).
 *
 * A single WS port (4201) serves two consumers, selected by the request's
 * `?stream=` query parameter:
 *   - `?stream=attention` → the Attention live-stream bridge (issue #153).
 *   - everything else      → the terminal PTY handler.
 *
 * `req.url` is CLIENT-CONTROLLED and can be genuinely unparseable. Dispatch must
 * be deterministic and fail CLOSED: a base URL that is guaranteed to parse (an
 * empty/misconfigured HOST is coerced to `localhost`) and, on a real parse
 * failure of `req.url`, the socket is closed rather than silently falling
 * through to the side-effecting PTY handler.
 */

import type { WebSocket } from "ws";
import type { IncomingMessage } from "http";

import { HOST, PORT, localBaseUrl } from "../config/constants";

export type ConnectionHandler = (ws: WebSocket, req: IncomingMessage) => void;

/**
 * Route an incoming WS connection to the terminal (PTY) or attention-bridge
 * handler, failing closed on an unparseable `req.url`.
 */
export function dispatchConnection(
  ws: WebSocket,
  req: IncomingMessage,
  onTerminal: ConnectionHandler,
  onAttention: ConnectionHandler,
): void {
  let stream: string | null;
  try {
    // Coerce an empty/bad HOST to `localhost` so the base is always parseable;
    // only a genuinely-unparseable `req.url` can reach the catch.
    stream = new URL(
      req.url || "/",
      localBaseUrl(HOST || "localhost", PORT),
    ).searchParams.get("stream");
  } catch {
    // Fail closed: do NOT fall through to the side-effecting PTY handler.
    ws.close(1008, "bad request");
    return;
  }

  if (stream === "attention") {
    onAttention(ws, req);
    return;
  }
  onTerminal(ws, req);
}
