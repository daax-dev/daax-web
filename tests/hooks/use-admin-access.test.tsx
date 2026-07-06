/**
 * Unit tests for useAdminAccess (F5 — issue #101).
 *
 * Focus: the TTL-revalidation cache. A resolved access summary is served from a
 * module-level cache within `ACCESS_TTL_MS`, but a mount past the TTL refetches
 * so a role change / identity switch is reflected instead of a stale admin
 * surface. A 401/403 fails SAFE (no access) and is NOT cached.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

// Deterministic clock so we can step past the TTL without real time / fake
// timers (fake timers would stall testing-library's waitFor).
let now = 1_000_000;

/** Fresh module each test → fresh module-level cache (cachedAccess/cachedAt). */
async function loadHook() {
  vi.resetModules();
  const mod = await import("@/hooks/use-admin-access");
  return {
    useAdminAccess: mod.useAdminAccess,
    ACCESS_TTL_MS: mod.ACCESS_TTL_MS,
  };
}

function okAccess(isAdmin: boolean) {
  return {
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({ authenticated: true, isAdmin, permissions: [] }),
  };
}

describe("useAdminAccess", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    now = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("resolves isAdmin from /api/auth/access and shares the cache within the TTL", async () => {
    mockFetch.mockResolvedValue(okAccess(true));
    const { useAdminAccess } = await loadHook();

    const first = renderHook(() => useAdminAccess());
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    expect(first.result.current.isAdmin).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith("/api/auth/access");

    // A second mount within the TTL uses the cache — no new fetch.
    const second = renderHook(() => useAdminAccess());
    await waitFor(() => expect(second.result.current.loading).toBe(false));
    expect(second.result.current.isAdmin).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("REVALIDATES after the TTL: a role change is picked up on a later mount", async () => {
    mockFetch
      .mockResolvedValueOnce(okAccess(true)) // first mount: admin
      .mockResolvedValueOnce(okAccess(false)); // after TTL: role revoked
    const { useAdminAccess, ACCESS_TTL_MS } = await loadHook();

    const first = renderHook(() => useAdminAccess());
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    expect(first.result.current.isAdmin).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Step past the TTL and remount → the hook refetches and reflects the
    // revoked role instead of the stale admin surface.
    now += ACCESS_TTL_MS + 1;
    const second = renderHook(() => useAdminAccess());
    await waitFor(() => expect(second.result.current.loading).toBe(false));
    expect(second.result.current.isAdmin).toBe(false);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("fails SAFE on 401/403 (no access) and does not cache it (later mount revalidates)", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: () => Promise.resolve({}),
      })
      .mockResolvedValueOnce(okAccess(true)); // access later granted
    const { useAdminAccess } = await loadHook();

    const first = renderHook(() => useAdminAccess());
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    expect(first.result.current.isAdmin).toBe(false);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // 403 was NOT cached (no TTL step needed) → next mount refetches and now
    // sees the granted access.
    const second = renderHook(() => useAdminAccess());
    await waitFor(() => expect(second.result.current.loading).toBe(false));
    expect(second.result.current.isAdmin).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("fails SAFE on a network error (isAdmin false) and retries on the next mount", async () => {
    mockFetch
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(okAccess(true));
    const { useAdminAccess } = await loadHook();

    const first = renderHook(() => useAdminAccess());
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    expect(first.result.current.isAdmin).toBe(false);

    const second = renderHook(() => useAdminAccess());
    await waitFor(() => expect(second.result.current.loading).toBe(false));
    expect(second.result.current.isAdmin).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
