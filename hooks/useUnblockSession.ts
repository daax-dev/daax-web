"use client";

/**
 * Terminal-WS session hook for the mobile unblock view (issue #156).
 *
 * Connects to the SAME terminal WebSocket (:4201) the desktop terminal uses,
 * through the SAME ticket-aware connector (openTerminalWebSocket) and the SAME
 * `{ type: "input", data }` message protocol — so mobile input is authenticated
 * and handled by exactly the existing, audited server path. Output is
 * accumulated into a capped buffer for the plain-text prompt view; xterm is not
 * loaded on mobile.
 *
 * HONESTY NOTE (shared-pty limitation): the terminal server spawns a FRESH pty
 * per WebSocket (server/handlers/connection-handler.ts assigns a new sessionId
 * every connection — there is no attach-by-id). This hook therefore drives the
 * pty of the session it opens; it does not (and cannot today) share the pty of
 * an already-running desktop agent. Truly attaching to a running agent needs
 * server-side pty multiplexing or tmux-wrapping AI sessions — deferred, same
 * wall as the auto-trigger. See the #156 report.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import {
  buildTerminalWsUrl,
  openTerminalWebSocket,
} from "@/lib/websocket-utils";

export type UnblockStatus =
  | "connecting"
  | "open"
  | "closed"
  | "error"
  | "unauthorized";

export interface UnblockParams {
  /** "local" | "container" | "shell-tmux" — mirrors desktop semantics. */
  mode: string;
}

const MAX_BUFFER = 64 * 1024; // cap retained output so a chatty pty can't grow unbounded

export interface UnblockSession {
  status: UnblockStatus;
  sessionId: string | null;
  /** Accumulated (capped) raw pty output. */
  output: string;
  /** Send raw bytes to the pty. Returns false if the socket isn't open. */
  send: (data: string) => boolean;
  /** Force a reconnect. */
  reconnect: () => void;
}

export function useUnblockSession(params: UnblockParams): UnblockSession {
  const [status, setStatus] = useState<UnblockStatus>("connecting");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [output, setOutput] = useState("");
  const wsRef = useRef<WebSocket | null>(null);
  const [nonce, setNonce] = useState(0);

  // Stable key so the effect only re-runs when connection params truly change.
  const paramKey = JSON.stringify([params.mode, nonce]);

  useEffect(() => {
    // Per-effect-run disposed flag (NOT a shared ref). A previous run's async
    // openTerminalWebSocket() can resolve AFTER a reconnect/mode change has
    // started a new run; a shared ref would have been reset to false by the new
    // run, so the stale continuation would wrongly attach handlers / set state
    // for a dead socket. Each run captures its OWN `disposed` in this closure,
    // set true by that run's cleanup, so stale continuations always see true.
    let disposed = false;
    setStatus("connecting");
    setOutput("");
    setSessionId(null);

    // SECURITY: only `mode` is forwarded to the terminal WS. The server
    // executes a `command` query param verbatim in the spawned shell and uses
    // `cwd`/`containerName` without validation, so the mobile surface must
    // never place caller-supplied values on the WS query string (issue #156
    // review: zero-click RCE via a crafted /m link). Mobile opens a plain
    // interactive shell only; input flows through send() like typed keys.
    const qs = new URLSearchParams();
    qs.set("mode", params.mode);
    const wsUrl = buildTerminalWsUrl(qs);

    let ws: WebSocket | null = null;
    (async () => {
      try {
        ws = await openTerminalWebSocket(wsUrl);
      } catch {
        if (!disposed) setStatus("error");
        return;
      }
      if (disposed) {
        try {
          ws.close();
        } catch {
          /* already closing */
        }
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => {
        if (disposed) return;
        setStatus("open");
      };

      ws.onmessage = (event) => {
        if (disposed) return;
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "output" && typeof msg.data === "string") {
            setOutput((prev) => {
              const next = prev + msg.data;
              return next.length > MAX_BUFFER
                ? next.slice(next.length - MAX_BUFFER)
                : next;
            });
          } else if (msg.type === "session" && typeof msg.id === "string") {
            setSessionId(msg.id);
          } else if (msg.type === "exit") {
            setStatus("closed");
          }
        } catch {
          /* ignore non-JSON frames */
        }
      };

      ws.onclose = (event) => {
        if (disposed) return;
        // 1008 = policy violation (auth/ticket rejection): non-recoverable.
        setStatus(event.code === 1008 ? "unauthorized" : "closed");
      };

      ws.onerror = () => {
        if (!disposed) setStatus("error");
      };
    })();

    return () => {
      disposed = true;
      const sock = wsRef.current;
      wsRef.current = null;
      if (sock) {
        try {
          sock.close();
        } catch {
          /* already closing */
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramKey]);

  const send = useCallback((data: string): boolean => {
    const sock = wsRef.current;
    if (!sock || sock.readyState !== WebSocket.OPEN || data.length === 0) {
      return false;
    }
    sock.send(JSON.stringify({ type: "input", data }));
    return true;
  }, []);

  const reconnect = useCallback(() => setNonce((n) => n + 1), []);

  return { status, sessionId, output, send, reconnect };
}
