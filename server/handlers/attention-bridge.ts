/**
 * Attention live-stream bridge (issue #153).
 *
 * The browser cannot reach Watchtower's WebSocket bus directly: in container
 * mode Watchtower is on the internal Docker network and only reachable
 * server-side via WATCHTOWER_API_URL. This bridge lets the Attention board
 * subscribe to live session events over the SAME port and auth posture as the
 * terminal WS (port 4201): the browser connects here (dispatched by the
 * `?stream=attention` query in terminal-server.ts), the upgrade is authenticated
 * with the shared handshake (origin + Traefik-forwarded / bearer-ticket /
 * loopback-bypass — see ws-auth.ts), and the server then dials Watchtower `/ws`
 * and relays each broadcast protocol message to the browser.
 *
 * Read-only by design: the browser is a passive consumer. Inbound client frames
 * are ignored (never forwarded onto Watchtower's broadcast bus), so this adds no
 * new write/ingest surface. When the upstream drops, the client socket is closed
 * so the browser falls back to polling and reconnects with backoff.
 */

import { WebSocket, type RawData } from "ws";
import type { IncomingMessage } from "http";

import { authenticateConnection } from "./ws-auth";

/**
 * Normalize a `ws` RawData frame to a UTF-8 string. `ws` may hand a message as
 * a Buffer, an array of Buffer chunks (fragmented frame), an ArrayBuffer, or a
 * string. Calling `.toString()` directly on an ArrayBuffer yields
 * "[object ArrayBuffer]" and on a Buffer[] yields a comma-joined list — both
 * corrupt the relayed JSON. Concatenate/decode explicitly so the downstream
 * JSON parser receives the exact bytes Watchtower sent.
 */
export function rawDataToString(data: RawData | string): string {
  if (typeof data === "string") return data;
  if (Buffer.isBuffer(data)) return data.toString("utf8");
  if (Array.isArray(data)) return Buffer.concat(data).toString("utf8");
  return Buffer.from(data).toString("utf8");
}

/**
 * Resolve the Watchtower WebSocket URL. Mirrors watchtowerBaseUrl() in
 * lib/watchtower/client.ts (kept inline to avoid pulling the `@/`-aliased client
 * module into the terminal-server build, which uses relative imports): explicit
 * WATCHTOWER_API_URL wins; in container mode reach the host via
 * host.docker.internal; otherwise localhost for host-dev. The scheme is swapped
 * to ws/wss and the `/ws` path appended.
 */
export function watchtowerWsUrl(): string {
  const fallback = process.env.HOST_WORKSPACE_PATH
    ? "http://host.docker.internal:4220"
    : "http://localhost:4220";
  const base = process.env.WATCHTOWER_API_URL ?? fallback;
  return base.replace(/\/+$/, "").replace(/^http/i, "ws") + "/ws";
}

/**
 * Bounded upstream-handshake timeout (ms). If Watchtower's WS never completes
 * its handshake — e.g. the upstream is blackholed: SYN accepted but no HTTP
 * upgrade — the socket would otherwise sit in CONNECTING forever, pinning server
 * resources until the browser gives up. Override with
 * DAAX_ATTENTION_UPSTREAM_TIMEOUT_MS; defaults to 10s.
 */
function upstreamHandshakeTimeoutMs(): number {
  const raw = process.env.DAAX_ATTENTION_UPSTREAM_TIMEOUT_MS;
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 10_000;
}

/**
 * Handle a browser upgrade for the Attention live stream. Authenticates first
 * (same posture as the terminal WS), then relays Watchtower's broadcast feed.
 */
export function handleAttentionBridge(
  client: WebSocket,
  req: IncomingMessage,
): void {
  // Authenticate the upgrade BEFORE dialing upstream — identical posture to the
  // terminal WS. Reject by closing with 1008 so the browser can distinguish a
  // non-recoverable auth failure from a transient drop.
  const auth = authenticateConnection(req);
  if (!auth.ok) {
    console.log(
      `Rejected attention-stream WS upgrade (${auth.reason}) from ${req.socket?.remoteAddress ?? "unknown"}`,
    );
    client.close(auth.code, "unauthorized");
    return;
  }

  const upstreamUrl = watchtowerWsUrl();
  let upstream: WebSocket;
  try {
    upstream = new WebSocket(upstreamUrl);
  } catch (err) {
    console.warn(`[attention-bridge] failed to open ${upstreamUrl}:`, err);
    if (client.readyState === WebSocket.OPEN) {
      client.close(1011, "upstream unavailable");
    }
    return;
  }

  // Bound the upstream handshake: if `open` never fires (blackholed upstream:
  // SYN accepted, no upgrade), terminate the CONNECTING socket and close the
  // client with a recoverable code so the browser falls back to polling. The
  // timer is cleared on open/close/error below, and unref'd so it never keeps
  // the process alive on its own.
  const handshakeTimer: ReturnType<typeof setTimeout> = setTimeout(() => {
    console.warn(
      `[attention-bridge] upstream handshake timed out after ${upstreamHandshakeTimeoutMs()}ms; closing`,
    );
    try {
      upstream.terminate();
    } catch {
      // already closing/closed
    }
    if (client.readyState === WebSocket.OPEN) {
      client.close(1011, "upstream timeout");
    }
  }, upstreamHandshakeTimeoutMs());
  (handshakeTimer as { unref?: () => void }).unref?.();

  upstream.on("open", () => {
    clearTimeout(handshakeTimer);
  });

  // Relay upstream → browser. Watchtower's bus rebroadcasts every message it
  // receives from other clients (agents) to this passive consumer; forward each
  // frame verbatim. No buffering: a slow browser simply drops behind, it cannot
  // grow server memory.
  upstream.on("message", (data: RawData) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(rawDataToString(data));
    }
  });

  upstream.on("close", () => {
    clearTimeout(handshakeTimer);
    if (client.readyState === WebSocket.OPEN) {
      client.close(1011, "upstream closed");
    }
  });

  upstream.on("error", (err) => {
    clearTimeout(handshakeTimer);
    console.warn("[attention-bridge] upstream error:", err);
    if (client.readyState === WebSocket.OPEN) {
      client.close(1011, "upstream error");
    }
  });

  // Browser is read-only: ignore inbound frames (do NOT forward to the bus).
  client.on("close", () => {
    clearTimeout(handshakeTimer);
    if (
      upstream.readyState === WebSocket.OPEN ||
      upstream.readyState === WebSocket.CONNECTING
    ) {
      upstream.close();
    }
  });

  client.on("error", (err) => {
    clearTimeout(handshakeTimer);
    console.warn("[attention-bridge] client error:", err);
    try {
      upstream.close();
    } catch {
      // already closing/closed
    }
  });
}
