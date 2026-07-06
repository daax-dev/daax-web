/**
 * Pure blocked-agent notification engine (issue #154).
 *
 * Decoupled from React, the network, timers and the browser Notification API so
 * the transition/dedup/acknowledgement logic can be exhaustively unit-tested.
 * The hook (hooks/useBlockedAgents.ts) is a thin adapter that feeds polled
 * Attention cards into `reconcile`, fires a browser Notification for each entry
 * in `toNotify`, and renders the resulting entries in the bell.
 *
 * SIGNAL SOURCE (be precise — see docs/decisions and the PR body):
 *   The engine is driven off the Attention board's derived status model
 *   (lib/attention/status.ts): a session is "blocked / waiting-for-input" iff
 *   its derived status is `waiting`. That status is produced by a Watchtower
 *   `notification` event flowing through the adapter. `waiting` can now come from
 *   live data: this stack adds a `?stream=attention` `/ws` bridge whose reducer
 *   (lib/attention/live.ts) applies `notification` frames to `waiting`, so this
 *   engine lights up automatically once the socket connects. Watchtower still
 *   exposes NO REST endpoint for notification events (its `events` table is
 *   write-only), so the remaining limitation is replay/seeding — a session
 *   already waiting BEFORE the socket connects isn't sourced until it emits a new
 *   event or the REST snapshot resyncs (a future `/api/sessions/{id}/events`
 *   endpoint would seed pre-existing waiting state). It keys on the shared status
 *   model, not on any invented signal. Nothing is faked.
 *
 * Design: a level-triggered edge detector over successive polled snapshots.
 * Comparing "is this session waiting now?" against "was it waiting last poll?"
 * makes the engine robust to duplicate/out-of-order individual events (the
 * status derivation already normalises those) — exactly one notification per
 * genuine not-waiting → waiting transition, and no re-fire while a session stays
 * waiting across polls.
 */

/** Minimal per-session view the engine needs (subset of AttentionCard). */
export interface NotifyCard {
  id: string;
  /** Human label for the notification body (host or short id). */
  label: string;
  /** Derived status; only `waiting` is actionable here. */
  status: string;
  /** Epoch ms the current status began, or null. */
  since?: number | null;
  /** Optional working directory, surfaced in the bell entry for context. */
  cwd?: string;
}

/** An active blocked-session notification shown in the bell. */
export interface NotifyEntry {
  id: string;
  label: string;
  cwd: string;
  /** Epoch ms the session entered the waiting state (from card.since), or null. */
  since: number | null;
  /** Cleared once the user opens the bell / clicks the entry. */
  acknowledged: boolean;
}

/**
 * Engine state. `waiting` is the previous-poll waiting set used for edge
 * detection; `entries` are the live notifications keyed by session id. Both are
 * plain serialisable maps so state can be snapshotted/rehydrated freely.
 */
export interface NotifyState {
  /** Session ids that were waiting at the previous reconcile. */
  waiting: Record<string, true>;
  /** Active entries keyed by session id (insertion order preserved for display). */
  entries: Record<string, NotifyEntry>;
}

export interface ReconcileResult {
  state: NotifyState;
  /**
   * Sessions that transitioned not-waiting → waiting on THIS reconcile. The
   * caller fires exactly one browser Notification per element. Empty when
   * nothing newly blocked (so repeated waiting polls never storm).
   */
  toNotify: NotifyCard[];
}

const WAITING = "waiting";

/**
 * Prototype-less map so a hostile/malformed session id like "__proto__" or
 * "constructor" is stored as an ordinary key instead of walking/corrupting the
 * Object prototype (which would also make `prev.waiting[id]` truthy by accident).
 */
function emptyMap<T>(): Record<string, T> {
  return Object.create(null) as Record<string, T>;
}

/** A fresh, empty engine state. */
export function initialState(): NotifyState {
  return { waiting: emptyMap<true>(), entries: emptyMap<NotifyEntry>() };
}

export interface ReconcileOptions {
  /**
   * True when the upstream session list was capped server-side (see
   * AttentionResponse.truncated). Under truncation a session can drop out of one
   * snapshot and reappear in the next purely because of the cap, so an entry
   * that is merely ABSENT must NOT be auto-cleared — only an explicit
   * non-waiting status clears it. Prevents a false clear+re-fire (the browser
   * Notification uses renotify) as a waiting session flaps across the cap.
   */
  truncated?: boolean;
}

