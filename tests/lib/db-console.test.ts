/**
 * Unit tests for the admin DB inspection console (brain2daax F6, #102).
 *
 * No real Postgres: `@/lib/db/pg` (query + getClient) is mocked with a small
 * fake catalog so the SQLi-safety properties can be asserted against the EXACT
 * SQL + bound parameters the console builds. The end-to-end behavior against a
 * real Postgres is proven separately in tests/integration/db-console-pg.test.ts.
 *
 * Properties asserted here:
 *  - Identifier safety: table/column names are validated against
 *    information_schema and bound as parameters (never interpolated); an
 *    injected/unknown identifier is rejected before any data query runs.
 *  - Value safety: values are bound as $N::type, never concatenated.
 *  - Read-only default: executeWrite throws unless DAAX_DB_CONSOLE_WRITES=1.
 *  - Audited writes (D4): a write to an audited table forces an auth_audit row in
 *    the same transaction; a missing auth_audit table refuses the write (rollback).
 *  - Super-admin gate: env allow-list, default-deny, case-insensitive match.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock the Postgres access layer with a tiny fake catalog.
// ---------------------------------------------------------------------------
const queryMock = vi.fn();
const getClientMock = vi.fn();
vi.mock("@/lib/db/pg", () => ({
  query: (sql: string, params?: unknown[]) => queryMock(sql, params),
  getClient: () => getClientMock(),
}));

import {
  validateTable,
  getColumns,
  listRows,
  listTables,
  executeWrite,
  writesEnabled,
  auditedTables,
  ConsoleError,
} from "@/lib/db/console";
import {
  isSuperAdmin,
  requireSuperAdmin,
  superAdminAllowlist,
} from "@/lib/db/superadmin";
import type { AuthUser } from "@/lib/auth-types";

/** Build a ProcessEnv with ONLY the given keys (no leakage from process.env). */
function env(overrides: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return overrides as NodeJS.ProcessEnv;
}

// Fake schema: which tables exist, and their columns (name/udt/nullable/default).
const SCHEMA: Record<
  string,
  { name: string; udt: string; nullable: boolean; hasDefault: boolean }[]
> = {
  releases: [
    { name: "id", udt: "text", nullable: false, hasDefault: false },
    { name: "name", udt: "text", nullable: false, hasDefault: false },
    {
      name: "feature_config",
      udt: "jsonb",
      nullable: false,
      hasDefault: false,
    },
  ],
  rbac_roles: [
    { name: "id", udt: "text", nullable: false, hasDefault: false },
    { name: "name", udt: "text", nullable: false, hasDefault: false },
  ],
};

