/**
 * Unit tests for useSuperAdminAccess (F6 — issue #102).
 *
 * The `/api/admin/db/access` endpoint is authenticated-only (default-deny
 * middleware + super-admin gate), so a 401/403 is the EXPECTED "no super-admin
 * access" answer, not an error. These tests pin that mapping: the hook must
 * fail safe to `isSuperAdmin: false` on 401/403 without surfacing an error.
 *
 * The hook keeps a module-level cache, so each test resets modules and imports
 * a fresh copy to avoid cross-test leakage.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

async function loadHook() {
  vi.resetModules();
  return (await import("@/hooks/use-superadmin-access")).useSuperAdminAccess;
}

describe("useSuperAdminAccess", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("maps 401 to no super-admin access (not an error)", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });

    const useSuperAdminAccess = await loadHook();
    const { result } = renderHook(() => useSuperAdminAccess());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.isSuperAdmin).toBe(false);
    // A 401 is the expected pre-login/unauthorized answer, so it must NOT be
    // logged as an error.
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("maps 403 to no super-admin access (not an error)", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockFetch.mockResolvedValueOnce({ ok: false, status: 403 });

    const useSuperAdminAccess = await loadHook();
    const { result } = renderHook(() => useSuperAdminAccess());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.isSuperAdmin).toBe(false);
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("reflects a server super-admin=true decision", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ authenticated: true, superAdmin: true }),
    });

    const useSuperAdminAccess = await loadHook();
    const { result } = renderHook(() => useSuperAdminAccess());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.isSuperAdmin).toBe(true);
  });

  it("fails safe to no access on a transient (500) error", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    const useSuperAdminAccess = await loadHook();
    const { result } = renderHook(() => useSuperAdminAccess());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.isSuperAdmin).toBe(false);
    // A 500 is a real transient failure and is still logged (retryable).
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