function isWaiting(card: NotifyCard): boolean {
  return (
    card != null &&
    card.status === WAITING &&
    typeof card.id === "string" &&
    card.id !== ""
  );
}

/**
 * Folds the current poll snapshot into the engine.
 *
 * - not-waiting → waiting: emit one notification, create an unacknowledged entry.
 * - staying waiting: keep the existing entry untouched (no re-fire, preserves
 *   acknowledged flag and original `since`).
 * - waiting → not-waiting, or the session vanished from the snapshot: auto-clear
 *   its entry (the alert clears when the session leaves waiting / next activity).
 *
 * Order-independent w.r.t. the input list; deterministic; never mutates `prev`.
 */
export function reconcile(
  prev: NotifyState,
  cards: readonly NotifyCard[],
  opts: ReconcileOptions = {},
): ReconcileResult {
  const nextWaiting = emptyMap<true>();
  const nextEntries = emptyMap<NotifyEntry>();
  const toNotify: NotifyCard[] = [];

  // De-dupe by id defensively (a malformed snapshot could repeat a session);
  // the first occurrence wins so a later duplicate can't spawn a second alert.
  const seen = new Set<string>();
  // Every id present in this snapshot (any status) — used to distinguish
  // "present but no longer waiting" (explicit clear) from "absent" (which under
  // truncation must be preserved, not cleared).
  const present = new Set<string>();

  for (const card of cards ?? []) {
    if (card == null || typeof card.id !== "string" || card.id === "") continue;
    present.add(card.id);
    if (!isWaiting(card)) continue;
    if (seen.has(card.id)) continue;
    seen.add(card.id);

    nextWaiting[card.id] = true;

    const existing = prev.entries[card.id];
    if (prev.waiting[card.id] && existing) {
      // Same waiting episode: carry the entry forward verbatim (no re-fire).
      nextEntries[card.id] = existing;
    } else {
      // Genuine not-waiting → waiting transition (or a re-block after clearing):
      // fire once and open a fresh unacknowledged entry.
      nextEntries[card.id] = {
        id: card.id,
        label: card.label || card.id.slice(0, 8),
        cwd: card.cwd?.trim() || "",
        since: card.since ?? null,
        acknowledged: false,
      };
      toNotify.push(card);
    }
  }

  // Non-waiting present sessions and absent sessions have their prior entry
  // dropped (auto-clear on next activity) — achieved implicitly, since only
  // still-waiting sessions were carried above. EXCEPTION: under truncation a
  // prior entry that is simply ABSENT (not present with a non-waiting status)
  // is preserved so a cap-boundary flap does not clear+re-fire.
  if (opts.truncated) {
    for (const id in prev.entries) {
      if (nextEntries[id] || present.has(id)) continue;
      nextEntries[id] = prev.entries[id];
      nextWaiting[id] = true;
    }
  }

  return { state: { waiting: nextWaiting, entries: nextEntries }, toNotify };
}

/** Ordered list of active entries (for the bell dropdown). */
export function entryList(state: NotifyState): NotifyEntry[] {
  return Object.values(state.entries);
}

/** Number of unacknowledged entries (drives the bell badge count). */
export function unacknowledgedCount(state: NotifyState): number {
  let n = 0;
  for (const id in state.entries) {
    if (!state.entries[id].acknowledged) n++;
  }
  return n;
}

/** Marks every active entry acknowledged (e.g. the bell was opened). Pure. */
export function acknowledgeAll(state: NotifyState): NotifyState {
  const entries = emptyMap<NotifyEntry>();
  for (const id in state.entries) {
    entries[id] = { ...state.entries[id], acknowledged: true };
  }
  return { waiting: state.waiting, entries };
}

/** Marks a single entry acknowledged (e.g. its bell row was clicked). Pure. */
export function acknowledgeOne(state: NotifyState, id: string): NotifyState {
  const target = state.entries[id];
  if (!target || target.acknowledged) return state;
  const entries = emptyMap<NotifyEntry>();
  for (const key in state.entries) entries[key] = state.entries[key];
  entries[id] = { ...target, acknowledged: true };
  return { waiting: state.waiting, entries };
}
