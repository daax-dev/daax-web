/**
 * Single shared poller for GET /api/watchtower/attention (issues #153 + #154).
 *
 * WHY A SINGLETON: the Attention board and the app-wide notification bell both
 * need this data. Two independent pollers (as in the first #154 cut) doubled the
 * request volume on the board page and made every page poll on its own timer —
 * a real concern given daax is known to return intermittent 429s. This module
 * guarantees:
 *   - exactly ONE in-flight request to the endpoint at any time (no overlap),
 *   - ONE timer regardless of how many components subscribe,
 *   - the cadence is driven by the FASTEST active subscriber (the board asks for
 *     2s only while it is mounted; the always-mounted bell asks for a slow 8s),
 *   - polling slows further (or pauses) while the tab is hidden, per subscriber
 *     preference, and catches up on becoming visible again.
 *
 * Framework-agnostic on purpose (no React import) so it is unit-testable and so
 * useSyncExternalStore can wrap it trivially: `subscribe` takes React's notify
 * callback, `getSnapshot` returns the latest immutable snapshot.
 */

import type { AttentionCard, AttentionResponse } from "./adapter";

export type ConnState = "loading" | "connected" | "disconnected";

export interface AttentionSnapshot {
  cards: AttentionCard[];
  conn: ConnState;
  truncated: boolean;
}

export interface AttentionSubscriber {
  /** Desired poll cadence in ms (the source uses the minimum across subscribers). */
  intervalMs: number;
  /** When true this subscriber does not want polling while the tab is hidden. */
  pauseWhenHidden: boolean;
  /** React's onStoreChange — notified after every snapshot update. */
  listener: () => void;
}

const ENDPOINT = "/api/watchtower/attention";

/** How much slower to poll while the tab is hidden (applied to each interval). */
const HIDDEN_FACTOR = 2;

/**
 * Hard ceiling on a single request. Because the source never overlaps requests,
 * a hung fetch would otherwise wedge ALL polling forever (unlike the old
 * per-interval hook that aborted the previous request each tick). This bounds
 * that: a stuck request is aborted, surfaced as disconnected, and the next poll
 * proceeds. Comfortably above the server route's own ~1.5s upstream timeout.
 */
const FETCH_TIMEOUT_MS = 12_000;

/** Stable initial snapshot (also the SSR snapshot — must keep a stable ref). */
const INITIAL: AttentionSnapshot = {
  cards: [],
  conn: "loading",
  truncated: false,
};

const subs = new Set<AttentionSubscriber>();
let snapshot: AttentionSnapshot = INITIAL;
let timer: ReturnType<typeof setTimeout> | null = null;
let inFlight: AbortController | null = null;
let visBound = false;

function isHidden(): boolean {
  return (
    typeof document !== "undefined" && document.visibilityState === "hidden"
  );
}

/** Smallest desired interval among subscribers active under current visibility. */
function effectiveDelay(): number {
  if (subs.size === 0) return Infinity;
  const hidden = isHidden();
  let min = Infinity;
  for (const s of subs) {
    if (hidden && s.pauseWhenHidden) continue;
    const iv = hidden ? s.intervalMs * HIDDEN_FACTOR : s.intervalMs;
    if (iv < min) min = iv;
  }
  return min; // Infinity when every active subscriber pauses while hidden
}

function update(next: AttentionSnapshot): void {
  snapshot = next;
  for (const s of subs) s.listener();
}

async function tick(): Promise<void> {
  if (inFlight || subs.size === 0) return; // never overlap; no work without subs
  const ac = new AbortController();
  inFlight = ac;
  // Distinguish a timeout-abort (surface as disconnected) from an
  // unsubscribe-abort (stay silent — no one is listening).
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    ac.abort();
  }, FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(ENDPOINT, { cache: "no-store", signal: ac.signal });
    if (ac.signal.aborted) return;
    if (!res.ok) {
      // Keep the last cards; just flag the connection as down (recovers next poll).
      update({ ...snapshot, conn: "disconnected" });
    } else {
      const data = (await res.json()) as AttentionResponse;
      if (data && data.ok && Array.isArray(data.sessions)) {
        update({
          cards: data.sessions,
          truncated: data.truncated === true,
          conn: "connected",
        });
      } else {
        update({ cards: [], truncated: false, conn: "disconnected" });
      }
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      if (timedOut) update({ ...snapshot, conn: "disconnected" });
      return;
    }
    update({ ...snapshot, conn: "disconnected" });
  } finally {
    clearTimeout(timeout);
    if (inFlight === ac) inFlight = null;
    // Chain the next poll (guarantees no overlapping timer-driven fetches).
    if (subs.size > 0) schedule(false);
  }
}

/**
 * (Re)arms the single timer. `immediate` polls now (used on the first subscribe,
 * on a manual refresh, and on becoming visible) as long as nothing is in flight.
 */
function schedule(immediate: boolean): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  const delay = effectiveDelay();
  if (delay === Infinity) return; // nothing to poll right now
  if (immediate && !inFlight) {
    void tick();
    return;
  }
  timer = setTimeout(() => void tick(), delay);
}

function onVisibility(): void {
  // Catch up immediately when the user returns; otherwise recompute the cadence.
  schedule(!isHidden());
}

function bindVisibility(): void {
  if (visBound || typeof document === "undefined") return;
  document.addEventListener("visibilitychange", onVisibility);
  visBound = true;
}

function unbindVisibility(): void {
  if (!visBound || typeof document === "undefined") return;
  document.removeEventListener("visibilitychange", onVisibility);
  visBound = false;
}

/** Subscribe a consumer; returns an unsubscribe that stops polling when the last leaves. */
export function subscribe(sub: AttentionSubscriber): () => void {
  const wasEmpty = subs.size === 0;
  subs.add(sub);
  if (wasEmpty) bindVisibility();
  // Poll now when nothing is in flight so a newly-mounted consumer gets fresh
  // data promptly (an in-flight fetch will broadcast to it momentarily instead).
  schedule(!inFlight);

  return () => {
    subs.delete(sub);
    if (subs.size === 0) {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (inFlight) {
        inFlight.abort();
        inFlight = null;
      }
      unbindVisibility();
    } else {
      // A fast subscriber may have left — recompute (no immediate poll).
      schedule(false);
    }
  };
}

/** Latest snapshot (for useSyncExternalStore). Stable ref between updates. */
export function getSnapshot(): AttentionSnapshot {
  return snapshot;
}

/** SSR/first-paint snapshot. Must return a stable ref. */
export function getServerSnapshot(): AttentionSnapshot {
  return INITIAL;
}

/** Force an immediate poll (e.g. a "Retry" button). No-op while one is in flight. */
export function refresh(): void {
  if (subs.size === 0 || inFlight) return;
  schedule(true);
}

/** Test hook: tears down all state so cases don't leak into each other. */
export function __resetAttentionSource(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (inFlight) {
    inFlight.abort();
    inFlight = null;
  }
  subs.clear();
  unbindVisibility();
  snapshot = INITIAL;
}