function installFakeDb() {
  queryMock.mockImplementation((sql: string, params?: unknown[]) => {
    if (sql.includes("information_schema.tables")) {
      // Used by validateTable (params[0]) and listTables (no name param).
      if (params && params.length && !sql.includes("ORDER BY t.table_name")) {
        const name = String(params[0]);
        return Promise.resolve({
          rows: SCHEMA[name] ? [{ table_name: name }] : [],
        });
      }
      return Promise.resolve({
        rows: Object.keys(SCHEMA).map((t) => ({
          table_name: t,
          est_rows: "0",
        })),
      });
    }
    if (sql.includes("information_schema.columns")) {
      const name = String(params?.[0]);
      const cols = SCHEMA[name] ?? [];
      return Promise.resolve({
        rows: cols.map((c) => ({
          column_name: c.name,
          udt_name: c.udt,
          data_type: c.udt,
          is_nullable: c.nullable ? "YES" : "NO",
          column_default: c.hasDefault ? "x" : null,
        })),
      });
    }
    if (sql.includes("count(*)")) {
      return Promise.resolve({ rows: [{ count: "2" }] });
    }
    if (sql.trimStart().startsWith("SELECT *")) {
      return Promise.resolve({ rows: [{ id: "r1" }, { id: "r2" }] });
    }
    return Promise.resolve({ rows: [] });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.DAAX_DB_CONSOLE_WRITES;
  delete process.env.DAAX_DB_CONSOLE_AUDITED_TABLES;
  installFakeDb();
});

// ---------------------------------------------------------------------------
// Identifier validation / SQLi safety
// ---------------------------------------------------------------------------
describe("identifier validation (SQLi-safe)", () => {
  it("accepts a known table and returns its canonical name", async () => {
    await expect(validateTable("releases")).resolves.toBe("releases");
  });

  it("rejects an unknown table without executing it", async () => {
    await expect(validateTable("not_a_table")).rejects.toBeInstanceOf(
      ConsoleError,
    );
  });

  it("passes the table name ONLY as a bound parameter (never interpolated)", async () => {
    const injection = "releases; DROP TABLE bases; --";
    await expect(validateTable(injection)).rejects.toBeInstanceOf(ConsoleError);
    // The information_schema lookup must carry the raw string as a param, and
    // the SQL text must NOT contain the injected payload.
    const call = queryMock.mock.calls.find((c) =>
      String(c[0]).includes("information_schema.tables"),
    );
    expect(call).toBeDefined();
    expect(call![1]).toEqual([injection]);
    expect(String(call![0])).not.toContain("DROP TABLE");
  });

  it("rejects the migration bookkeeping table", async () => {
    await expect(validateTable("pgmigrations")).rejects.toBeInstanceOf(
      ConsoleError,
    );
  });

  it("rejects empty/non-string table names", async () => {
    await expect(validateTable("")).rejects.toBeInstanceOf(ConsoleError);
    await expect(validateTable(undefined)).rejects.toBeInstanceOf(ConsoleError);
    await expect(validateTable(123 as unknown)).rejects.toBeInstanceOf(
      ConsoleError,
    );
  });
});

// ---------------------------------------------------------------------------
// Read path
// ---------------------------------------------------------------------------
describe("listRows (read-only)", () => {
  it("quotes the validated identifier and binds limit/offset as params", async () => {
    const page = await listRows("releases", { limit: 10, offset: 20 });
    expect(page.table).toBe("releases");
    expect(page.total).toBe(2);
    const sel = queryMock.mock.calls.find((c) =>
      String(c[0]).startsWith("SELECT * FROM"),
    );
    expect(sel).toBeDefined();
    expect(String(sel![0])).toContain('SELECT * FROM "releases"');
    expect(String(sel![0])).toContain("LIMIT $1 OFFSET $2");
    expect(sel![1]).toEqual([10, 20]);
  });

  it("clamps an over-large limit and a negative offset", async () => {
    await listRows("releases", { limit: 100000, offset: -5 });
    const sel = queryMock.mock.calls.find((c) =>
      String(c[0]).startsWith("SELECT * FROM"),
    );
    expect(sel![1]).toEqual([200, 0]); // MAX_LIMIT, floored offset
  });

  it("rejects reading an unknown table", async () => {
    await expect(listRows("evil; --")).rejects.toBeInstanceOf(ConsoleError);
  });
});

describe("listTables", () => {
  it("returns inspectable tables", async () => {
    const tables = await listTables();
    expect(tables.map((t) => t.name).sort()).toEqual([
      "rbac_roles",
      "releases",
    ]);
  });
});

describe("getColumns", () => {
  it("returns typed column metadata", async () => {
    const cols = await getColumns("releases");
    expect(cols.find((c) => c.name === "feature_config")?.udt).toBe("jsonb");
  });
});

// ---------------------------------------------------------------------------
// Write path config
// ---------------------------------------------------------------------------
describe("write configuration", () => {
  it("writes are disabled by default", () => {
    expect(writesEnabled(env({}))).toBe(false);
    expect(writesEnabled(env({ DAAX_DB_CONSOLE_WRITES: "0" }))).toBe(false);
  });

  it("writes enabled only when flag is exactly '1'", () => {
    expect(writesEnabled(env({ DAAX_DB_CONSOLE_WRITES: "1" }))).toBe(true);
  });

  it("audited tables default to the RBAC set, overridable via env", () => {
    expect(auditedTables(env({})).has("rbac_roles")).toBe(true);
    const custom = auditedTables(
      env({ DAAX_DB_CONSOLE_AUDITED_TABLES: "foo, bar" }),
    );
    expect(custom.has("foo")).toBe(true);
    expect(custom.has("rbac_roles")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Write path execution (transaction + audit) — fake client
// ---------------------------------------------------------------------------
/** A fake pg client capturing every query; audit columns configurable. */
function fakeClient(auditColumns: string[] | null) {
  const calls: { sql: string; params?: unknown[] }[] = [];
  const client = {
    query: vi.fn((sql: string, params?: unknown[]) => {
      calls.push({ sql, params });
      if (
        sql.includes("information_schema.columns") &&
        sql.includes("auth_audit")
      ) {
        if (auditColumns === null) return Promise.resolve({ rows: [] });
        return Promise.resolve({
          rows: auditColumns.map((name) => ({
            column_name: name,
            udt_name: name === "detail" ? "jsonb" : "text",
            is_nullable: "YES",
            column_default: null,
          })),
        });
      }
      return Promise.resolve({ rows: [], rowCount: 1 });
    }),
    release: vi.fn(),
  };
  return { client, calls };
}

describe("executeWrite", () => {
  it("refuses when writes are disabled (read-only default)", async () => {
    await expect(
      executeWrite(
        {
          table: "releases",
          action: "update",
          values: { name: "x" },
          where: { id: "1" },
        },
        "tester",
      ),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("builds a parameterized UPDATE with $N::type and a WHERE", async () => {
    process.env.DAAX_DB_CONSOLE_WRITES = "1";
    const { client, calls } = fakeClient(["actor", "action"]);
    getClientMock.mockResolvedValue(client);

    const res = await executeWrite(
      {
        table: "releases",
        action: "update",
        values: { name: "renamed" },
        where: { id: "r1" },
      },
      "tester",
    );
    expect(res.rowsAffected).toBe(1);
    expect(res.audited).toBe(false); // releases is not an audited table

    const write = calls.find((c) => c.sql.startsWith("UPDATE"));
    expect(write).toBeDefined();
    expect(write!.sql).toContain('UPDATE "releases" SET "name" = $1::"text"');
    expect(write!.sql).toContain('WHERE "id" = $2::"text"');
    expect(write!.params).toEqual(["renamed", "r1"]);
    // No audit row for a non-audited table.
    expect(calls.some((c) => c.sql.includes("INSERT INTO auth_audit"))).toBe(
      false,
    );
  });

  it("refuses an UPDATE/DELETE without a WHERE (no mass mutation)", async () => {
    process.env.DAAX_DB_CONSOLE_WRITES = "1";
    getClientMock.mockResolvedValue(fakeClient(["actor"]).client);
    await expect(
      executeWrite(
        { table: "releases", action: "update", values: { name: "x" } },
        "t",
      ),
    ).rejects.toBeInstanceOf(ConsoleError);
    await expect(
      executeWrite({ table: "releases", action: "delete" }, "t"),
    ).rejects.toBeInstanceOf(ConsoleError);
  });

  it("rejects an unknown column in values (SQLi via column name)", async () => {
    process.env.DAAX_DB_CONSOLE_WRITES = "1";
    getClientMock.mockResolvedValue(fakeClient(["actor"]).client);
    await expect(
      executeWrite(
        {
          table: "releases",
          action: "update",
          values: { "name = '' OR 1=1; --": "x" },
          where: { id: "1" },
        },
        "t",
      ),
    ).rejects.toBeInstanceOf(ConsoleError);
  });

  it("forces an auth_audit row for an audited-table write (D4)", async () => {
    process.env.DAAX_DB_CONSOLE_WRITES = "1";
    const { client, calls } = fakeClient([
      "actor",
      "action",
      "target_table",
      "detail",
    ]);
    getClientMock.mockResolvedValue(client);

    const res = await executeWrite(
      {
        table: "rbac_roles",
        action: "update",
        values: { name: "admin" },
        where: { id: "1" },
      },
      "alice@example.com",
    );
    expect(res.audited).toBe(true);

    const audit = calls.find((c) => c.sql.includes("INSERT INTO auth_audit"));
    expect(audit).toBeDefined();
    expect(audit!.params).toContain("alice@example.com");
    // BEGIN before the audit + write, COMMIT after — and the audit precedes the write.
    const sqls = calls.map((c) => c.sql);
    expect(sqls[0]).toBe("BEGIN");
    expect(sqls).toContain("COMMIT");
    const auditIdx = sqls.findIndex((s) =>
      s.includes("INSERT INTO auth_audit"),
    );
    const writeIdx = sqls.findIndex((s) => s.startsWith("UPDATE"));
    expect(auditIdx).toBeLessThan(writeIdx);
  });

  it("refuses an audited write and rolls back when auth_audit is absent (fail-closed)", async () => {
    process.env.DAAX_DB_CONSOLE_WRITES = "1";
    const { client, calls } = fakeClient(null); // auth_audit missing
    getClientMock.mockResolvedValue(client);

    await expect(
      executeWrite(
        { table: "rbac_roles", action: "delete", where: { id: "1" } },
        "tester",
      ),
    ).rejects.toMatchObject({ status: 409 });

    const sqls = calls.map((c) => c.sql);
    expect(sqls).toContain("ROLLBACK");
    expect(sqls.some((s) => s.startsWith("DELETE"))).toBe(false); // write never ran
    expect(client.release).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Super-admin gate
// ---------------------------------------------------------------------------
function user(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    username: "bob",
    email: "bob@example.com",
    groups: [],
    authenticated: true,
    pictureUrl: null,
    ...overrides,
  };
}

describe("super-admin gate", () => {
  it("default-denies when the allow-list is empty (fail-closed)", () => {
    expect(isSuperAdmin(user(), env({}))).toBe(false);
    expect(superAdminAllowlist(env({})).size).toBe(0);
  });

  it("grants when username matches (case-insensitive)", () => {
    expect(
      isSuperAdmin(user(), env({ DAAX_DB_CONSOLE_SUPERADMINS: "BOB" })),
    ).toBe(true);
  });

  it("grants when email matches", () => {
    expect(
      isSuperAdmin(
        user(),
        env({
          DAAX_DB_CONSOLE_SUPERADMINS: "alice@example.com, bob@example.com",
        }),
      ),
    ).toBe(true);
  });

  it("denies a non-matching user", () => {
    expect(
      isSuperAdmin(
        user(),
        env({ DAAX_DB_CONSOLE_SUPERADMINS: "alice@example.com" }),
      ),
    ).toBe(false);
  });

  it("denies an unauthenticated user even if listed", () => {
    expect(
      isSuperAdmin(
        user({ authenticated: false }),
        env({ DAAX_DB_CONSOLE_SUPERADMINS: "bob" }),
      ),
    ).toBe(false);
  });

  it("requireSuperAdmin returns a 403 response for a non-super-admin", () => {
    const prev = process.env.DAAX_DB_CONSOLE_SUPERADMINS;
    delete process.env.DAAX_DB_CONSOLE_SUPERADMINS;
    const res = requireSuperAdmin(user());
    expect(res?.status).toBe(403);
    if (prev !== undefined) process.env.DAAX_DB_CONSOLE_SUPERADMINS = prev;
  });

  it("requireSuperAdmin returns null (allows) for a super-admin", () => {
    process.env.DAAX_DB_CONSOLE_SUPERADMINS = "bob";
    expect(requireSuperAdmin(user())).toBeNull();
    delete process.env.DAAX_DB_CONSOLE_SUPERADMINS;
  });
});
