/**
 * Pure status-derivation for the Attention board (issue #153).
 *
 * This module is deliberately decoupled from React, the network, and
 * Watchtower's wire format. It consumes an abstract, ordered event model and
 * derives a single glanceable status per agent session. Everything here is a
 * pure function of its inputs (events + `now`) so it can be exhaustively
 * unit-tested against representative sequences and edge cases.
 *
 * Status model (from the issue):
 *   🟢 working  — recent Pre/PostToolUse activity
 *   🟡 waiting  — Notification (agent is blocked on human input)
 *   ⚪ idle     — Stop with no new prompt, or activity gone quiet
 *   ✅ done      — SessionEnd
 *   🔴 error    — tool error / abnormal end
 */

export type AttentionStatus = "working" | "waiting" | "idle" | "done" | "error";

/**
 * Abstract event vocabulary. Adapters (e.g. lib/attention/adapter.ts) map a
 * concrete data source into this shape; the derivation never sees wire types.
 */
export type AttentionEventType =
  | "session_start"
  | "prompt"
  | "tool_pre"
  | "tool_post"
  | "tool_error"
  | "notification"
  | "stop"
  | "session_end";

export interface AttentionEvent {
  type: AttentionEventType;
  /** Event time as epoch milliseconds. */
  at: number;
}

export interface DerivedStatus {
  status: AttentionStatus;
  /**
   * Epoch ms at which the current status began (for "time-in-current-state").
   * `null` when there are no usable events.
   */
  since: number | null;
}

export interface DeriveOptions {
  /**
   * Tool/prompt activity older than this (measured against `now`) no longer
   * counts as "working" — the session is treated as idle. This makes a session
   * that went silent without an explicit Stop degrade to ⚪ instead of being
   * stuck on 🟢 forever.
   */
  workingWindowMs?: number;
}

/** Default: activity within the last 60s counts as actively working. */
export const DEFAULT_WORKING_WINDOW_MS = 60_000;

/**
 * Tie-break weight for events that share an identical timestamp. Higher wins
 * (is treated as "later"), so a tool that finished with an error beats its own
 * post, and a session end beats everything. This keeps derivation deterministic
 * under duplicate/simultaneous timestamps.
 */
const FINALITY_WEIGHT: Record<AttentionEventType, number> = {
  session_start: 0,
  prompt: 1,
  tool_pre: 2,
  tool_post: 3,
  notification: 4,
  stop: 5,
  tool_error: 6,
  session_end: 7,
};

/** The status implied by a single event, ignoring recency. */
function impliedStatus(type: AttentionEventType): AttentionStatus {
  switch (type) {
    case "prompt":
    case "tool_pre":
    case "tool_post":
      return "working";
    case "tool_error":
      return "error";
    case "notification":
      return "waiting";
    case "stop":
    case "session_start":
      return "idle";
    case "session_end":
      return "done";
  }
}

/**
 * Derives the current status for a session from its event history.
 *
 * The function is order-independent: events are defensively sorted by `at`
 * (with a finality tie-break) before evaluation, so out-of-order and duplicate
 * inputs produce the same result. The most recent event determines the status;
 * a "working" status additionally decays to "idle" once activity is older than
 * `workingWindowMs`.
 */
export function deriveStatus(
  events: readonly AttentionEvent[],
  now: number,
  opts: DeriveOptions = {},
): DerivedStatus {
  const workingWindowMs = opts.workingWindowMs ?? DEFAULT_WORKING_WINDOW_MS;

  // Drop malformed events (missing/non-finite timestamps) so a single bad
  // record can't poison the sort or the result.
  const valid = events.filter(
    (e): e is AttentionEvent =>
      e != null &&
      typeof e.at === "number" &&
      Number.isFinite(e.at) &&
      e.type in FINALITY_WEIGHT,
  );

  if (valid.length === 0) return { status: "idle", since: null };

  const sorted = [...valid].sort(
    (a, b) => a.at - b.at || FINALITY_WEIGHT[a.type] - FINALITY_WEIGHT[b.type],
  );

  const last = sorted[sorted.length - 1];
  const eventStatus = impliedStatus(last.type);

  // Recency decay: a "working" verdict only holds while activity is fresh.
  // Once stale (no explicit Stop/End), the session is idle as of its last
  // activity — that timestamp is when it effectively went quiet.
  if (eventStatus === "working" && now - last.at > workingWindowMs) {
    return { status: "idle", since: last.at };
  }

  // Extend `since` back over the consecutive run of same-status events so the
  // UI reports how long the session has genuinely been in this state.
  let since = last.at;
  for (let i = sorted.length - 2; i >= 0; i--) {
    if (impliedStatus(sorted[i].type) === eventStatus) {
      since = sorted[i].at;
    } else {
      break;
    }
  }

  return { status: eventStatus, since };
}
