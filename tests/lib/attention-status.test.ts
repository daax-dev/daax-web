/**
 * Unit tests for the pure Attention status-derivation (issue #153, AC #6).
 *
 * Covers all five states, transitions between them, the recency decay of
 * "working" → "idle", and edge cases: out-of-order input, duplicate/simultaneous
 * events, malformed records, and empty history.
 */

import { describe, it, expect } from "vitest";
import {
  deriveStatus,
  DEFAULT_WORKING_WINDOW_MS,
  type AttentionEvent,
} from "@/lib/attention/status";

const T0 = 1_000_000_000_000; // fixed base epoch ms
const ev = (
  type: AttentionEvent["type"],
  atOffsetMs: number,
): AttentionEvent => ({
  type,
  at: T0 + atOffsetMs,
});

describe("deriveStatus — five states", () => {
  it("🟢 working: a recent tool_post", () => {
    const events = [ev("session_start", 0), ev("tool_post", 5_000)];
    const now = T0 + 6_000;
    expect(deriveStatus(events, now).status).toBe("working");
  });

  it("🟢 working: a recent prompt (agent picked up work)", () => {
    const events = [ev("session_start", 0), ev("prompt", 2_000)];
    const now = T0 + 2_500;
    expect(deriveStatus(events, now).status).toBe("working");
  });

  it("🟡 waiting: a notification is the latest event", () => {
    const events = [ev("tool_post", 1_000), ev("notification", 2_000)];
    const now = T0 + 3_000;
    expect(deriveStatus(events, now).status).toBe("waiting");
  });

  it("⚪ idle: explicit stop with no new prompt", () => {
    const events = [ev("tool_post", 1_000), ev("stop", 2_000)];
    const now = T0 + 3_000;
    expect(deriveStatus(events, now).status).toBe("idle");
  });

  it("⚪ idle: only a session_start", () => {
    const events = [ev("session_start", 0)];
    const now = T0 + 500;
    expect(deriveStatus(events, now).status).toBe("idle");
  });

  it("✅ done: session_end is the latest event", () => {
    const events = [ev("tool_post", 1_000), ev("session_end", 2_000)];
    const now = T0 + 10_000;
    expect(deriveStatus(events, now).status).toBe("done");
  });

  it("🔴 error: a tool_error is the latest event", () => {
    const events = [ev("tool_post", 1_000), ev("tool_error", 2_000)];
    const now = T0 + 2_500;
    expect(deriveStatus(events, now).status).toBe("error");
  });
});

describe("deriveStatus — working recency decay", () => {
  it("decays working → idle once activity is older than the window", () => {
    const lastAt = 1_000;
    const events = [ev("tool_post", lastAt)];
    const now = T0 + lastAt + DEFAULT_WORKING_WINDOW_MS + 1;
    const r = deriveStatus(events, now);
    expect(r.status).toBe("idle");
    // `since` is when it effectively went quiet: the last activity time.
    expect(r.since).toBe(T0 + lastAt);
  });

  it("stays working right at the window boundary", () => {
    const lastAt = 1_000;
    const events = [ev("tool_post", lastAt)];
    const now = T0 + lastAt + DEFAULT_WORKING_WINDOW_MS; // exactly at edge
    expect(deriveStatus(events, now).status).toBe("working");
  });

  it("honours a custom workingWindowMs", () => {
    const events = [ev("tool_post", 0)];
    const now = T0 + 3_000;
    expect(deriveStatus(events, now, { workingWindowMs: 2_000 }).status).toBe(
      "idle",
    );
    expect(deriveStatus(events, now, { workingWindowMs: 5_000 }).status).toBe(
      "working",
    );
  });
});

describe("deriveStatus — transitions", () => {
  it("error clears when a new tool runs (retry)", () => {
    const events = [ev("tool_error", 1_000), ev("tool_pre", 2_000)];
    const now = T0 + 2_200;
    expect(deriveStatus(events, now).status).toBe("working");
  });

  it("idle → working when a prompt arrives after a stop", () => {
    const events = [ev("stop", 1_000), ev("prompt", 2_000)];
    const now = T0 + 2_100;
    expect(deriveStatus(events, now).status).toBe("working");
  });

  it("waiting → working when the human replies (prompt after notification)", () => {
    const events = [ev("notification", 1_000), ev("prompt", 2_000)];
    const now = T0 + 2_100;
    expect(deriveStatus(events, now).status).toBe("working");
  });

  it("a resumed session (tool after session_end) reads as working again", () => {
    const events = [ev("session_end", 1_000), ev("tool_post", 2_000)];
    const now = T0 + 2_100;
    expect(deriveStatus(events, now).status).toBe("working");
  });
});

describe("deriveStatus — `since` (time-in-state)", () => {
  it("extends `since` back over a consecutive working run", () => {
    const events = [
      ev("prompt", 1_000),
      ev("tool_pre", 1_200),
      ev("tool_post", 1_400),
    ];
    const now = T0 + 1_500;
    const r = deriveStatus(events, now);
    expect(r.status).toBe("working");
    // Working began at the prompt (start of the run), not the last tool.
    expect(r.since).toBe(T0 + 1_000);
  });

  it("resets `since` at the boundary when status changes", () => {
    const events = [ev("tool_post", 1_000), ev("stop", 5_000)];
    const now = T0 + 6_000;
    const r = deriveStatus(events, now);
    expect(r.status).toBe("idle");
    expect(r.since).toBe(T0 + 5_000);
  });
});

describe("deriveStatus — edge cases", () => {
  it("empty history → idle with null since", () => {
    expect(deriveStatus([], T0)).toEqual({ status: "idle", since: null });
  });

  it("is order-independent (shuffled input matches sorted input)", () => {
    const sorted = [
      ev("session_start", 0),
      ev("tool_post", 1_000),
      ev("notification", 2_000),
    ];
    const shuffled = [sorted[2], sorted[0], sorted[1]];
    const now = T0 + 2_500;
    expect(deriveStatus(shuffled, now)).toEqual(deriveStatus(sorted, now));
  });

  it("tie-break: error wins over a post sharing the same timestamp", () => {
    const events = [ev("tool_post", 2_000), ev("tool_error", 2_000)];
    const now = T0 + 2_100;
    expect(deriveStatus(events, now).status).toBe("error");
  });

  it("tie-break: session_end wins over anything at the same timestamp", () => {
    const events = [ev("tool_error", 3_000), ev("session_end", 3_000)];
    const now = T0 + 3_100;
    expect(deriveStatus(events, now).status).toBe("done");
  });

  it("duplicate events are idempotent", () => {
    const single = [ev("tool_post", 1_000)];
    const dupes = [ev("tool_post", 1_000), ev("tool_post", 1_000)];
    const now = T0 + 1_500;
    expect(deriveStatus(dupes, now)).toEqual(deriveStatus(single, now));
  });

  it("drops malformed events (NaN / missing / unknown type)", () => {
    const events = [
      { type: "tool_post", at: Number.NaN } as AttentionEvent,
      { type: "bogus", at: T0 + 1_000 } as unknown as AttentionEvent,
      ev("notification", 2_000),
    ];
    const now = T0 + 2_500;
    expect(deriveStatus(events, now).status).toBe("waiting");
  });

  it("all-malformed input degrades to idle", () => {
    const events = [{ type: "tool_post", at: Number.NaN } as AttentionEvent];
    expect(deriveStatus(events, T0).status).toBe("idle");
  });
});
