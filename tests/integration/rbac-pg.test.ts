/**
 * RBAC integration test against a real throwaway Postgres (F5 — issue #101).
 *
 * Run via `bun run test:integration` (spins a disposable PG via
 * `scripts/with-test-postgres.sh`). Exercises the security-load-bearing
 * mechanisms that CANNOT be proven without a real database:
 *   - JIT insert-vs-update detection via `RETURNING (xmax = 0)`;
 *   - revoked-user-NO-regrant (the deauthorised-user regrant bug is NOT present);
 *   - first-admin bootstrap on a fresh DB (pending grant → materialised on login);
 *   - reconcile prunes ONLY its own ('reconcile') grants, never UI grants.
 *
 * Self-skips when Postgres is not configured (Docker unavailable) so it never
 * hard-fails CI, mirroring the Phase 0 integration suites.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import path from "node:path";
import { Client } from "pg";
import { runner } from "node-pg-migrate";
import { resolveDbConfig, isDbConfigured } from "@/lib/db/config";
import { query, closePool } from "@/lib/db/pg";
import {
  jitProvision,
  getUserRoles,
  grantRole,
  revokeAllRoles,
  reconcile,
} from "@/lib/rbac/store";
import { resetSchema } from "./helpers";

const MIGRATIONS_DIR = path.resolve(process.cwd(), "migrations");
const configured = isDbConfigured();

async function migrateUp(): Promise<void> {
  const client = new Client(resolveDbConfig().poolConfig);
  await client.connect();
  try {
    await runner({
      dbClient: client,
      migrationsTable: "pgmigrations",
      dir: MIGRATIONS_DIR,
      direction: "up",
      count: Infinity,
      createMigrationsSchema: false,
      singleTransaction: true,
      log: () => {},
    });
  } finally {
    await client.end();
  }
}

function identity(
  subject: string,
  email: string | null,
  username: string | null,
) {
  return { subject, email, username, name: null, idp: "test", groups: [] };
}

/** A full ProcessEnv with an overridden allow-list (avoids a partial-object cast). */
function envWith(adminUsers: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    DAAX_ADMIN_USERS: adminUsers,
    DAAX_GROUP_ROLE_MAP: "",
  };
}

