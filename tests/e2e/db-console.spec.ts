import { test, expect } from "@playwright/test";

/**
 * Admin DB console E2E (F6 — issue #102), LOCAL half.
 *
 * Runs in the default `chromium` project against localhost:4200 (host-dev, no
 * proxy). In that mode the local operator is the trusted root of the machine and
 * is treated as super-admin, so:
 *   - `/api/admin/db/access` returns `{ superAdmin: true }`;
 *   - the read-only DB console API is reachable (NOT 401/403);
 *   - the provenance admin surface renders the super-admin-only "Data" tab.
 *
 * The complementary "NON-super-admin does NOT see the Data tab / is blocked"
 * half cannot run here: host-dev has no forwarded identity and no
 * `DAAX_SUPERADMIN_USERS` allow-list to fall out of, so there is no way to BE a
 * non-super-admin. That negative is covered by:
 *   - `db-console.noauth.spec.ts` (unauthenticated ⇒ non-super-admin ⇒ every
 *     DB-console route blocked 401/302/307), which runs only against a real
 *     Traefik + Pocket ID deployment (DAAX_AUTH_BASE_URL);
 *   - the unit suite (`tests/lib/db-console/super-admin.test.ts`: an admin not
 *     on the allow-list → false) and the request-plane gate.
 * The strict authenticated-non-super path is honestly UNRUN in this
 * environment, not faked.
 */
test.describe("Admin DB console (local operator = super-admin)", () => {
  test("access endpoint reports super-admin for the local operator", async ({
    request,
  }) => {
    const res = await request.get("/api/admin/db/access");
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.superAdmin).toBe(true);
  });

  test("read-only console API is authorized (not 401/403)", async ({
    request,
  }) => {
    const res = await request.get("/api/admin/db/tables");
    // Operator bypass ⇒ authorized. DB may be unconfigured locally (503) or
    // return data (200); either way it was NOT an auth/authz rejection.
    expect(res.status()).not.toBe(401);
    expect(res.status()).not.toBe(403);
  });

  test("writes are refused unless the opt-in flag is set (D4)", async ({
    request,
  }) => {
    const res = await request.post("/api/admin/db/tables/user_roles", {
      data: { op: "insert", values: { subject: "x", role: "user" } },
    });
    // Writes are OFF by default. In the loopback E2E posture the super-admin gate
    // is satisfied WITHOUT a DB round-trip (local-operator bypass + env allow-list),
    // so the route reaches the opt-in flag check and returns exactly 403
    // (writes-disabled) — before any DB access. Asserting the precise 403 (not a
    // loose "not 200") means a regression that moved the flag check AFTER a DB
    // call, or dropped the gate, would fail this test instead of slipping through.
    expect(res.status()).toBe(403);
  });

  test("provenance admin surface renders the super-admin Data tab", async ({
    page,
  }) => {
    await page.goto("/provenance?tab=dashboard");
    // The admin nav is client-gated on /api/auth/access; open the top-level
    // Admin tab first, then the super-admin-only nested Data tab.
    const adminTab = page.getByRole("tab", { name: "Admin" });
    await expect(adminTab).toBeVisible({ timeout: 15_000 });
    await adminTab.click();

    const dataTab = page.getByRole("tab", { name: "Data" });
    await expect(dataTab).toBeVisible({ timeout: 15_000 });
    await dataTab.click();
    await expect(
      page.getByText("Database Console", { exact: false }),
    ).toBeVisible();
  });
});
