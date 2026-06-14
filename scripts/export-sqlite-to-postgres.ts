/**
 * One-shot SQLite→Postgres exporter (brain2daax Phase 0 — issue #93).
 *
 * Reads the legacy SQLite stores (catalog.db, releases.db) and inserts every
 * row into the corresponding Postgres tables (created by the §93 migration),
 * via the shared `pg` pool. Idempotent (`ON CONFLICT (pk) DO NOTHING`) so a
 * re-run is safe; resets bigserial sequences afterwards.
 *
 * Usage:
 *   tsx scripts/export-sqlite-to-postgres.ts [--catalog <path>] [--releases <path>]
 * Defaults: data/catalog.db, data/releases.db (or $CATALOG_DB_PATH / $RELEASES_DB_PATH).
 *
 * Column names match 1:1 between SQLite and Postgres by design, so the copy is
 * column-agnostic. JSON-as-TEXT columns insert straight into jsonb (Postgres
 * assignment-casts text→jsonb); timestamptz parses the SQLite datetime text.
 */

import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";
import { Client } from "pg";
import { resolveDbConfig, DbConfigError } from "../lib/db/config";

/** Tables in FK-safe insert order, with their primary-key column and source DB. */
const TABLES: { name: string; pk: string; source: "catalog" | "releases" }[] = [
  { name: "bases", pk: "id", source: "catalog" },
  { name: "base_versions", pk: "id", source: "catalog" },
  { name: "features", pk: "id", source: "catalog" },
  { name: "feature_versions", pk: "id", source: "catalog" },
  { name: "build_specs", pk: "id", source: "catalog" },
  { name: "build_jobs", pk: "id", source: "catalog" },
  { name: "built_images", pk: "digest", source: "catalog" },
  { name: "releases", pk: "id", source: "releases" },
  { name: "release_shares", pk: "id", source: "releases" },
  { name: "feature_snapshots", pk: "id", source: "releases" },
];

/** Tables whose integer PK is a bigserial we must re-sync after explicit inserts. */
const SERIAL_PK_TABLES = [
  "base_versions",
  "feature_versions",
  "release_shares",
  "feature_snapshots",
];

/**
 * Columns that are NOT NULL in Postgres but were nullable in the legacy SQLite
 * schema: a NULL in the source would fail the insert, so coalesce it to a safe
 * default before copying. (`bases.security_profile_json` is NOT NULL to match
 * the required BaseImage.securityProfile type.)
 */
const NOT_NULL_JSON_DEFAULTS: Record<string, Record<string, string>> = {
  bases: { security_profile_json: "{}" },
};

/**
 * Read a `--flag <value>` option. Returns undefined when the flag is absent;
 * THROWS when the flag is present but its value is missing (next token absent or
 * another flag) — so a typo like `--catalog --releases x` fails loudly rather
 * than silently falling back to the default path.
 */
