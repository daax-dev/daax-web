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
 * Resilience: only one request is in flight at a time (the previous is aborted),
 * polling pauses while the tab is hidden, and each response fully replaces state
 * (no unbounded accumulation on long-lived boards).
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

export interface AttentionPollOptions {
  /**
   * Pause polling while the tab is hidden (default true — preserves the board's
   * original behaviour: a backgrounded board does no work). The app-wide bell
   * (issue #154) passes false so blocked-agent alerts still surface while the
   * user is away, which is the whole point of a desktop notification. Browsers
   * throttle (but do not stop) background-tab timers, so this remains cheap.
   */
  pauseWhenHidden?: boolean;
}

export function useAttentionPoll(
  pollMs: number = DEFAULT_POLL_MS,
  options: AttentionPollOptions = {},
): AttentionPollResult {
  const { pauseWhenHidden = true } = options;
  const [cards, setCards] = useState<AttentionCard[]>([]);
  const [conn, setConn] = useState<ConnState>("loading");
  const [truncated, setTruncated] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    // Cancel any in-flight request so slow responses can't pile up or land
    // out of order.
    abortRef.current?.abort();
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
      // Aborts are expected on unmount / supersede; ignore them.
      if (err instanceof DOMException && err.name === "AbortError") return;
      setConn("disconnected");
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(() => {
      if (
        !pauseWhenHidden ||
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
  }, [load, pollMs, pauseWhenHidden]);

  return { cards, conn, truncated, refresh: load };
}
