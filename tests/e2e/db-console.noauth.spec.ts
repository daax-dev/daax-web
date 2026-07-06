/**
 * Admin DB console E2E (F6 — issue #102), STRICT-mode blocked half.
 *
 * Runs ONLY against a real Traefik + Pocket ID deployment (gated by
 * DAAX_AUTH_BASE_URL — see playwright.config.ts `unauthenticated` project). An
 * unauthenticated caller is, by definition, NOT a super-admin: reaching the
 * DB-console capability probe or any of the super-admin-only DB routes must be
 * blocked before a handler can report `superAdmin: true` or return data. This
 * is the real "non-super-admin is blocked" assertion complementary to the
 * local-operator half in `db-console.spec.ts`; it does NOT run in the local/CI
 * environment (there is no proxy there), so it is honestly unrun there rather
 * than faked.
 */

import { test, expect } from "./fixtures/auth-fixtures";

test.describe("Admin DB console — non-super-admin (unauthenticated) is blocked", () => {
  const dbConsoleRoutes = [
    { method: "GET" as const, path: "/api/admin/db/access" },
    { method: "GET" as const, path: "/api/admin/db/tables" },
    {
      method: "POST" as const,
      path: "/api/admin/db/tables/user_roles",
    },
  ];

  for (const { method, path } of dbConsoleRoutes) {
    test(`${method} ${path} → blocked (401/302/307), never reports super-admin`, async ({
      unauthenticatedRequest,
    }) => {
      const response =
        method === "GET"
          ? await unauthenticatedRequest.get(path, { maxRedirects: 0 })
          : await unauthenticatedRequest.post(path, {
              data: { op: "insert", values: { subject: "x", role: "user" } },
              maxRedirects: 0,
            });
      const status = response.status();
      expect(
        status === 401 || status === 302 || status === 307,
        `Expected an unauthenticated block (401/302/307) for ${method} ${path}, got ${status}`,
      ).toBe(true);
    });
  }
});
