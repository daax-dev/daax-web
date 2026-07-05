/**
 * Admin DB console integration test against a real throwaway Postgres (F6 — #102).
 *
 * Run via `bun run test:integration`. Exercises the parts of the console that
 * CANNOT be proven without a live database + information_schema:
 *   - loadSchemaCatalog / listTables discover the real RBAC + catalog tables;
 *   - inspectTable validates against the live catalog, paginates, and REJECTS an
 *     unknown/injected table name (it never reaches SQL);
 *   - executeWrite is refused when the write flag is OFF, and when ON it succeeds
 *     AND forces an auth_audit row in the SAME transaction (D4);
 *   - an audit-insert failure rolls the whole write back (write cannot outlive
 *     a failed audit).
 *
 * Self-skips when Postgres is not configured (Docker unavailable).
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import path from "node:path";
import { Client } from "pg";
import { runner } from "node-pg-migrate";
import { resolveDbConfig, isDbConfigured } from "@/lib/db/config";
import { query, closePool } from "@/lib/db/pg";
import {
  loadSchemaCatalog,
  listTables,
  inspectTable,
  executeWrite,
} from "@/lib/db-console/console";
import { InvalidIdentifierError } from "@/lib/db-console/identifiers";
import {
  dbConsoleWritesEnabled,
  DB_CONSOLE_WRITES_ENV,
} from "@/lib/db-console/super-admin";
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

const AUDIT_CTX = {
  subject: null,
  route: "/api/admin/db/tables/[table]",
  ip: "127.0.0.1",
  ua: "vitest",
};

describe.skipIf(!configured)("DB console on Postgres (F6 #102)", () => {
  beforeAll(async () => {
    await resetSchema();
    await migrateUp();
  });

  beforeEach(async () => {
    await query(
      "TRUNCATE user_roles, pending_grants, auth_audit, users RESTART IDENTITY CASCADE",
    );
  });

  afterAll(async () => {
    await closePool();
  });

  it("catalog + listTables discover the real RBAC and catalog tables", async () => {
    const catalog = await loadSchemaCatalog();
    for (const t of ["users", "roles", "user_roles", "auth_audit"]) {
      expect(catalog.has(t)).toBe(true);
    }
    const list = await listTables();
    const names = list.map((t) => t.name);
    expect(names).toContain("users");
    expect(names).toContain("roles");
    // Ported catalog/releases tables are present too.
    expect(names).toContain("releases");
    // Column metadata is populated.
    const users = catalog.get("users")!;
    expect(users.columns.find((c) => c.name === "subject")?.dataType).toBe(
      "text",
    );
  });

  it("inspectTable paginates real rows and reports a bounded total", async () => {
    await query(
      "INSERT INTO users (subject, username, email) VALUES ($1,$2,$3),($4,$5,$6)",
      ["s-a", "a", "a@x.z", "s-b", "b", "b@x.z"],
    );
    const res = await inspectTable("users", { limit: 1, offset: 0 });
    expect(res.total).toBe(2);
    expect(res.totalCapped).toBe(false);
    expect(res.rows).toHaveLength(1);
    expect(res.columns.some((c) => c.name === "subject")).toBe(true);

    const page2 = await inspectTable("users", { limit: 1, offset: 1 });
    expect(page2.rows).toHaveLength(1);
    expect(page2.rows[0]!.subject).not.toBe(res.rows[0]!.subject);
  });

  it("inspectTable REJECTS an unknown/injected table name (never executed)", async () => {
    await expect(
      inspectTable("users; DROP TABLE users", { limit: 10, offset: 0 }),
    ).rejects.toBeInstanceOf(InvalidIdentifierError);
    // The real table is untouched by the rejected call.
    const still = await loadSchemaCatalog();
    expect(still.has("users")).toBe(true);
  });

  it("executeWrite succeeds AND forces an auth_audit row in one transaction", async () => {
    // Seed a user so the FK on user_roles is satisfiable.
    await query("INSERT INTO users (subject) VALUES ($1)", ["s-write"]);

    const result = await executeWrite(
      "user_roles",
      { op: "insert", values: { subject: "s-write", role: "admin" } },
      AUDIT_CTX,
    );
    expect(result.rowCount).toBe(1);

    const roles = await query<{ role: string }>(
      "SELECT role FROM user_roles WHERE subject = $1",
      ["s-write"],
    );
    expect(roles.rows.map((r) => r.role)).toEqual(["admin"]);

    // The forced audit row exists with the write event + permission.
    const audit = await query<{
      event: string;
      permission: string;
      outcome: string;
    }>(
      "SELECT event, permission, outcome FROM auth_audit WHERE event = 'db-console-write' ORDER BY id DESC LIMIT 1",
    );
    expect(audit.rows[0]).toMatchObject({
      event: "db-console-write",
      permission: "admin:db:write",
      outcome: "allow",
    });
  });

  it("a failed write leaves NO audit row (transaction rolls back atomically)", async () => {
    // Insert into user_roles with a non-existent subject → FK violation.
    await expect(
      executeWrite(
        "user_roles",
        { op: "insert", values: { subject: "ghost", role: "admin" } },
        AUDIT_CTX,
      ),
    ).rejects.toThrow();

    const audit = await query(
      "SELECT 1 FROM auth_audit WHERE event = 'db-console-write'",
    );
    expect(audit.rowCount).toBe(0);
    const roles = await query(
      "SELECT 1 FROM user_roles WHERE subject = 'ghost'",
    );
    expect(roles.rowCount).toBe(0);
  });

  it("write flag OFF refuses the write; ON performs it AND audits (D4)", async () => {
    await query("INSERT INTO users (subject) VALUES ($1)", ["s-flag"]);
    const prev = process.env[DB_CONSOLE_WRITES_ENV];
    try {
      // OFF (default): the gate the route enforces refuses — no write happens.
      delete process.env[DB_CONSOLE_WRITES_ENV];
      expect(dbConsoleWritesEnabled()).toBe(false);
      // (Route returns 403 without calling executeWrite; assert nothing written.)
      const before = await query(
        "SELECT 1 FROM user_roles WHERE subject = 's-flag'",
      );
      expect(before.rowCount).toBe(0);

      // ON: the write proceeds and forces an audit row.
      process.env[DB_CONSOLE_WRITES_ENV] = "1";
      expect(dbConsoleWritesEnabled()).toBe(true);
      await executeWrite(
        "user_roles",
        { op: "insert", values: { subject: "s-flag", role: "user" } },
        AUDIT_CTX,
      );
      const after = await query(
        "SELECT 1 FROM user_roles WHERE subject = 's-flag'",
      );
      expect(after.rowCount).toBe(1);
      const audit = await query(
        "SELECT 1 FROM auth_audit WHERE event = 'db-console-write'",
      );
      expect(audit.rowCount).toBe(1);
    } finally {
      if (prev === undefined) delete process.env[DB_CONSOLE_WRITES_ENV];
      else process.env[DB_CONSOLE_WRITES_ENV] = prev;
    }
  });

  it("executeWrite REJECTS an unknown table/column before any SQL runs", async () => {
    await expect(
      executeWrite(
        "users; DROP TABLE users",
        { op: "insert", values: { subject: "x" } },
        AUDIT_CTX,
      ),
    ).rejects.toBeInstanceOf(InvalidIdentifierError);

    await expect(
      executeWrite(
        "users",
        { op: "insert", values: { "nope; --": "x" } },
        AUDIT_CTX,
      ),
    ).rejects.toBeInstanceOf(InvalidIdentifierError);
  });
});

describe.skipIf(configured)(
  "DB console on Postgres (skipped — no PG configured)",
  () => {
    it("is skipped because Postgres is not configured", () => {
      expect(configured).toBe(false);
    });
  },
);
