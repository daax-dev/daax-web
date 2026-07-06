"use client";

/**
 * Thin React binding over the shared Attention source (issues #153 + #154).
 *
 * All fetching, timing, single-flight and visibility handling live in
 * lib/attention/source.ts — a process-wide singleton so the board and the
 * always-mounted notification bell share ONE poller (one in-flight request, one
 * timer, cadence set by the fastest active consumer) instead of each running its
 * own interval. This hook just registers a subscriber and reflects the latest
 * snapshot via useSyncExternalStore.
 *
 * Public shape is unchanged from the original #153 hook, so AttentionBoard needs
 * no edits.
 */

import { useCallback, useSyncExternalStore } from "react";
import type { AttentionCard } from "@/lib/attention/adapter";
import {
  getServerSnapshot,
  getSnapshot,
  refresh as sourceRefresh,
  subscribe as sourceSubscribe,
  type ConnState,
} from "@/lib/attention/source";

export type { ConnState };

/** Default board cadence — the fastest consumer, active only while mounted. */
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
   * original behaviour). The app-wide bell (issue #154) passes false so
   * blocked-agent alerts still surface while the user is away; the shared source
   * additionally slows the cadence while hidden.
   */
  pauseWhenHidden?: boolean;
}

export function useAttentionPoll(
  pollMs: number = DEFAULT_POLL_MS,
  options: AttentionPollOptions = {},
): AttentionPollResult {
  const { pauseWhenHidden = true } = options;

  const subscribe = useCallback(
    (onChange: () => void) =>
      sourceSubscribe({
        intervalMs: pollMs,
        pauseWhenHidden,
        listener: onChange,
      }),
    [pollMs, pauseWhenHidden],
  );

  const snapshot = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  return {
    cards: snapshot.cards,
    conn: snapshot.conn,
    truncated: snapshot.truncated,
    refresh: sourceRefresh,
  };
}
