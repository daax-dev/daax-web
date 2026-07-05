/**
 * RBAC admin-gate E2E (F5 — issue #101), STRICT-mode blocked half.
 *
 * Runs ONLY against a real Traefik + Pocket ID deployment (gated by
 * DAAX_AUTH_BASE_URL — see playwright.config.ts `unauthenticated` project). An
 * unauthenticated caller reaching an admin-only API route must be blocked before
 * any handler runs. This is the real "non-admin is blocked" assertion; it does
 * NOT run in the local/CI environment (there is no proxy there), so it is
 * honestly unrun there rather than faked.
 */

import { test, expect } from "./fixtures/auth-fixtures";

test.describe("RBAC admin gate — unauthenticated is blocked", () => {
  const adminRoutes = [
    { method: "GET" as const, path: "/api/provenance-admin/tables" },
    { method: "GET" as const, path: "/api/provenance-admin/actions/jobs" },
    { method: "POST" as const, path: "/api/provenance-admin/actions/fetch" },
  ];

  for (const { method, path } of adminRoutes) {
    test(`${method} ${path} → blocked (401/302/307)`, async ({
      unauthenticatedRequest,
    }) => {
      const response =
        method === "GET"
          ? await unauthenticatedRequest.get(path)
          : await unauthenticatedRequest.post(path, { data: {} });
      const status = response.status();
      expect(
        status === 401 || status === 302 || status === 307,
        `Expected an unauthenticated block (401/302/307) for ${method} ${path}, got ${status}`,
      ).toBe(true);
    });
  }
});
