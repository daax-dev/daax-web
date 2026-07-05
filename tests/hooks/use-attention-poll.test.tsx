/**
 * Unit tests for the useAttentionPoll hook (issue #153).
 *
 * Focus: poll-tick behaviour against a slow upstream. A tick while a request
 * is in flight must be skipped — NOT abort the outstanding request — otherwise
 * an upstream slower than the poll interval livelocks the board (no request
 * ever completes). Abort is reserved for unmount.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAttentionPoll, DEFAULT_POLL_MS } from "@/hooks/useAttentionPoll";
import type { AttentionCard } from "@/lib/attention/adapter";

const sampleCard: AttentionCard = {
  id: "s1",
  label: "host-a",
  host: "host-a",
  cwd: "/repo",
  repoBranch: "main",
  status: "working",
  since: 1,
  lastTool: "bash",
  toolCount: 3,
  sparkline: [1, 2, 3],
};

interface PendingFetch {
  signal: AbortSignal;
  resolve: (body: unknown) => void;
}

describe("useAttentionPoll", () => {
  const originalFetch = globalThis.fetch;
  let pending: PendingFetch[];
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    pending = [];
    // fetch that never resolves until the test releases it, capturing the
    // AbortSignal so abort behaviour can be asserted.
    fetchMock = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise((resolve) => {
          pending.push({
            signal: init.signal as AbortSignal,
            resolve: (body: unknown) =>
              resolve({ ok: true, json: () => Promise.resolve(body) }),
          });
        }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("skips poll ticks while a request is in flight instead of aborting it", async () => {
    renderHook(() => useAttentionPoll());
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Two poll ticks fire while the first request is still outstanding.
    await act(async () => {
      vi.advanceTimersByTime(DEFAULT_POLL_MS * 2);
    });

    // Ticks were skipped (no new fetch) and the slow request was NOT aborted.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(pending[0].signal.aborted).toBe(false);
  });

  it("applies a slow response and resumes polling afterwards", async () => {
    const { result } = renderHook(() => useAttentionPoll());

    // Slower than the poll interval: several ticks pass unanswered.
    await act(async () => {
      vi.advanceTimersByTime(DEFAULT_POLL_MS * 3);
    });
    expect(result.current.conn).toBe("loading");

    // The slow response finally lands — it must be applied, not discarded.
    await act(async () => {
      pending[0].resolve({ ok: true, sessions: [], truncated: false });
    });
    expect(result.current.conn).toBe("connected");

    // With the request settled, the next tick polls again.
    await act(async () => {
      vi.advanceTimersByTime(DEFAULT_POLL_MS);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("clears stale cards when a poll returns a non-2xx response", async () => {
    // First poll populates a truncated board; the second returns non-2xx.
    const queue: Array<() => unknown> = [
      () => ({
        ok: true,
        json: () =>
          Promise.resolve({
            ok: true,
            sessions: [sampleCard],
            truncated: true,
          }),
      }),
      () => ({ ok: false, status: 503, json: () => Promise.resolve({}) }),
    ];
    let call = 0;
    fetchMock.mockImplementation(() =>
      Promise.resolve(queue[Math.min(call++, queue.length - 1)]()),
    );

    const { result } = renderHook(() => useAttentionPoll());

    // Flush the initial (successful) poll.
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.cards).toHaveLength(1);
    expect(result.current.truncated).toBe(true);
    expect(result.current.conn).toBe("connected");

    // Next tick returns non-2xx: stale cards/truncated must be cleared.
    await act(async () => {
      vi.advanceTimersByTime(DEFAULT_POLL_MS);
      await Promise.resolve();
    });
    expect(result.current.conn).toBe("disconnected");
    expect(result.current.cards).toEqual([]);
    expect(result.current.truncated).toBe(false);
  });

  it("clears stale cards when a poll throws a network error", async () => {
    // First poll populates a board; the second rejects (network/parse failure).
    const queue: Array<() => Promise<unknown>> = [
      () =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              ok: true,
              sessions: [sampleCard],
              truncated: true,
            }),
        }),
      () => Promise.reject(new TypeError("network down")),
    ];
    let call = 0;
    fetchMock.mockImplementation(() =>
      queue[Math.min(call++, queue.length - 1)](),
    );

    const { result } = renderHook(() => useAttentionPoll());

    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.cards).toHaveLength(1);
    expect(result.current.truncated).toBe(true);

    // Next tick rejects: stale cards/truncated must be cleared, not retained.
    await act(async () => {
      vi.advanceTimersByTime(DEFAULT_POLL_MS);
      await Promise.resolve();
    });
    expect(result.current.conn).toBe("disconnected");
    expect(result.current.cards).toEqual([]);
    expect(result.current.truncated).toBe(false);
  });

  it("aborts the in-flight request on unmount", () => {
    const { unmount } = renderHook(() => useAttentionPoll());
    expect(pending[0].signal.aborted).toBe(false);
    unmount();
    expect(pending[0].signal.aborted).toBe(true);
  });
});
