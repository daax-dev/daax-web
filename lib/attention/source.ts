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
 * LIVE over WS, POLL as fallback (issue #153's live stream, folded into the one
 * shared connection): the source also opens a SINGLE WebSocket to the terminal
 * server's `?stream=attention` bridge (via the ticket-aware openTerminalWebSocket
 * helper — no new API surface, so audit:auth is unaffected). Watchtower events
 * are applied to the affected card in real time through the pure reducer in
 * ./live. Because there is one shared source, there is exactly ONE such socket
 * for the whole app — the board, the notification bell and any PWA consumer all
 * receive live deltas through it. The REST snapshot stays the source of truth:
 * the source re-fetches it on every (re)connect to resync, and while the WS is
 * live the poll backs off to a slow safety resync only. When the WS is down (or
 * unavailable — e.g. no browser WebSocket) polling resumes at the fast cadence.
 * Reconnects use exponential backoff and pause while the tab is hidden.
 *
 * Framework-agnostic on purpose (no React import) so it is unit-testable and so
 * useSyncExternalStore can wrap it trivially: `subscribe` takes React's notify
 * callback, `getSnapshot` returns the latest immutable snapshot.
 */

import type { AttentionCard, AttentionResponse } from "./adapter";
import { applyLiveEvent, parseWsMessage } from "./live";
import { buildTerminalWsUrl, openTerminalWebSocket } from "../websocket-utils";

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
 * While the WS is live, live deltas keep every card fresh, so polling backs off
 * to at most this cadence — a safety resync that re-derives decayed statuses and
 * corrects any drift without hammering the REST proxy. Overrides the fast
 * per-subscriber cadence (e.g. the board's 2s) only while the socket is up.
 */
const SAFETY_RESYNC_MS = 30_000;

/** WS reconnect backoff bounds (exponential, reset on a successful open). */
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

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

// Live WebSocket state. One socket for the whole app (shared source).
let ws: WebSocket | null = null;
let wsLive = false;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let backoff = RECONNECT_BASE_MS;

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
  // Infinity when every active subscriber pauses while hidden. When the WS is
  // live, deltas keep cards fresh, so the poll only needs the slow safety
  // resync — never faster than SAFETY_RESYNC_MS.
  if (wsLive && min !== Infinity) return Math.max(min, SAFETY_RESYNC_MS);
  return min;
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
        // HTTP 200 but the upstream is unreachable/transient (e.g. Watchtower
        // down → `{ ok:false }`, or a malformed body). Treat this like the
        // non-ok branch above: keep the last-known cards and only flag the
        // connection as down. Cards are replaced ONLY by a successful
        // (`ok:true`) fetch with a fresh session list, so a transient outage
        // never wipes state consumers read while disconnected.
        update({ ...snapshot, conn: "disconnected" });
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
  if (isHidden()) {
    // Going hidden: recompute the (now slower/paused) cadence. Reconnects are
    // suppressed while hidden and resume on return.
    schedule(false);
    return;
  }
  // Coming back to the foreground: reconnect the live socket promptly and catch
  // up with an immediate resync poll.
  backoff = RECONNECT_BASE_MS;
  if (!ws) void connectWs();
  schedule(true);
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

/** Arm the single reconnect timer with exponential backoff (browser-only). */
function scheduleReconnect(): void {
  if (subs.size === 0 || reconnectTimer || isHidden()) return;
  const delay = backoff;
  backoff = Math.min(delay * 2, RECONNECT_MAX_MS);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void connectWs();
  }, delay);
}

/**
 * Open the ONE shared live socket to the `?stream=attention` bridge. Reuses the
 * ticket-aware terminal WS auth (single-use ticket in container mode, loopback
 * bypass in host-dev) — no new API route, so audit:auth stays clean. On a
 * successful open it resyncs the REST snapshot; each relayed Watchtower event is
 * applied to the affected card via the pure reducer. A drop schedules a backed-
 * off reconnect and resumes the fast poll fallback.
 */
async function connectWs(): Promise<void> {
  if (ws || subs.size === 0 || isHidden()) return;
  if (typeof window === "undefined" || typeof WebSocket === "undefined") {
    return; // No browser WebSocket — polling remains the only path.
  }
  let socket: WebSocket;
  try {
    const url = buildTerminalWsUrl(
      new URLSearchParams({ stream: "attention" }),
    );
    socket = await openTerminalWebSocket(url);
  } catch {
    scheduleReconnect();
    return;
  }
  if (subs.size === 0) {
    // The last consumer left while the socket was being minted.
    try {
      socket.close();
    } catch {
      /* noop */
    }
    return;
  }
  ws = socket;

  socket.onopen = () => {
    wsLive = true;
    backoff = RECONNECT_BASE_MS;
    // Resync the full card set on every (re)connect so live deltas never drift
    // from the truth; this also switches the poll to the slow safety cadence.
    schedule(true);
  };
  socket.onmessage = (event: MessageEvent) => {
    const raw =
      typeof event.data === "string" ? event.data : String(event.data);
    const msg = parseWsMessage(raw);
    if (!msg) return;
    const nextCards = applyLiveEvent(snapshot.cards, msg, Date.now());
    // applyLiveEvent returns the same ref when nothing changed — skip the
    // needless broadcast/render in that case.
    if (nextCards !== snapshot.cards) update({ ...snapshot, cards: nextCards });
  };
  const onDown = () => {
    wsLive = false;
    if (ws === socket) ws = null;
    scheduleReconnect();
    schedule(false); // resume the fast poll fallback cadence
  };
  socket.onclose = onDown;
  socket.onerror = onDown;
}

/** Tear down the live socket and any pending reconnect. */
function closeWs(): void {
  wsLive = false;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  backoff = RECONNECT_BASE_MS;
  const socket = ws;
  ws = null;
  if (socket) {
    socket.onopen = null;
    socket.onmessage = null;
    socket.onclose = null;
    socket.onerror = null;
    try {
      socket.close();
    } catch {
      /* noop */
    }
  }
}

/** Subscribe a consumer; returns an unsubscribe that stops polling when the last leaves. */
export function subscribe(sub: AttentionSubscriber): () => void {
  const wasEmpty = subs.size === 0;
  subs.add(sub);
  if (wasEmpty) {
    bindVisibility();
    // Open the one shared live socket for the whole app. Falls back to polling
    // if the WS can't be established.
    void connectWs();
  }
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
      closeWs();
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
  closeWs();
  subs.clear();
  unbindVisibility();
  snapshot = INITIAL;
}
