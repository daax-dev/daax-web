/**
 * Integration test (brain2daax Phase 0 — issue #92).
 *
 * Against a real throwaway Postgres (provided by `scripts/with-test-postgres.sh`):
 *  - the shared `lib/db/pg.ts` pool connects and answers `SELECT 1` (proves the
 *    pooled client — not node-pg-migrate's own connection — is a working path);
 *  - `migrate up` creates the baseline `schema_meta` table (verified via
 *    `information_schema`);
 *  - re-running `up` is a no-op (idempotent + ordered);
 *  - `migrate down` removes it.
 *
 * The migration runner and the pool both consume `resolveDbConfig()`, so this
 * exercises one env-sourced connection path. Self-skips when Postgres is not
 * configured (e.g. Docker unavailable) so it never hard-fails CI.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { Client } from "pg";
import { runner, type RunnerOption } from "node-pg-migrate";
import { resolveDbConfig, isDbConfigured } from "@/lib/db/config";
import { ping, query, closePool } from "@/lib/db/pg";
import { resetSchema } from "./helpers";

const MIGRATIONS_DIR = path.resolve(process.cwd(), "migrations");
const MIGRATIONS_TABLE = "pgmigrations";
const configured = isDbConfigured();

async function migrate(
  direction: "up" | "down",
  count: number,
): Promise<string[]> {
  const client = new Client(resolveDbConfig().poolConfig);
  await client.connect();
  try {
    const opts: RunnerOption = {
      dbClient: client,
      migrationsTable: MIGRATIONS_TABLE,
      dir: MIGRATIONS_DIR,
      direction,
      count,
      createMigrationsSchema: false,
      singleTransaction: true,
      log: () => {}, // quiet
    };
    const applied = await runner(opts);
    return applied.map((m) => m.name);
  } finally {
    await client.end();
  }
}

async function tableExists(name: string): Promise<boolean> {
  const res = await query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1
     ) AS exists`,
    [name],
  );
  return res.rows[0]?.exists === true;
}

describe.skipIf(!configured)("Postgres migration round-trip", () => {
  beforeAll(async () => {
    // Start from a truly empty schema regardless of test-file order (one shared
    // PG). Guarded to the dedicated test DB so it can never wipe a real database.
    await resetSchema();
  });

  afterAll(async () => {
    await closePool();
  });

  it("connects through the shared pool (SELECT 1)", async () => {
    expect(await ping()).toBe(true);
  });

  it("starts with no baseline table", async () => {
    expect(await tableExists("schema_meta")).toBe(false);
  });

  it("migrate up creates the baseline schema_meta table", async () => {
    const applied = await migrate("up", Infinity);
    expect(applied.length).toBeGreaterThanOrEqual(1);
    expect(applied.some((n) => n.includes("baseline"))).toBe(true);
    expect(await tableExists("schema_meta")).toBe(true);

    // The baseline marker row is present.
    const meta = await query<{ value: string }>(
      "SELECT value FROM schema_meta WHERE key = 'baseline'",
    );
    expect(meta.rows[0]?.value).toBe("phase-0");
  });

  it("re-running up is an idempotent no-op", async () => {
    const applied = await migrate("up", Infinity);
    expect(applied).toEqual([]);
    expect(await tableExists("schema_meta")).toBe(true);
  });

  it("migrate down reverts every migration (incl. the baseline table)", async () => {
    // Infinity reverts all applied migrations regardless of how many exist.
    const reverted = await migrate("down", Infinity);
    expect(reverted.some((n) => n.includes("baseline"))).toBe(true);
    expect(await tableExists("schema_meta")).toBe(false);
  });
});

describe.skipIf(configured)("Postgres migration round-trip (skipped)", () => {
  it("is skipped because Postgres is not configured", () => {
    // Visible marker that the integration suite was intentionally skipped.
    expect(configured).toBe(false);
  });
});
