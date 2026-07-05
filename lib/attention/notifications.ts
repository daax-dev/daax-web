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
 *   `notification` event flowing through the adapter. Watchtower exposes NO REST
 *   endpoint for notification events (its `events` table is write-only) and its
 *   only live channel is an unauthenticated, unscoped, no-replay `/ws` bus, so
 *   the REST-backed Attention board cannot currently source `waiting` from live
 *   data. This engine therefore lights up automatically the moment `waiting`
 *   becomes sourceable (a `/ws` bridge or a future `/api/sessions/{id}/events`
 *   REST endpoint) with no change here — it keys on the shared status model, not
 *   on any invented signal. Nothing is faked.
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

/** A fresh, empty engine state. */
export function initialState(): NotifyState {
  return { waiting: {}, entries: {} };
}

function isWaiting(card: NotifyCard): boolean {
  return card != null && card.status === WAITING && typeof card.id === "string" && card.id !== "";
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
): ReconcileResult {
  const nextWaiting: Record<string, true> = {};
  const nextEntries: Record<string, NotifyEntry> = {};
  const toNotify: NotifyCard[] = [];

  // De-dupe by id defensively (a malformed snapshot could repeat a session);
  // the first occurrence wins so a later duplicate can't spawn a second alert.
  const seen = new Set<string>();

  for (const card of cards ?? []) {
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

  // Any prior entry whose session is no longer waiting (or gone) is dropped:
  // that is the auto-clear on next activity. Achieved implicitly — we only
  // carried forward entries for sessions still in `nextWaiting`.

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
  const entries: Record<string, NotifyEntry> = {};
  for (const id in state.entries) {
    entries[id] = { ...state.entries[id], acknowledged: true };
  }
  return { waiting: state.waiting, entries };
}

/** Marks a single entry acknowledged (e.g. its bell row was clicked). Pure. */
export function acknowledgeOne(state: NotifyState, id: string): NotifyState {
  const target = state.entries[id];
  if (!target || target.acknowledged) return state;
  return {
    waiting: state.waiting,
    entries: { ...state.entries, [id]: { ...target, acknowledged: true } },
  };
}
