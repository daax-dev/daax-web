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

  // Operational-resilience gate (#103, brain2daax §4): every migration ships a
  // WORKING `down`. The prior cases establish up (build) then down (teardown to
  // empty); this re-applies to complete a full up→down→up round-trip and asserts
  // the schema returns to the expected state — the concrete evidence that the
  // down steps leave the DB in a state a subsequent up can rebuild cleanly.
  it("migrate up again after down completes an up→down→up round-trip", async () => {
    // Precondition from the previous case: schema is empty.
    expect(await tableExists("schema_meta")).toBe(false);

    const reapplied = await migrate("up", Infinity);
    // Every migration that was reverted is re-applied (all of them).
    expect(reapplied.some((n) => n.includes("baseline"))).toBe(true);

    // Expected end-state: the domain tables and the baseline marker exist again.
    expect(await tableExists("schema_meta")).toBe(true);
    expect(await tableExists("built_images")).toBe(true);
    expect(await tableExists("releases")).toBe(true);

    // The F2 column reverts and re-applies with its migration (proves the
    // add/drop-column down step round-trips, not just table create/drop).
    const col = await query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'built_images'
           AND column_name = 'sbom_json'
       ) AS exists`,
    );
    expect(col.rows[0]?.exists).toBe(true);

    const meta = await query<{ value: string }>(
      "SELECT value FROM schema_meta WHERE key = 'baseline'",
    );
    expect(meta.rows[0]?.value).toBe("phase-0");
  });
});

describe.skipIf(configured)("Postgres migration round-trip (skipped)", () => {
  it("is skipped because Postgres is not configured", () => {
    // Visible marker that the integration suite was intentionally skipped.
    expect(configured).toBe(false);
  });
});
