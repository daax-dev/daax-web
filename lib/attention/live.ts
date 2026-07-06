/**
 * Pure reducer: apply a live Watchtower WebSocket event to the Attention card
 * set (issue #153).
 *
 * The Attention board seeds its card list from the REST snapshot
 * (GET /api/watchtower/attention) and then applies live deltas from Watchtower's
 * broadcast WebSocket bus (relayed through the daax-web bridge). This module maps
 * one wire message → a card mutation. It is deliberately React- and I/O-free so
 * every message type can be exhaustively unit-tested.
 *
 * Forward-compatibility: unknown / future message types are ignored (the card
 * set is returned unchanged), so a Watchtower protocol addition never breaks the
 * board. The REST snapshot remains the source of truth for the full card set;
 * these deltas only accelerate updates between/without polls.
 */

import type { AttentionCard } from "./adapter";
import { bucketIndexFor, bucketTimestamps } from "./sparkline";

/**
 * Watchtower wire message (pkg/protocol/message.go). Only the envelope fields
 * are typed; `payload` is type-specific and validated defensively per handler.
 */
export interface WatchtowerWsMessage {
  type: string;
  session_id: string;
  timestamp?: string;
  host?: string;
  payload?: unknown;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

/** Parse the RFC-3339 message timestamp to epoch ms, clamped to `now`, else now. */
function eventTime(msg: WatchtowerWsMessage, now: number): number {
  const t = msg.timestamp ? Date.parse(msg.timestamp) : NaN;
  if (!Number.isFinite(t)) return now;
  return t > now ? now : t;
}

/**
 * Parse a raw bridge frame into a typed message, or null when it is not a
 * usable Watchtower envelope (dropped silently so a malformed frame can't crash
 * the board).
 */
export function parseWsMessage(raw: string): WatchtowerWsMessage | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObject(data)) return null;
  const type = data.type;
  const sessionId = data.session_id;
  if (typeof type !== "string" || typeof sessionId !== "string" || !sessionId) {
    return null;
  }
  return {
    type,
    session_id: sessionId,
    timestamp: asString(data.timestamp),
    host: asString(data.host),
    payload: data.payload,
  };
}

/** Immutably replace the card with `id`, dropping it when `next` is null. */
function patchCard(
  cards: readonly AttentionCard[],
  id: string,
  next: (card: AttentionCard) => AttentionCard | null,
): AttentionCard[] {
  let changed = false;
  const out: AttentionCard[] = [];
  for (const card of cards) {
    if (card.id !== id) {
      out.push(card);
      continue;
    }
    const patched = next(card);
    if (patched === null) {
      // Card dropped (e.g. session_end) — this is a change.
      changed = true;
    } else if (patched !== card) {
      // Reducer produced a new object — substitute it and mark changed.
      changed = true;
      out.push(patched);
    } else {
      // Idempotent event: reducer returned the same reference, so keep the
      // original card and do NOT flag a change. This lets a duplicate/no-op
      // WS event preserve the original array reference (React bails the render).
      out.push(card);
    }
  }
  return changed ? out : (cards as AttentionCard[]);
}

/** Minimal card for a session first seen via a live start/resume event. */
function minimalCard(
  msg: WatchtowerWsMessage,
  at: number,
  now: number,
): AttentionCard {
  const payload = isObject(msg.payload) ? msg.payload : {};
  const host = asString(msg.host) ?? "";
  return {
    id: msg.session_id,
    label: host || msg.session_id.slice(0, 8),
    host,
    cwd: asString(payload.working_dir) ?? "",
    repoBranch: asString(payload.branch) ?? null,
    status: "idle",
    since: at,
    lastTool: null,
    toolCount: 0,
    // Correctly-sized zeroed sparkline; the next REST resync fills real buckets.
    sparkline: bucketTimestamps([], now),
  };
}

/**
 * Apply a single live event to the card set, returning a new array when
 * something changed (same reference otherwise, so React can bail out of an
 * unnecessary render). Only attention-relevant types mutate state; everything
 * else is ignored for forward-compatibility.
 */
export function applyLiveEvent(
  cards: readonly AttentionCard[],
  msg: WatchtowerWsMessage,
  now: number,
): AttentionCard[] {
  const at = eventTime(msg, now);
  const id = msg.session_id;
  const payload = isObject(msg.payload) ? msg.payload : {};

  switch (msg.type) {
    case "session_end":
      // Terminated: drop the card (the board only shows active sessions).
      return patchCard(cards, id, () => null);

    case "notification":
    case "permission_request":
      // Agent is blocked on human input → needs attention. `since` marks when the
      // session FIRST entered the current waiting episode, so a later waiting-type
      // event for a session that is ALREADY waiting must not reset it (that would
      // shorten "time in waiting" and make the bell/board look freshly blocked).
      // Only stamp `since` when transitioning INTO waiting from another status.
      return patchCard(cards, id, (c) =>
        c.status === "waiting" ? c : { ...c, status: "waiting", since: at },
      );

    case "prompt_submit":
      return patchCard(cards, id, (c) => ({
        ...c,
        status: "working",
        since: at,
      }));

    case "tool_pre":
      return patchCard(cards, id, (c) => ({
        ...c,
        status: "working",
        since: at,
        lastTool: asString(payload.tool_name) ?? c.lastTool,
      }));

    case "tool_post": {
      const hasError = asString(payload.error) !== undefined;
      return patchCard(cards, id, (c) => {
        const spark = c.sparkline.slice();
        // Bucket the increment by the event's own timestamp so a delayed /
        // out-of-order WS message lands in the correct bucket instead of always
        // the newest one. Events older than the sparkline window are dropped.
        const idx = bucketIndexFor(at, now, spark.length);
        if (idx >= 0) spark[idx] += 1;
        return {
          ...c,
          status: hasError ? "error" : "working",
          since: at,
          lastTool: asString(payload.tool_name) ?? c.lastTool,
          toolCount: c.toolCount + 1,
          sparkline: spark,
        };
      });
    }

    case "session_start":
    case "session_resume": {
      // Create a placeholder card if this session isn't on the board yet, so a
      // freshly-started agent appears live; otherwise leave the richer
      // REST-derived card untouched.
      if (cards.some((c) => c.id === id)) return cards as AttentionCard[];
      return [...cards, minimalCard(msg, at, now)];
    }

    default:
      // subagent_stop, pre_compact, interrupt, teleport, tool events routed as
      // generic, and any future type: no attention-state change.
      return cards as AttentionCard[];
  }
}
