"use client";

/**
 * Polls the Attention aggregation endpoint on a short interval (issue #153).
 *
 * Watchtower's only live channel is an unauthenticated ingest/echo WebSocket
 * bus (`/ws`) not designed for scoped consumer subscription; bridging a durable
 * upstream socket through a Next.js route handler across both host and container
 * deploy modes is fragile and disproportionate. This hook therefore uses the
 * documented short-interval polling fallback (default 2s, satisfying the "≤2s
 * to reflect a real change" acceptance criterion) over the existing REST proxy
 * pattern.
 *
 * Resilience: only one request is in flight at a time (a tick while a request
 * is outstanding is skipped, not aborted — aborting each tick would livelock
 * against an upstream slower than the poll interval, so no request ever
 * completes), polling pauses while the tab is hidden, and each response fully
 * replaces state (no unbounded accumulation on long-lived boards). Abort is
 * reserved for unmount / poll-interval change.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { AttentionCard, AttentionResponse } from "@/lib/attention/adapter";

export type ConnState = "loading" | "connected" | "disconnected";

export const DEFAULT_POLL_MS = 2000;

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
        setConn("disconnected");
        return;
      }
      const data = (await res.json()) as AttentionResponse;
      if (data && data.ok && Array.isArray(data.sessions)) {
        setCards(data.sessions);
        setTruncated(data.truncated === true);
        setConn("connected");
      } else {
        setCards([]);
        setTruncated(false);
        setConn("disconnected");
      }
    } catch (err) {
      // Aborts are expected on unmount / poll-interval change; ignore them.
      if (err instanceof DOMException && err.name === "AbortError") return;
      setConn("disconnected");
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(() => {
      if (
        typeof document === "undefined" ||
        document.visibilityState === "visible"
      ) {
        load();
      }
    }, pollMs);
    return () => {
      clearInterval(id);
      abortRef.current?.abort();
    };
  }, [load, pollMs]);

  return { cards, conn, truncated, refresh: load };
}
