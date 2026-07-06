/**
 * Unit tests for the live-event reducer (issue #153).
 *
 * Exhaustively covers the mapping from a Watchtower WS message to a card
 * mutation, plus the forward-compatibility and malformed-input guarantees the
 * board relies on.
 */

import { describe, it, expect } from "vitest";
import {
  applyLiveEvent,
  mergeWaitingOnResync,
  parseWsMessage,
  type WatchtowerWsMessage,
} from "@/lib/attention/live";
import type { AttentionCard } from "@/lib/attention/adapter";

const NOW = 1_000_000;

function card(overrides: Partial<AttentionCard> = {}): AttentionCard {
  return {
    id: "s1",
    label: "host-a",
    host: "host-a",
    cwd: "/repo",
    repoBranch: "main",
    status: "idle",
    since: 1,
    lastTool: null,
    toolCount: 0,
    sparkline: [0, 0, 1],
    ...overrides,
  };
}

function msg(overrides: Partial<WatchtowerWsMessage>): WatchtowerWsMessage {
  return {
    type: "tool_post",
    session_id: "s1",
    timestamp: new Date(NOW - 500).toISOString(),
    ...overrides,
  };
}

describe("applyLiveEvent", () => {
  it("notification marks the session waiting (blocked on input)", () => {
    const out = applyLiveEvent([card()], msg({ type: "notification" }), NOW);
    expect(out[0].status).toBe("waiting");
  });

  it("permission_request marks the session waiting", () => {
    const out = applyLiveEvent(
      [card()],
      msg({ type: "permission_request" }),
      NOW,
    );
    expect(out[0].status).toBe("waiting");
  });

  it("prompt_submit marks the session working", () => {
    const out = applyLiveEvent([card()], msg({ type: "prompt_submit" }), NOW);
    expect(out[0].status).toBe("working");
  });

  it("tool_pre sets working and updates the last tool without counting it", () => {
    const out = applyLiveEvent(
      [card()],
      msg({ type: "tool_pre", payload: { tool_name: "bash" } }),
      NOW,
    );
    expect(out[0].status).toBe("working");
    expect(out[0].lastTool).toBe("bash");
    expect(out[0].toolCount).toBe(0);
  });

  it("tool_post counts the tool, updates last tool, and bumps the sparkline", () => {
    const out = applyLiveEvent(
      [card()],
      msg({ type: "tool_post", payload: { tool_name: "grep" } }),
      NOW,
    );
    expect(out[0].status).toBe("working");
    expect(out[0].lastTool).toBe("grep");
    expect(out[0].toolCount).toBe(1);
    expect(out[0].sparkline[out[0].sparkline.length - 1]).toBe(2);
  });

  it("tool_post buckets an out-of-order event by its own timestamp, not the newest bucket", () => {
    // 3-bucket sparkline over the default 10-minute window: bucketMs = 200_000ms.
    // A delayed event ~9 minutes old must land in the FIRST bucket, leaving the
    // newest bucket untouched (regression: it used to always bump the last one).
    const out = applyLiveEvent(
      [card({ sparkline: [0, 0, 0] })],
      msg({
        type: "tool_post",
        timestamp: new Date(NOW - 550_000).toISOString(),
        payload: { tool_name: "grep" },
      }),
      NOW,
    );
    expect(out[0].sparkline).toEqual([1, 0, 0]);
    expect(out[0].toolCount).toBe(1);
  });

  it("tool_post with an error marks the session error", () => {
    const out = applyLiveEvent(
      [card()],
      msg({ type: "tool_post", payload: { tool_name: "bash", error: "boom" } }),
      NOW,
    );
    expect(out[0].status).toBe("error");
  });

  it("session_end removes the card", () => {
    const out = applyLiveEvent(
      [card(), card({ id: "s2" })],
      msg({ type: "session_end" }),
      NOW,
    );
    expect(out.map((c) => c.id)).toEqual(["s2"]);
  });

  it("session_start adds a placeholder card for an unseen session", () => {
    const out = applyLiveEvent(
      [],
      msg({
        type: "session_start",
        session_id: "new1",
        host: "worker-9",
        payload: { working_dir: "/w", branch: "feat" },
      }),
      NOW,
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: "new1",
      host: "worker-9",
      cwd: "/w",
      repoBranch: "feat",
      status: "idle",
    });
    // Correctly-sized zeroed sparkline from the shared bucketing helper.
    expect(out[0].sparkline.every((n) => n === 0)).toBe(true);
  });

  it("session_start does not duplicate an existing card", () => {
    const existing = [card()];
    const out = applyLiveEvent(
      existing,
      msg({ type: "session_start", session_id: "s1" }),
      NOW,
    );
    expect(out).toBe(existing); // unchanged reference
  });

  it("an idempotent event (reducer returns the same card) preserves the array reference", () => {
    // First notification transitions idle → waiting at `at` (a real change).
    const waitingAt = NOW - 500; // matches msg() default timestamp
    const existing = [card({ status: "waiting", since: waitingAt })];
    // A duplicate notification for the same session at the same instant is a
    // no-op in the reducer (returns the same card object), so applyLiveEvent
    // must hand back the ORIGINAL array — no new reference, no rerender.
    const out = applyLiveEvent(existing, msg({ type: "notification" }), NOW);
    expect(out).toBe(existing);
    expect(out[0]).toBe(existing[0]);
  });

  it("keeps the original `since` for a session that is already waiting", () => {
    // Session entered waiting earlier; a second waiting-type event with a LATER
    // timestamp must NOT reset `since` (that would shorten time-in-waiting and
    // make the board look freshly blocked). `since` marks the FIRST entry into
    // the current waiting episode.
    const firstEnteredAt = NOW - 5_000;
    const existing = [card({ status: "waiting", since: firstEnteredAt })];
    const out = applyLiveEvent(
      existing,
      msg({
        type: "notification",
        timestamp: new Date(NOW - 100).toISOString(),
      }),
      NOW,
    );
    // Already waiting → no-op: original `since`, original references preserved.
    expect(out[0].since).toBe(firstEnteredAt);
    expect(out).toBe(existing);
    expect(out[0]).toBe(existing[0]);
  });

  it("stamps `since` when transitioning INTO waiting from a non-waiting status", () => {
    const out = applyLiveEvent(
      [card({ status: "working", since: NOW - 5_000 })],
      msg({
        type: "notification",
        timestamp: new Date(NOW - 100).toISOString(),
      }),
      NOW,
    );
    expect(out[0].status).toBe("waiting");
    expect(out[0].since).toBe(NOW - 100);
  });

  it("ignores unknown/future message types (forward-compatible)", () => {
    const existing = [card()];
    for (const type of ["subagent_stop", "pre_compact", "interrupt", "wat"]) {
      const out = applyLiveEvent(existing, msg({ type }), NOW);
      expect(out).toBe(existing);
    }
  });

  it("ignores events for sessions not on the board (except start/resume)", () => {
    const existing = [card()];
    const out = applyLiveEvent(
      existing,
      msg({ type: "tool_post", session_id: "ghost" }),
      NOW,
    );
    expect(out).toBe(existing);
  });

  it("clamps future timestamps to now", () => {
    const out = applyLiveEvent(
      [card()],
      msg({
        type: "tool_pre",
        timestamp: new Date(NOW + 10_000).toISOString(),
      }),
      NOW,
    );
    expect(out[0].since).toBe(NOW);
  });
});