describe.skipIf(!configured)("RBAC on Postgres (F5 #101)", () => {
  beforeAll(async () => {
    await resetSchema();
    await migrateUp();
  });

  beforeEach(async () => {
    // Fresh identity state each test; roles (admin/user) stay seeded.
    await query(
      "TRUNCATE user_roles, pending_grants, auth_audit, users RESTART IDENTITY CASCADE",
    );
  });

  afterAll(async () => {
    await closePool();
  });

  it("seeds the system roles", async () => {
    const res = await query<{ name: string }>(
      "SELECT name FROM roles ORDER BY name",
    );
    expect(res.rows.map((r) => r.name)).toEqual(["admin", "user"]);
  });

  it("JIT: first call INSERTs (xmax=0 → is_new) and grants the default role", async () => {
    const s = "11111111-0000-0000-0000-000000000001";
    const first = await jitProvision(identity(s, "u1@x.z", "u1"));
    expect(first.isNew).toBe(true);
    expect(first.roles).toEqual(["user"]);

    // Second call is an UPDATE (xmax != 0 → is_new false); roles unchanged.
    const second = await jitProvision(identity(s, "u1@x.z", "u1"));
    expect(second.isNew).toBe(false);
    expect(second.roles).toEqual(["user"]);

    // Exactly one grant row (no duplicate default).
    const roles = await getUserRoles(s);
    expect(roles).toEqual(["user"]);
  });

  it("REVOKED user is NOT re-granted the default on a later request", async () => {
    const s = "22222222-0000-0000-0000-000000000002";
    await jitProvision(identity(s, "u2@x.z", "u2"));
    expect(await getUserRoles(s)).toEqual(["user"]);

    // Operator revokes all roles (deauthorise).
    await revokeAllRoles(s);
    expect(await getUserRoles(s)).toEqual([]);

    // Next request JIT-updates the user but MUST NOT re-grant the default role.
    const again = await jitProvision(identity(s, "u2@x.z", "u2"));
    expect(again.isNew).toBe(false);
    expect(again.roles).toEqual([]);
    expect(await getUserRoles(s)).toEqual([]);
  });

  it("first-admin bootstrap: reconcile pre-creates a pending grant, materialised on first login", async () => {
    // Fresh DB, admin allow-listed by EMAIL, has never logged in.
    const env = envWith("boss@example.com");
    const plan = await reconcile(env);
    expect(plan.pendingGrantsToAdd).toEqual([
      { identifier: "boss@example.com", role: "admin" },
    ]);

    // Pending row exists; no user_roles yet (no user).
    const pend = await query<{ identifier: string; role: string }>(
      "SELECT identifier, role FROM pending_grants",
    );
    expect(pend.rows).toEqual([
      { identifier: "boss@example.com", role: "admin" },
    ]);

    // The admin logs in for the first time → pending materialised into admin role.
    const s = "33333333-0000-0000-0000-000000000003";
    const jit = await jitProvision(identity(s, "boss@example.com", "boss"));
    expect(jit.isNew).toBe(true);
    expect(jit.roles.sort()).toEqual(["admin", "user"]);

    // Pending row consumed.
    const pendAfter = await query("SELECT 1 FROM pending_grants");
    expect(pendAfter.rowCount).toBe(0);
  });

  it("first-admin bootstrap also works when the allow-list uses the subject", async () => {
    const s = "44444444-0000-0000-0000-000000000004";
    const env = envWith(s);
    await reconcile(env);
    const jit = await jitProvision(identity(s, "sub@example.com", "sub"));
    expect(jit.roles.sort()).toEqual(["admin", "user"]);
  });

  it("subject-bootstrap is case-insensitive: an UPPERCASE forwarded subject materialises AND consumes a lowercased allow-list pending grant", async () => {
    // Allow-list uses the canonical lowercase subject; the proxy later forwards
    // the SAME UUID in uppercase. Both must resolve to one identity so the
    // pending grant is materialised on first login and then deleted.
    const lower = "cccccccc-0000-0000-0000-00000000000c";
    const upper = lower.toUpperCase();

    // reconcile stores the pending grant under the lowercased identifier.
    const plan = await reconcile(envWith(upper)); // even an uppercase env entry
    expect(plan.pendingGrantsToAdd).toEqual([
      { identifier: lower, role: "admin" },
    ]);
    const pend = await query<{ identifier: string }>(
      "SELECT identifier FROM pending_grants",
    );
    expect(pend.rows).toEqual([{ identifier: lower }]);

    // First login forwards the UPPERCASE subject → materialised into admin.
    const jit = await jitProvision(identity(upper, "case@example.com", "case"));
    expect(jit.roles.sort()).toEqual(["admin", "user"]);

    // Pending row CONSUMED (selected AND deleted under the same normalized key).
    const pendAfter = await query("SELECT 1 FROM pending_grants");
    expect(pendAfter.rowCount).toBe(0);

    // Exactly ONE user row (no case-variant duplicate), keyed on the lowercase
    // subject; roles are visible whether queried by upper- or lower-case subject.
    const users = await query<{ subject: string }>("SELECT subject FROM users");
    expect(users.rows).toEqual([{ subject: lower }]);
    expect((await getUserRoles(upper)).sort()).toEqual(["admin", "user"]);
    expect((await getUserRoles(lower)).sort()).toEqual(["admin", "user"]);
  });

  it("reconcile prunes ONLY reconcile grants, never UI grants", async () => {
    // User A: admin granted by reconcile (via allow-list).
    const sA = "55555555-0000-0000-0000-00000000000a";
    await jitProvision(identity(sA, "a@x.z", "a"));
    await reconcile(envWith("a@x.z"));
    expect((await getUserRoles(sA)).sort()).toEqual(["admin", "user"]);

    // User B: admin granted by the UI (granted_by='ui').
    const sB = "66666666-0000-0000-0000-00000000000b";
    await jitProvision(identity(sB, "b@x.z", "b"));
    await grantRole(sB, "admin"); // defaults to granted_by='ui'
    expect((await getUserRoles(sB)).sort()).toEqual(["admin", "user"]);

    // Allow-list emptied → reconcile prunes A's reconcile admin, leaves B's UI admin.
    await reconcile(envWith(""));
    expect(await getUserRoles(sA)).toEqual(["user"]); // reconcile admin pruned
    expect((await getUserRoles(sB)).sort()).toEqual(["admin", "user"]); // UI admin survives
  });

  it("reconcile prunes ONLY its own pending grants, never non-reconcile ones", async () => {
    // A pending grant owned by a UI flow (granted_by='ui'), NOT by reconcile.
    await query(
      "INSERT INTO pending_grants (identifier, role, granted_by) VALUES ($1, 'admin', 'ui')",
      ["ui-pending@x.z"],
    );
    // A reconcile-owned pending grant the (empty) allow-list no longer justifies.
    await query(
      "INSERT INTO pending_grants (identifier, role, granted_by) VALUES ($1, 'admin', 'reconcile')",
      ["rec-pending@x.z"],
    );

    // Empty allow-list: reconcile must prune ONLY its own pending grant and
    // leave the UI-owned pending grant untouched (invariant: reconcile prunes
    // only grants it owns).
    await reconcile(envWith(""));

    const rows = await query<{ identifier: string; granted_by: string }>(
      "SELECT identifier, granted_by FROM pending_grants ORDER BY identifier",
    );
    expect(rows.rows).toEqual([
      { identifier: "ui-pending@x.z", granted_by: "ui" },
    ]);
  });

  it("maps Pocket-ID groups to roles at login and refreshes them (group-sync)", async () => {
    const s = "77777777-0000-0000-0000-00000000000c";
    const map = new Map([["daax-admins", new Set(["admin"])]]);

    // First login WITH the admin group → admin granted via group-sync.
    const jit = await jitProvision(
      {
        subject: s,
        email: null,
        username: null,
        name: null,
        idp: "test",
        groups: ["daax-admins"],
      },
      map,
    );
    expect(jit.roles.sort()).toEqual(["admin", "user"]);

    // Later login WITHOUT the group → the group-sync admin grant is revoked;
    // the jit-default 'user' grant (a different provenance) survives.
    const jit2 = await jitProvision(
      {
        subject: s,
        email: null,
        username: null,
        name: null,
        idp: "test",
        groups: [],
      },
      map,
    );
    expect(jit2.roles).toEqual(["user"]);
  });

  it("prunes stale group-sync grants when the group→role map is emptied (no roles roundtrip, but still revokes)", async () => {
    const s = "77777777-0000-0000-0000-00000000000f";
    const map = new Map([["daax-admins", new Set(["admin"])]]);
    const withGroup = {
      subject: s,
      email: null,
      username: null,
      name: null,
      idp: "test",
      groups: ["daax-admins"],
    };

    // Login with a configured map → admin granted via group-sync.
    const jit = await jitProvision(withGroup, map);
    expect(jit.roles.sort()).toEqual(["admin", "user"]);

    // Operator removes DAAX_GROUP_ROLE_MAP → empty map. The perf guard skips the
    // `roles` roundtrip, but the stale group-sync admin grant must STILL be
    // pruned (a full early-return would leave the privileged grant in place).
    const jit2 = await jitProvision(withGroup, new Map());
    expect(jit2.roles).toEqual(["user"]);
  });

  it("explicit UI grant upgrades group-sync provenance so group removal does NOT revoke it", async () => {
    const s = "88888888-0000-0000-0000-00000000000d";
    const map = new Map([["daax-admins", new Set(["admin"])]]);

    // 1. Admin arrives via group-sync.
    const withGroup = {
      subject: s,
      email: null,
      username: null,
      name: null,
      idp: "test",
      groups: ["daax-admins"],
    };
    const jit = await jitProvision(withGroup, map);
    expect(jit.roles.sort()).toEqual(["admin", "user"]);

    // 2. Operator explicitly grants admin via the UI → provenance upgraded.
    await grantRole(s, "admin");
    const prov = await query<{ granted_by: string }>(
      "SELECT granted_by FROM user_roles WHERE subject = $1 AND role = 'admin'",
      [s],
    );
    expect(prov.rows[0]?.granted_by).toBe("ui");

    // 3. User leaves the IdP group → group-sync must NOT revoke the UI grant.
    const jit2 = await jitProvision({ ...withGroup, groups: [] }, map);
    expect(jit2.roles.sort()).toEqual(["admin", "user"]);
  });

  it("reconcile/allow-list grant upgrades group-sync provenance so group removal does NOT revoke an allow-listed admin", async () => {
    const s = "aaaaaaaa-0000-0000-0000-00000000000a";
    const map = new Map([["daax-admins", new Set(["admin"])]]);
    const withGroup = {
      subject: s,
      email: "gs@x.z",
      username: "gs",
      name: null,
      idp: "test",
      groups: ["daax-admins"],
    };

    // 1. Admin arrives via group-sync.
    const jit = await jitProvision(withGroup, map);
    expect(jit.roles.sort()).toEqual(["admin", "user"]);
    const provGs = await query<{ granted_by: string }>(
      "SELECT granted_by FROM user_roles WHERE subject = $1 AND role = 'admin'",
      [s],
    );
    expect(provGs.rows[0]?.granted_by).toBe("group-sync");

    // 2. Boot reconcile with the user allow-listed (user already exists) →
    //    the group-sync admin row is UPGRADED to granted_by='reconcile'.
    await reconcile(envWith("gs@x.z"));
    const provRec = await query<{ granted_by: string }>(
      "SELECT granted_by FROM user_roles WHERE subject = $1 AND role = 'admin'",
      [s],
    );
    expect(provRec.rows[0]?.granted_by).toBe("reconcile");

    // 3. User leaves the IdP group → group-sync prune must NOT revoke the now
    //    reconcile-owned admin (the allow-listed admin keeps access).
    const jit2 = await jitProvision({ ...withGroup, groups: [] }, map);
    expect(jit2.roles.sort()).toEqual(["admin", "user"]);
  });

  it("pending-grant materialization upgrades group-sync provenance (allow-list survives group removal)", async () => {
    const s = "bbbbbbbb-0000-0000-0000-00000000000b";
    const map = new Map([["daax-admins", new Set(["admin"])]]);
    const withGroup = {
      subject: s,
      email: "pg@x.z",
      username: "pg",
      name: null,
      idp: "test",
      groups: ["daax-admins"],
    };

    // Admin arrives via group-sync (granted_by='group-sync').
    await jitProvision(withGroup, map);

    // A reconcile-owned pending grant keyed to the user's email exists (e.g. an
    // allow-list entry created before this subject was linked). On next login it
    // must UPGRADE the group-sync row to 'reconcile', not DO NOTHING.
    await query(
      "INSERT INTO pending_grants (identifier, role, granted_by) VALUES ($1, 'admin', 'reconcile')",
      ["pg@x.z"],
    );

    // Next login (still in group) materializes the pending grant → upgrade.
    await jitProvision(withGroup, map);
    const prov = await query<{ granted_by: string }>(
      "SELECT granted_by FROM user_roles WHERE subject = $1 AND role = 'admin'",
      [s],
    );
    expect(prov.rows[0]?.granted_by).toBe("reconcile");

    // Leaving the group must NOT revoke the reconcile-owned admin.
    const jit2 = await jitProvision({ ...withGroup, groups: [] }, map);
    expect(jit2.roles.sort()).toEqual(["admin", "user"]);
  });

  it("a non-UI grant never downgrades an existing UI grant", async () => {
    const s = "99999999-0000-0000-0000-00000000000e";
    await jitProvision(identity(s, "e@x.z", "e"));
    await grantRole(s, "admin"); // granted_by='ui'
    await grantRole(s, "admin", "group-sync"); // must NOT downgrade
    const prov = await query<{ granted_by: string }>(
      "SELECT granted_by FROM user_roles WHERE subject = $1 AND role = 'admin'",
      [s],
    );
    expect(prov.rows[0]?.granted_by).toBe("ui");
  });

  it("writes an auth_audit row on reconcile", async () => {
    await reconcile(envWith(""));
    const res = await query<{ event: string; outcome: string }>(
      "SELECT event, outcome FROM auth_audit WHERE event = 'reconcile' ORDER BY ts DESC LIMIT 1",
    );
    expect(res.rows[0]?.event).toBe("reconcile");
    expect(res.rows[0]?.outcome).toBe("applied");
  });
});

describe.skipIf(configured)(
  "RBAC on Postgres (skipped — no PG configured)",
  () => {
    it("is skipped because Postgres is not configured", () => {
      expect(configured).toBe(false);
    });
  },
);
