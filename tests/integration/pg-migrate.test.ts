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

async function columnExists(table: string, column: string): Promise<boolean> {
  const res = await query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
     ) AS exists`,
    [table, column],
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
  // WORKING `down`. The prior cases establish up (build) then down-all (teardown
  // to empty); this re-applies to complete a full up→down→up round-trip and
  // asserts the schema returns to the expected state.
  it("migrate up again after down completes an up→down→up round-trip", async () => {
    // Precondition from the previous case: schema is empty.
    expect(await tableExists("schema_meta")).toBe(false);

    const reapplied = await migrate("up", Infinity);
    // Every migration that was reverted is re-applied (all of them).
    expect(reapplied.some((n) => n.includes("baseline"))).toBe(true);

    // Expected end-state: the domain tables, the baseline marker, and the F2
    // column all exist again.
    expect(await tableExists("schema_meta")).toBe(true);
    expect(await tableExists("built_images")).toBe(true);
    expect(await tableExists("releases")).toBe(true);
    expect(await columnExists("built_images", "sbom_json")).toBe(true);

    const meta = await query<{ value: string }>(
      "SELECT value FROM schema_meta WHERE key = 'baseline'",
    );
    expect(meta.rows[0]?.value).toBe("phase-0");
  });

  // Non-vacuously exercise the add/drop-COLUMN down step in isolation. Reverting
  // ALL migrations drops built_images wholesale, which would mask a broken/no-op
  // `down` on the sbom_json column migration. Revert exactly ONE step: the column
  // must disappear while its table survives, then re-apply and re-assert. This is
  // the concrete evidence the column down-step works, not just table create/drop.
  it("reverts only the last migration: sbom_json column drops, built_images survives", async () => {
    // Precondition: full schema is present (from the previous round-trip case).
    expect(await columnExists("built_images", "sbom_json")).toBe(true);

    const reverted = await migrate("down", 1);
    expect(reverted.some((n) => n.includes("sbom"))).toBe(true);

    // The column is gone; the table it hangs off of is NOT dropped.
    expect(await columnExists("built_images", "sbom_json")).toBe(false);
    expect(await tableExists("built_images")).toBe(true);

    // Re-apply just that step: the column comes back.
    const reapplied = await migrate("up", 1);
    expect(reapplied.some((n) => n.includes("sbom"))).toBe(true);
    expect(await columnExists("built_images", "sbom_json")).toBe(true);
  });
});

describe.skipIf(configured)("Postgres migration round-trip (skipped)", () => {
  it("is skipped because Postgres is not configured", () => {
    // Visible marker that the integration suite was intentionally skipped.
    expect(configured).toBe(false);
  });
});
