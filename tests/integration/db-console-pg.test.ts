/**
 * Integration tests for the admin DB console (brain2daax F6, #102) against a
 * REAL Postgres (provided by `bun run test:integration`; self-skips when
 * Postgres is not configured).
 *
 * Proves end-to-end the properties the unit tests assert against mocks:
 *  - list/inspect real tables (read-only path);
 *  - an injected table identifier is rejected and the target table SURVIVES;
 *  - an injected VALUE is stored literally (param-bound), not executed;
 *  - writes are refused unless DAAX_DB_CONSOLE_WRITES=1 (read-only default);
 *  - a write to an audited table forces an auth_audit row (D4);
 *  - a write to an audited table is REFUSED (rolled back) when auth_audit is
 *    absent (fail-closed).
 *
 * auth_audit / rbac_roles are F5 (#101) tables not yet in migrations, so this
 * test stands up representative copies to exercise the audited-write contract.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import path from "node:path";
import { Client } from "pg";
import { runner } from "node-pg-migrate";
import { resolveDbConfig, isDbConfigured } from "@/lib/db/config";
import { query, closePool } from "@/lib/db/pg";
import { resetSchema } from "./helpers";
import {
  listTables,
  listRows,
  validateTable,
  executeWrite,
  ConsoleError,
} from "@/lib/db/console";

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

async function tableExists(name: string): Promise<boolean> {
  const res = await query(
    `SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = $1`,
    [name],
  );
  return res.rows.length > 0;
}

async function createAuthAudit(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS auth_audit (
      id bigserial PRIMARY KEY,
      actor text,
      action text,
      target_table text,
      detail jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
}

describe.skipIf(!configured)("admin DB console (Postgres) — F6 #102", () => {
  beforeAll(async () => {
    await resetSchema();
    await migrateUp();
    // Probe table for read + value-injection tests.
    await query(`
      CREATE TABLE IF NOT EXISTS console_probe (
        id text PRIMARY KEY,
        note text
      )`);
    // Representative RBAC table (audited by default) + audit sink.
    await query(`
      CREATE TABLE IF NOT EXISTS rbac_roles (
        id text PRIMARY KEY,
        name text NOT NULL
      )`);
    await createAuthAudit();
  });

  afterAll(async () => {
    delete process.env.DAAX_DB_CONSOLE_WRITES;
    await closePool();
  });

  beforeEach(() => {
    delete process.env.DAAX_DB_CONSOLE_WRITES;
  });

  it("lists inspectable base tables and excludes pgmigrations", async () => {
    const names = (await listTables()).map((t) => t.name);
    expect(names).toContain("releases");
    expect(names).toContain("bases");
    expect(names).toContain("console_probe");
    expect(names).not.toContain("pgmigrations");
  });

  it("reads a page of real rows (read-only)", async () => {
    await query("INSERT INTO console_probe (id, note) VALUES ($1,$2)", [
      "row-1",
      "hello",
    ]);
    const page = await listRows("console_probe", { limit: 10, offset: 0 });
    expect(page.table).toBe("console_probe");
    expect(page.total).toBeGreaterThanOrEqual(1);
    expect(page.columns.map((c) => c.name)).toContain("note");
    expect(page.rows.some((r) => r.note === "hello")).toBe(true);
  });

  it("rejects an injected table identifier and the target table survives", async () => {
    await expect(
      validateTable("console_probe; DROP TABLE bases; --"),
    ).rejects.toBeInstanceOf(ConsoleError);
    await expect(
      listRows("bases); DROP TABLE bases; --"),
    ).rejects.toBeInstanceOf(ConsoleError);
    // The injection never executed: bases is intact.
    expect(await tableExists("bases")).toBe(true);
  });

  it("stores an injected VALUE literally (param-bound, never executed)", async () => {
    process.env.DAAX_DB_CONSOLE_WRITES = "1";
    const evil = "x'); DROP TABLE console_probe; --";
    await executeWrite(
      {
        table: "console_probe",
        action: "insert",
        values: { id: "evil-1", note: evil },
      },
      "tester",
    );
    // Table still exists and the payload is stored verbatim.
    expect(await tableExists("console_probe")).toBe(true);
    const res = await query("SELECT note FROM console_probe WHERE id = $1", [
      "evil-1",
    ]);
    expect(res.rows[0].note).toBe(evil);
  });

  it("refuses writes by default (read-only) — DAAX_DB_CONSOLE_WRITES unset", async () => {
    await expect(
      executeWrite(
        {
          table: "console_probe",
          action: "insert",
          values: { id: "nope", note: "x" },
        },
        "tester",
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(
      (await query("SELECT 1 FROM console_probe WHERE id = $1", ["nope"])).rows
        .length,
    ).toBe(0);
  });

  it("permits a non-audited write when enabled (no audit required)", async () => {
    process.env.DAAX_DB_CONSOLE_WRITES = "1";
    const res = await executeWrite(
      {
        table: "console_probe",
        action: "insert",
        values: { id: "ok-1", note: "fine" },
      },
      "tester",
    );
    expect(res.audited).toBe(false);
    expect(res.rowsAffected).toBe(1);
  });

  it("forces an auth_audit row for an audited-table write (D4)", async () => {
    process.env.DAAX_DB_CONSOLE_WRITES = "1";
    await createAuthAudit();
    await query("DELETE FROM auth_audit");

    const res = await executeWrite(
      {
        table: "rbac_roles",
        action: "insert",
        values: { id: "admin", name: "Admin" },
      },
      "alice@example.com",
    );
    expect(res.audited).toBe(true);

    const audit = await query(
      "SELECT actor, action, target_table FROM auth_audit ORDER BY id DESC LIMIT 1",
    );
    expect(audit.rows.length).toBe(1);
    expect(audit.rows[0].actor).toBe("alice@example.com");
    expect(audit.rows[0].action).toBe("db_console_insert");
    expect(audit.rows[0].target_table).toBe("rbac_roles");
    // The role row was actually written, in the same committed transaction.
    expect(
      (await query("SELECT 1 FROM rbac_roles WHERE id = $1", ["admin"])).rows
        .length,
    ).toBe(1);
  });

  it("refuses an audited write and rolls back when auth_audit is absent (fail-closed)", async () => {
    process.env.DAAX_DB_CONSOLE_WRITES = "1";
    await query("DROP TABLE IF EXISTS auth_audit");

    await expect(
      executeWrite(
        {
          table: "rbac_roles",
          action: "insert",
          values: { id: "ghost", name: "Ghost" },
        },
        "tester",
      ),
    ).rejects.toMatchObject({ status: 409 });

    // The role row never landed (transaction rolled back).
    expect(
      (await query("SELECT 1 FROM rbac_roles WHERE id = $1", ["ghost"])).rows
        .length,
    ).toBe(0);

    // Restore the audit sink for any subsequent run.
    await createAuthAudit();
  });
});