function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  if (i < 0) return undefined;
  const value = process.argv[i + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function openSqlite(file: string, explicit: boolean): Database.Database | null {
  if (!fs.existsSync(file)) {
    if (explicit) {
      // A path was explicitly supplied (flag/env) but doesn't exist — almost
      // certainly a typo. Fail loudly rather than silently export a partial set.
      throw new Error(
        `SQLite source not found at explicitly provided path: ${file}`,
      );
    }
    console.warn(
      `[export] no SQLite file at default path, skipping: ${file} (fresh install with no legacy data?)`,
    );
    return null;
  }
  return new Database(file, { readonly: true });
}

function tableExists(db: Database.Database, name: string): boolean {
  return (
    db
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?")
      .get(name) !== undefined
  );
}

async function copyTable(
  pg: Client,
  sqlite: Database.Database,
  table: string,
  pk: string,
): Promise<number> {
  if (!tableExists(sqlite, table)) {
    console.warn(`[export]   ${table}: not present in source, skipping`);
    return 0;
  }
  const rows = sqlite.prepare(`SELECT * FROM ${table}`).all() as Record<
    string,
    unknown
  >[];
  if (rows.length === 0) return 0;

  const columns = Object.keys(rows[0]);
  // Escape identifiers (double any embedded quote) so an unexpected/hand-edited
  // SQLite column name can't break the generated SQL or inject.
  const quoteIdent = (c: string) => `"${c.replace(/"/g, '""')}"`;
  const colList = columns.map(quoteIdent).join(", ");
  const defaults = NOT_NULL_JSON_DEFAULTS[table] ?? {};

  // Batch into multi-row INSERTs (chunked to stay well under Postgres' 65535
  // bound parameter limit) instead of one round-trip per row.
  const chunkSize = Math.max(1, Math.floor(60000 / columns.length));
  let inserted = 0;
  for (let offset = 0; offset < rows.length; offset += chunkSize) {
    const chunk = rows.slice(offset, offset + chunkSize);
    const values: unknown[] = [];
    const tuples = chunk.map((row, r) => {
      const ph = columns.map((_, c) => `$${r * columns.length + c + 1}`);
      for (const col of columns)
        values.push(
          row[col] == null && col in defaults ? defaults[col] : row[col],
        );
      return `(${ph.join(", ")})`;
    });
    const res = await pg.query(
      `INSERT INTO ${table} (${colList}) VALUES ${tuples.join(", ")}
       ON CONFLICT ("${pk}") DO NOTHING`,
      values,
    );
    inserted += res.rowCount ?? 0;
  }
  return inserted;
}

async function resyncSequence(pg: Client, table: string): Promise<void> {
  // setval to MAX(id) so subsequent inserts don't collide with copied ids.
  await pg.query(
    `SELECT setval(
       pg_get_serial_sequence($1, 'id'),
       COALESCE((SELECT MAX(id) FROM ${table}), 1),
       (SELECT COUNT(*) FROM ${table}) > 0
     )`,
    [table],
  );
}

async function main(): Promise<void> {
  let config;
  try {
    config = resolveDbConfig();
  } catch (err) {
    if (err instanceof DbConfigError) {
      console.error(`[export] ${err.message}`);
      process.exit(1);
    }
    throw err;
  }

  const catalogArg = arg("--catalog") || process.env.CATALOG_DB_PATH;
  const releasesArg = arg("--releases") || process.env.RELEASES_DB_PATH;
  const catalogPath =
    catalogArg || path.join(process.cwd(), "data", "catalog.db");
  const releasesPath =
    releasesArg || path.join(process.cwd(), "data", "releases.db");

  const catalog = openSqlite(catalogPath, Boolean(catalogArg));
  const releases = openSqlite(releasesPath, Boolean(releasesArg));

  const pg = new Client(config.poolConfig);
  await pg.connect();
  try {
    // One transaction for the whole copy + sequence resync: a failure rolls the
    // entire export back (atomic, no partial dataset) and avoids per-row commit
    // overhead.
    await pg.query("BEGIN");
    try {
      const totals: Record<string, number> = {};
      for (const { name, pk, source } of TABLES) {
        const sqlite = source === "catalog" ? catalog : releases;
        if (!sqlite) continue;
        totals[name] = await copyTable(pg, sqlite, name, pk);
        console.log(`[export]   ${name}: ${totals[name]} row(s) inserted`);
      }
      for (const table of SERIAL_PK_TABLES) {
        await resyncSequence(pg, table);
      }
      await pg.query("COMMIT");
      const grand = Object.values(totals).reduce((a, b) => a + b, 0);
      console.log(`[export] done: ${grand} row(s) inserted across all tables.`);
    } catch (err) {
      await pg.query("ROLLBACK");
      throw err;
    }
  } finally {
    await pg.end();
    catalog?.close();
    releases?.close();
  }
}

main().catch((err) => {
  console.error("[export] failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
