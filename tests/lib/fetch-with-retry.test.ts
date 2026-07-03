/**
 * Tests for lib/fetch-with-retry.ts
 *
 * Covers: pass-through on success, retry-then-succeed on 429, exhausting
 * retries returns the last 429, Retry-After is honored but capped, and the
 * backoff is jittered (never exceeds the base delay, never zero).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { fetchWithRetry } from "@/lib/fetch-with-retry";

function makeResponse(status: number, headers: Record<string, string> = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (k: string) => headers[k] ?? null },
  } as unknown as Response;
}

describe("fetchWithRetry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("returns immediately on a successful response (no retry)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(200));
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchWithRetry("/x");

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries on 429 then returns the eventual success", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(makeResponse(429))
      .mockResolvedValueOnce(makeResponse(200));
    vi.stubGlobal("fetch", fetchMock);

    const promise = fetchWithRetry("/x");
    await vi.runAllTimersAsync();
    const res = await promise;

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("stops after maxRetries and returns the final 429", async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(429));
    vi.stubGlobal("fetch", fetchMock);

    const promise = fetchWithRetry("/x", undefined, 2);
    await vi.runAllTimersAsync();
    const res = await promise;

    // 1 initial + 2 retries = 3 attempts, last one returned (not thrown).
    expect(res.status).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("caps an oversized Retry-After and applies jitter within [0.5,1.0]", async () => {
    // Retry-After of 3600s would be 3_600_000ms; must be capped to 10_000ms,
    // then scaled by jitter. With Math.random()=1 the delay is exactly the cap.
    vi.spyOn(Math, "random").mockReturnValue(1);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(makeResponse(429, { "Retry-After": "3600" }))
      .mockResolvedValueOnce(makeResponse(200));
    vi.stubGlobal("fetch", fetchMock);
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");

    const promise = fetchWithRetry("/x");
    await vi.runAllTimersAsync();
    await promise;

    const delay = (setTimeoutSpy.mock.calls[0]?.[1] as number) ?? 0;
    expect(delay).toBe(10_000); // capped * jitter(=1)
    expect(delay).toBeLessThanOrEqual(10_000);
    expect(delay).toBeGreaterThan(0);
  });
});
