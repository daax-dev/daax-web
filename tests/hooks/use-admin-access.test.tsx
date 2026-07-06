/**
 * Unit tests for useAdminAccess (F5 — issue #101).
 *
 * Focus: the TTL-revalidation cache. A resolved access summary is served from a
 * module-level cache within `ACCESS_TTL_MS`, but a mount past the TTL refetches
 * so a role change / identity switch is reflected instead of a stale admin
 * surface. Only a positive authenticated-admin summary is cached: a pre-login
 * 200 `{authenticated:false}`, an authenticated non-admin, and a defensive
 * 401/403 all fail SAFE (no access) and are NOT cached.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const mockFetch = vi.fn();
// Stub via vi.stubGlobal so it's cleanly undone in afterEach — a bare
// `global.fetch = …` would leak the mock into later files in the same worker.
vi.stubGlobal("fetch", mockFetch);

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

/**
 * The REAL unauthenticated response: /api/auth/access is on the middleware
 * public allow-list and returns 200 with `{ authenticated: false }` pre-login
 * (never a 401/403). This must resolve "no access" and NOT be cached.
 */
function unauthAccess() {
  return {
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        authenticated: false,
        isAdmin: false,
        permissions: [],
      }),
  };
}

describe("useAdminAccess", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
    now = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
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

  it("pre-login 200 {authenticated:false} → no access, NOT cached (login picked up on next mount)", async () => {
    // The REAL unauthenticated path: 200 + {authenticated:false}. It must NOT be
    // cached, so a login is reflected on the very next mount immediately — not
    // stuck as a sticky "no access" for up to ACCESS_TTL_MS.
    mockFetch
      .mockResolvedValueOnce(unauthAccess()) // pre-login: not authenticated
      .mockResolvedValueOnce(okAccess(true)); // after login: admin granted
    const { useAdminAccess } = await loadHook();

    const first = renderHook(() => useAdminAccess());
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    expect(first.result.current.isAdmin).toBe(false);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // No TTL step needed: the {authenticated:false} result was NOT cached, so the
    // next mount refetches and now sees the authenticated admin.
    const second = renderHook(() => useAdminAccess());
    await waitFor(() => expect(second.result.current.loading).toBe(false));
    expect(second.result.current.isAdmin).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("authenticated-but-non-admin 200 is NOT cached (a later admin grant flips on next mount)", async () => {
    // authenticated:true, isAdmin:false is still "no admin access" → not cached,
    // so a subsequent admin grant is reflected on the next mount immediately.
    mockFetch
      .mockResolvedValueOnce(okAccess(false)) // authenticated non-admin
      .mockResolvedValueOnce(okAccess(true)); // admin granted later
    const { useAdminAccess } = await loadHook();

    const first = renderHook(() => useAdminAccess());
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    expect(first.result.current.isAdmin).toBe(false);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const second = renderHook(() => useAdminAccess());
    await waitFor(() => expect(second.result.current.loading).toBe(false));
    expect(second.result.current.isAdmin).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("fails SAFE on a defensive 401/403 (no access) and does not cache it (later mount revalidates)", async () => {
    // The route returns 200 today, but the hook defends against 401/403 too
    // (fail SAFE, not cached). Kept as regression coverage for that branch.
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
