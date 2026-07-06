import { test, expect } from "@playwright/test";

/**
 * RBAC admin-gate E2E (F5 — issue #101), LOCAL half.
 *
 * Runs in the default `chromium` project against localhost:4200 (host-dev, no
 * proxy). In that mode `requireRole()` takes the local-operator bypass — the
 * operator is the trusted root of the machine — so an admin-only API route is
 * reachable WITHOUT a database. This proves the "admin allowed" half of the AC.
 *
 * The complementary "authenticated NON-admin is 403'd" half cannot run here:
 * host-dev has no forwarded identity and no Postgres, so there is no way to be a
 * non-admin. That half is covered by:
 *   - `rbac-admin-gate.noauth.spec.ts` (unauthenticated → blocked), which runs
 *     only against a real Traefik + Pocket ID deployment (DAAX_AUTH_BASE_URL);
 *   - the Postgres integration suite `tests/integration/rbac-pg.test.ts`, which
 *     proves role-based grant/deny + revocation safety against a real DB.
 * See the PR notes — the strict authenticated-non-admin-403 path is honestly
 * UNRUN in this environment, not faked.
 */
test.describe("RBAC admin gate (local operator bypass)", () => {
  test("admin API route is reachable for the trusted local operator", async ({
    request,
  }) => {
    const res = await request.get("/api/provenance-admin/tables");
    // Operator bypass ⇒ NOT an auth/authz rejection. The upstream provenance
    // backend may be unavailable locally (503) or return data (200); either way
    // the request was AUTHORIZED (not 401/403).
    expect(res.status()).not.toBe(401);
    expect(res.status()).not.toBe(403);
  });
});
