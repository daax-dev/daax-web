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

  it("aborts the in-flight request on unmount", () => {
    const { unmount } = renderHook(() => useAttentionPoll());
    expect(pending[0].signal.aborted).toBe(false);
    unmount();
    expect(pending[0].signal.aborted).toBe(true);
  });
});
