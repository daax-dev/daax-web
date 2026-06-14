/**
 * Postgres migration runner (brain2daax Phase 0 — issue #92).
 *
 * Usage:
 *   tsx scripts/db-migrate.ts up            # apply all pending migrations
 *   tsx scripts/db-migrate.ts down [count]  # roll back the last [count] (default 1)
 *
 * Connects through the SAME shared config as the runtime pool
 * (`resolveDbConfig()` in lib/db/config.ts), so the connection string is a
 * single env/secret-sourced code path. Runs node-pg-migrate against
 * `migrations/` and always closes the client.
 *
 * Idempotent + ordered: node-pg-migrate records applied migrations in the
 * `pgmigrations` table, so re-running `up` is a no-op. Migrations run inside a
 * single transaction (default) so a failure rolls back cleanly.
 */

import path from "node:path";
import { Client } from "pg";
import { runner } from "node-pg-migrate";
import { resolveDbConfig, DbConfigError } from "../lib/db/config";

type MigrationDirection = "up" | "down";

const MIGRATIONS_DIR = path.resolve(process.cwd(), "migrations");
const MIGRATIONS_TABLE = "pgmigrations";

function parseArgs(argv: string[]): {
  direction: MigrationDirection;
  count: number;
} {
  const direction = argv[2];
  if (direction !== "up" && direction !== "down") {
    throw new Error(
      `Usage: tsx scripts/db-migrate.ts <up|down> [count]\n  got: ${direction ?? "(nothing)"}`,
    );
  }
  // up: apply everything pending. down: default to a single step unless overridden.
  const defaultCount = direction === "up" ? Infinity : 1;
  let count = defaultCount;
  if (argv[3] !== undefined) {
    // Strict: reject partial numerics like "1abc" that parseInt would accept.
    if (!/^\d+$/.test(argv[3])) {
      throw new Error(
        `count must be a non-negative integer, got: "${argv[3]}"`,
      );
    }
    count = Number.parseInt(argv[3], 10);
  }
  return { direction, count };
}

async function main(): Promise<void> {
  const { direction, count } = parseArgs(process.argv);

  let config;
  try {
    config = resolveDbConfig();
  } catch (err) {
    if (err instanceof DbConfigError) {
      console.error(`[db:migrate] ${err.message}`);
      process.exit(1);
    }
    throw err;
  }

  const client = new Client(config.poolConfig);
  await client.connect();
  try {
    const applied = await runner({
      dbClient: client,
      migrationsTable: MIGRATIONS_TABLE,
      dir: MIGRATIONS_DIR,
      direction,
      count,
      createMigrationsSchema: false,
      // Wrap the whole batch so a mid-run failure rolls back every migration in
      // this invocation (the runtime only wraps when this is explicitly truthy).
      singleTransaction: true,
    });
    if (applied.length === 0) {
      console.log(`[db:migrate] ${direction}: nothing to do (up to date).`);
    } else {
      console.log(
        `[db:migrate] ${direction}: applied ${applied.length} migration(s): ` +
          applied.map((m) => m.name).join(", "),
      );
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(
    "[db:migrate] failed:",
    err instanceof Error ? err.message : err,
  );
  process.exit(1);
});
