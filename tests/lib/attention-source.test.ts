/**
 * Unit tests for the shared Attention poller singleton (issue #154).
 *
 * Verifies the invariants that motivated consolidating the board + bell onto one
 * poller: exactly one in-flight request across many subscribers, one timer, the
 * fastest-cadence rule, immediate poll on first subscribe, manual refresh, and
 * that unsubscribing the last consumer stops all polling (no leaks).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  __resetAttentionSource,
  getSnapshot,
  refresh,
  subscribe,
  type AttentionSubscriber,
} from "@/lib/attention/source";

const okBody = {
  ok: true,
  json: async () => ({ ok: true, sessions: [], truncated: false }),
};

function noopSub(overrides: Partial<AttentionSubscriber> = {}): AttentionSubscriber {
  return {
    intervalMs: 2000,
    pauseWhenHidden: true,
    listener: () => {},
    ...overrides,
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  __resetAttentionSource();
  vi.useFakeTimers();
  fetchMock = vi.fn(async () => okBody);
  (globalThis as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  __resetAttentionSource();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("shared attention source", () => {
  it("polls immediately on the first subscribe", () => {
    subscribe(noopSub());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps exactly one in-flight request across multiple subscribers", () => {
    // A never-resolving fetch keeps the first poll in flight.
    fetchMock.mockImplementation(() => new Promise(() => {}));
    subscribe(noopSub({ intervalMs: 2000 }));
    subscribe(noopSub({ intervalMs: 8000, pauseWhenHidden: false }));
    // Second subscribe sees an in-flight request → no second fetch.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("re-polls after the fastest subscriber's interval", async () => {
    subscribe(noopSub({ intervalMs: 5000, pauseWhenHidden: false }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(0); // flush tick → schedule next at 5000
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uses the fastest cadence when a faster subscriber joins", async () => {
    subscribe(noopSub({ intervalMs: 8000, pauseWhenHidden: false }));
    await vi.advanceTimersByTimeAsync(0);
    // A 2s board joins; the shared cadence must speed up to 2s.
    subscribe(noopSub({ intervalMs: 2000 }));
    await vi.advanceTimersByTimeAsync(0);
    fetchMock.mockClear();
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("stops polling once the last subscriber unsubscribes (no leak)", async () => {
    const unsub = subscribe(noopSub({ intervalMs: 2000 }));
    await vi.advanceTimersByTimeAsync(0);
    unsub();
    fetchMock.mockClear();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("broadcasts snapshots to every subscriber and updates getSnapshot", async () => {
    fetchMock.mockImplementation(async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        sessions: [{ id: "s1" }],
        truncated: true,
      }),
    }));
    const a = vi.fn();
    const b = vi.fn();
    subscribe(noopSub({ listener: a }));
    subscribe(noopSub({ listener: b, intervalMs: 8000 }));
    await vi.advanceTimersByTimeAsync(0);
    expect(a).toHaveBeenCalled();
    expect(b).toHaveBeenCalled();
    const snap = getSnapshot();
    expect(snap.conn).toBe("connected");
    expect(snap.truncated).toBe(true);
    expect(snap.cards).toHaveLength(1);
  });

  it("refresh() triggers an immediate poll", async () => {
    subscribe(noopSub({ intervalMs: 60_000 }));
    await vi.advanceTimersByTimeAsync(0);
    fetchMock.mockClear();
    refresh();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refresh() is a no-op while a request is in flight", () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    subscribe(noopSub());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    refresh();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("marks the connection disconnected on a non-ok response", async () => {
    fetchMock.mockImplementation(async () => ({ ok: false }));
    subscribe(noopSub());
    await vi.advanceTimersByTimeAsync(0);
    expect(getSnapshot().conn).toBe("disconnected");
  });

  it("aborts a wedged request via timeout and keeps polling (no permanent stall)", async () => {
    // A fetch that only settles when its signal aborts (like the real one).
    fetchMock.mockImplementation(
      (_url: string, opts: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          opts.signal.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );
    subscribe(noopSub({ intervalMs: 2000 }));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Fire the 12s request timeout → aborts → surfaces disconnected + reschedules.
    await vi.advanceTimersByTimeAsync(12_000);
    expect(getSnapshot().conn).toBe("disconnected");

    // The poller recovered: a healthy response is fetched on the next interval.
    fetchMock.mockImplementation(async () => okBody);
    await vi.advanceTimersByTimeAsync(2000);
    expect(getSnapshot().conn).toBe("connected");
  });
});
