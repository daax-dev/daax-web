/**
 * Unit tests for the Attention board support helpers (issue #153):
 * sparkline bucketing, the REST→card adapter, and age formatting.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { bucketTimestamps } from "@/lib/attention/sparkline";
import {
  buildEvents,
  buildCard,
  type RestSession,
  type AttentionResponse,
} from "@/lib/attention/adapter";
import { getFresh, store, reset, CACHE_TTL_MS } from "@/lib/attention/cache";
import { formatAge } from "@/lib/attention/format";

const T0 = 1_000_000_000_000;

describe("bucketTimestamps", () => {
  it("returns the requested number of empty buckets for no data", () => {
    expect(bucketTimestamps([], T0, { windowMs: 60_000, buckets: 6 })).toEqual([
      0, 0, 0, 0, 0, 0,
    ]);
  });

  it("places recent timestamps in the last bucket", () => {
    const now = T0;
    const out = bucketTimestamps([now, now - 1], now, {
      windowMs: 60_000,
      buckets: 6,
    });
    expect(out[5]).toBe(2);
    expect(out.slice(0, 5)).toEqual([0, 0, 0, 0, 0]);
  });

  it("distributes timestamps across buckets by age", () => {
    const now = T0;
    // windowMs 60s, 6 buckets => 10s each. One event 55s ago (bucket 0),
    // one 5s ago (bucket 5).
    const out = bucketTimestamps([now - 55_000, now - 5_000], now, {
      windowMs: 60_000,
      buckets: 6,
    });
    expect(out[0]).toBe(1);
    expect(out[5]).toBe(1);
  });

  it("drops timestamps outside the window and in the future", () => {
    const now = T0;
    const out = bucketTimestamps(
      [now - 120_000, now + 5_000, now - 1_000, Number.NaN],
      now,
      { windowMs: 60_000, buckets: 6 },
    );
    expect(out.reduce((a, b) => a + b, 0)).toBe(1);
  });
});

describe("buildEvents (REST → abstract events)", () => {
  const base: RestSession = {
    id: "sess-1",
    host: "galway",
    working_dir: "/workspace",
    active: true,
    created_at: new Date(T0).toISOString(),
  };

  it("emits a session_start and a tool_post per non-error tool", () => {
    const events = buildEvents(base, [
      { startedAt: T0 + 1_000, name: "Read" },
      { startedAt: T0 + 2_000, name: "Bash" },
    ]);
    expect(events.map((e) => e.type)).toEqual([
      "session_start",
      "tool_post",
      "tool_post",
    ]);
  });

  it("maps an errored tool to tool_error", () => {
    const events = buildEvents(base, [
      { startedAt: T0 + 1_000, name: "Bash", error: "boom" },
    ]);
    expect(events.some((e) => e.type === "tool_error")).toBe(true);
  });

  it("emits session_end for an inactive session", () => {
    const ended: RestSession = {
      ...base,
      active: false,
      ended_at: new Date(T0 + 5_000).toISOString(),
    };
    const events = buildEvents(ended, []);
    expect(events.some((e) => e.type === "session_end")).toBe(true);
  });
});

describe("buildCard", () => {
  const base: RestSession = {
    id: "abcdef1234567890",
    host: "galway",
    working_dir: "/workspace/repo",
    git_branch: "gh-153",
    active: true,
    created_at: new Date(T0).toISOString(),
  };

  it("derives working with the last tool + sparkline populated", () => {
    const now = T0 + 6_000;
    const card = buildCard(
      base,
      [
        { startedAt: T0 + 1_000, name: "Read" },
        { startedAt: T0 + 5_000, name: "Bash" },
      ],
      { now },
    );
    expect(card.status).toBe("working");
    expect(card.lastTool).toBe("Bash");
    expect(card.toolCount).toBe(2);
    expect(card.repoBranch).toBe("gh-153");
    expect(card.sparkline.reduce((a, b) => a + b, 0)).toBe(2);
    expect(card.label).toBe("galway");
  });

  it("falls back to a truncated id label when host is absent", () => {
    const card = buildCard({ ...base, host: "" }, [], { now: T0 + 1_000 });
    expect(card.label).toBe("abcdef12");
    expect(card.lastTool).toBeNull();
  });

  it("reports done for an ended session", () => {
    const card = buildCard(
      { ...base, active: false, ended_at: new Date(T0 + 2_000).toISOString() },
      [{ startedAt: T0 + 1_000, name: "Read" }],
      { now: T0 + 10_000 },
    );
    expect(card.status).toBe("done");
  });

  it("picks the latest tool even when input is unsorted", () => {
    const card = buildCard(
      base,
      [
        { startedAt: T0 + 5_000, name: "Bash" },
        { startedAt: T0 + 1_000, name: "Read" },
      ],
      { now: T0 + 6_000 },
    );
    expect(card.lastTool).toBe("Bash");
  });

  it("falls back to a stable label (not [object Object]) on tool-name schema drift", () => {
    // Schema drift: the last tool's `name` is a non-string (e.g. an object).
    // String()-ing it would render "[object Object]"; a stable generic label
    // must be used instead.
    const card = buildCard(
      base,
      [{ startedAt: T0 + 1_000, name: { nested: "x" } as unknown as string }],
      { now: T0 + 2_000 },
    );
    expect(card.lastTool).toBe("tool");
    expect(card.lastTool).not.toContain("object Object");
  });

  it("clamps a future (clock-skewed) tool so status and sparkline agree", () => {
    const now = T0 + 10_000;
    // Tool timestamped 1 minute in the future.
    const card = buildCard(base, [{ startedAt: now + 60_000, name: "Bash" }], {
      now,
    });
    // Status reads working (clamped to now = recent activity) AND the sparkline
    // is populated — not the inconsistent "working with empty sparkline".
    expect(card.status).toBe("working");
    expect(card.sparkline.reduce((a, b) => a + b, 0)).toBe(1);
  });
});

describe("formatAge", () => {
  it("formats sub-second as 'now'", () => {
    expect(formatAge(200)).toBe("now");
  });
  it("formats seconds/minutes/hours/days", () => {
    expect(formatAge(12_000)).toBe("12s");
    expect(formatAge(5 * 60_000)).toBe("5m");
    expect(formatAge(2 * 3_600_000)).toBe("2h");
    expect(formatAge(3 * 86_400_000)).toBe("3d");
  });
  it("guards against negative / non-finite", () => {
    expect(formatAge(-1)).toBe("—");
    expect(formatAge(Number.NaN)).toBe("—");
  });
});

describe("attention TTL cache", () => {
  const body: AttentionResponse = { ok: true, sessions: [], truncated: false };

  beforeEach(() => reset());

  it("returns null on a cold cache", () => {
    expect(getFresh(T0)).toBeNull();
  });

  it("serves a stored body within the TTL and expires after it", () => {
    store(T0, body);
    expect(getFresh(T0 + CACHE_TTL_MS - 1)).toBe(body);
    expect(getFresh(T0 + CACHE_TTL_MS)).toBeNull();
  });

  it("reset() clears the entry", () => {
    store(T0, body);
    reset();
    expect(getFresh(T0)).toBeNull();
  });
});
