"use client";

/**
 * Drives the Attention board's data (issue #153).
 *
 * Design: LIVE first, POLL as the resilient fallback.
 *  - The full card set is seeded from the REST snapshot
 *    (GET /api/watchtower/attention), which stays the source of truth.
 *  - A WebSocket bridge (daax-web terminal server, `?stream=attention`) relays
 *    Watchtower's broadcast bus; each event is applied to the affected card in
 *    real time via the pure reducer in lib/attention/live.ts. The bridge reuses
 *    the terminal WS auth (single-use ticket in container mode, loopback bypass
 *    in host-dev), so no new unauthenticated surface is added.
 *  - When the WS is down (or unavailable — e.g. no browser WebSocket) the hook
 *    falls back to short-interval polling. On every (re)connect it re-fetches the
 *    REST snapshot to resync, so live deltas never drift from the truth. While
 *    the WS is live, polling backs off to a slow safety resync only.
 *
 * Resilience: at most one snapshot request is in flight (a tick while one is
 * outstanding is skipped, not aborted — aborting each tick would livelock
 * against an upstream slower than the interval). Polling and WS reconnects pause
 * while the tab is hidden. WS reconnects use exponential backoff. Each snapshot
 * fully replaces the card set (no unbounded accumulation); live deltas mutate
 * cards in place (session_end removes them), so memory stays bounded.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { AttentionCard, AttentionResponse } from "@/lib/attention/adapter";
import { applyLiveEvent, parseWsMessage } from "@/lib/attention/live";
import {
  buildTerminalWsUrl,
  openTerminalWebSocket,
} from "@/lib/websocket-utils";

export type ConnState = "loading" | "connected" | "disconnected";

export const DEFAULT_POLL_MS = 2000;

/** While the WS is live, re-fetch the REST snapshot no more often than this. */
const SAFETY_RESYNC_MS = 30_000;

/** Reconnect backoff bounds. */
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

export interface AttentionPollResult {
  cards: AttentionCard[];
  conn: ConnState;
  /** True when the server capped the session list (not every session shown). */
  truncated: boolean;
  /** Force an immediate refresh (e.g. a retry button). */
  refresh: () => void;
}

export function useAttentionPoll(
  pollMs: number = DEFAULT_POLL_MS,
): AttentionPollResult {
  const [cards, setCards] = useState<AttentionCard[]>([]);
  const [conn, setConn] = useState<ConnState>("loading");
  const [truncated, setTruncated] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false);
  const lastSnapshotAtRef = useRef(0);

  // WS liveness bookkeeping.
  const wsRef = useRef<WebSocket | null>(null);
  const wsLiveRef = useRef(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backoffRef = useRef(RECONNECT_BASE_MS);
  const unmountedRef = useRef(false);

  const load = useCallback(async () => {
    // Skip this tick if a request is still outstanding. Requests can't pile up
    // (at most one in flight), and a slow-but-alive upstream still gets to
    // complete instead of being aborted every interval.
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const res = await fetch("/api/watchtower/attention", {
        cache: "no-store",
        signal: ac.signal,
      });
      if (!res.ok) {
        // Drop stale session data so the UI doesn't show old cards / a stale
        // truncated banner while actually disconnected.
        setCards([]);
        setTruncated(false);
        setConn("disconnected");
        return;
      }
      const data = (await res.json()) as AttentionResponse;
      if (data && data.ok && Array.isArray(data.sessions)) {
        setCards(data.sessions);
        setTruncated(data.truncated === true);
        setConn("connected");
        // Track the last SUCCESSFUL snapshot. A failed fetch must NOT update
        // this, or (while the WS is live) tick() would suppress REST resyncs
        // for SAFETY_RESYNC_MS and leave the board stale on a transient error.
        lastSnapshotAtRef.current = Date.now();
      } else {
        setCards([]);
        setTruncated(false);
        setConn("disconnected");
      }
    } catch (err) {
      // Aborts are expected on unmount / poll-interval change; ignore them.
      if (err instanceof DOMException && err.name === "AbortError") return;
      // Drop stale session data on a fetch/parse failure (see non-2xx path).
      setCards([]);
      setTruncated(false);
      setConn("disconnected");
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    unmountedRef.current = false;

    const isHidden = () =>
      typeof document !== "undefined" && document.visibilityState === "hidden";

    const scheduleReconnect = () => {
      if (unmountedRef.current || reconnectTimerRef.current || isHidden()) {
        return;
      }
      const delay = backoffRef.current;
      backoffRef.current = Math.min(delay * 2, RECONNECT_MAX_MS);
      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null;
        void connect();
      }, delay);
    };

    const connect = async () => {
      if (unmountedRef.current || wsRef.current || isHidden()) return;
      if (typeof window === "undefined" || typeof WebSocket === "undefined") {
        return; // No WS available — polling remains the only path.
      }
      let ws: WebSocket;
      try {
        const url = buildTerminalWsUrl(
          new URLSearchParams({ stream: "attention" }),
        );
        ws = await openTerminalWebSocket(url);
      } catch {
        scheduleReconnect();
        return;
      }
      if (unmountedRef.current) {
        try {
          ws.close();
        } catch {
          /* noop */
        }
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => {
        wsLiveRef.current = true;
        backoffRef.current = RECONNECT_BASE_MS;
        // Resync the full card set on every (re)connect so live deltas never
        // drift from the truth.
        void load();
      };
      ws.onmessage = (event: MessageEvent) => {
        const raw =
          typeof event.data === "string" ? event.data : String(event.data);
        const msg = parseWsMessage(raw);
        if (!msg) return;
        setCards((prev) => applyLiveEvent(prev, msg, Date.now()));
      };
      const onDown = () => {
        wsLiveRef.current = false;
        if (wsRef.current === ws) wsRef.current = null;
        scheduleReconnect();
      };
      ws.onclose = onDown;
      ws.onerror = onDown;
    };

    const closeWs = () => {
      wsLiveRef.current = false;
      const ws = wsRef.current;
      wsRef.current = null;
      if (ws) {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onclose = null;
        ws.onerror = null;
        try {
          ws.close();
        } catch {
          /* noop */
        }
      }
    };

    const tick = () => {
      if (isHidden()) return;
      // While the WS is live, deltas keep the board fresh; only resync slowly to
      // re-derive decayed statuses without hammering the REST proxy.
      if (
        wsLiveRef.current &&
        Date.now() - lastSnapshotAtRef.current < SAFETY_RESYNC_MS
      ) {
        return;
      }
      void load();
    };

    const onVisibility = () => {
      if (isHidden()) return;
      // Coming back to the foreground: reconnect promptly and resync.
      backoffRef.current = RECONNECT_BASE_MS;
      if (!wsRef.current) void connect();
      void load();
    };

    void load();
    void connect();
    const id = setInterval(tick, pollMs);
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
    }

    return () => {
      unmountedRef.current = true;
      clearInterval(id);
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility);
      }
      closeWs();
      abortRef.current?.abort();
    };
  }, [load, pollMs]);

  return { cards, conn, truncated, refresh: load };
}