describe("mergeWaitingOnResync (issue #156)", () => {
  const WAIT_SINCE = 500_000;

  it("carries WS-derived waiting onto a fresh REST card with no newer activity", () => {
    const prev = [card({ status: "waiting", since: WAIT_SINCE, toolCount: 3 })];
    // REST re-derives idle/working from the SAME (older) tools — no new work.
    const fresh = [
      card({ status: "idle", since: WAIT_SINCE - 10_000, toolCount: 3 }),
    ];
    const out = mergeWaitingOnResync(prev, fresh);
    expect(out[0].status).toBe("waiting");
    expect(out[0].since).toBe(WAIT_SINCE); // original waiting-enter time kept
  });

  it("keeps fresh REST fields while restoring the waiting overlay", () => {
    const prev = [card({ status: "waiting", since: WAIT_SINCE, toolCount: 1 })];
    const fresh = [
      card({
        status: "idle",
        since: WAIT_SINCE - 1,
        toolCount: 1,
        cwd: "/new-path",
        sparkline: [1, 2, 3],
      }),
    ];
    const out = mergeWaitingOnResync(prev, fresh);
    expect(out[0].status).toBe("waiting");
    expect(out[0].cwd).toBe("/new-path"); // richer REST data preserved
    expect(out[0].sparkline).toEqual([1, 2, 3]);
  });

  it("clears waiting when REST shows a newer tool (toolCount increased)", () => {
    const prev = [card({ status: "waiting", since: WAIT_SINCE, toolCount: 2 })];
    const fresh = [
      card({ status: "working", since: WAIT_SINCE + 5_000, toolCount: 3 }),
    ];
    const out = mergeWaitingOnResync(prev, fresh);
    expect(out[0].status).toBe("working");
    expect(out[0].since).toBe(WAIT_SINCE + 5_000);
  });

  it("clears waiting when REST shows a newer status run (later since)", () => {
    const prev = [card({ status: "waiting", since: WAIT_SINCE, toolCount: 4 })];
    // Same toolCount but a newer run start — a fresh status transition.
    const fresh = [
      card({ status: "working", since: WAIT_SINCE + 1, toolCount: 4 }),
    ];
    expect(mergeWaitingOnResync(prev, fresh)[0].status).toBe("working");
  });

  it("clears waiting when the session has ended (REST status done)", () => {
    const prev = [card({ status: "waiting", since: WAIT_SINCE, toolCount: 1 })];
    const fresh = [
      card({ status: "done", since: WAIT_SINCE - 100, toolCount: 1 }),
    ];
    expect(mergeWaitingOnResync(prev, fresh)[0].status).toBe("done");
  });

  it("drops the overlay when the session disappears from REST", () => {
    const prev = [card({ status: "waiting", since: WAIT_SINCE })];
    const out = mergeWaitingOnResync(prev, []); // session gone
    expect(out).toHaveLength(0);
  });

  it("only carries cards that were waiting (others pass through untouched)", () => {
    const prev = [
      card({ id: "s1", status: "waiting", since: WAIT_SINCE, toolCount: 0 }),
      card({ id: "s2", status: "working", since: 1, toolCount: 0 }),
    ];
    const fresh = [
      card({ id: "s1", status: "idle", since: WAIT_SINCE - 1, toolCount: 0 }),
      card({ id: "s2", status: "idle", since: 2, toolCount: 0 }),
    ];
    const out = mergeWaitingOnResync(prev, fresh);
    expect(out.find((c) => c.id === "s1")?.status).toBe("waiting");
    expect(out.find((c) => c.id === "s2")?.status).toBe("idle");
  });

  it("returns the fresh set unchanged when nothing was waiting", () => {
    const prev = [card({ status: "idle" })];
    const fresh = [card({ status: "working" })];
    expect(mergeWaitingOnResync(prev, fresh)).toBe(fresh);
  });
});

describe("parseWsMessage", () => {
  it("parses a well-formed envelope", () => {
    const parsed = parseWsMessage(
      JSON.stringify({
        type: "tool_post",
        session_id: "s1",
        timestamp: "2026-01-01T00:00:00Z",
        host: "h",
        payload: { tool_name: "bash" },
      }),
    );
    expect(parsed).toMatchObject({ type: "tool_post", session_id: "s1" });
  });

  it("rejects malformed JSON", () => {
    expect(parseWsMessage("{not json")).toBeNull();
  });

  it("rejects envelopes missing type or session_id", () => {
    expect(parseWsMessage(JSON.stringify({ type: "tool_post" }))).toBeNull();
    expect(parseWsMessage(JSON.stringify({ session_id: "s1" }))).toBeNull();
    expect(
      parseWsMessage(JSON.stringify({ type: "x", session_id: "" })),
    ).toBeNull();
  });
});
