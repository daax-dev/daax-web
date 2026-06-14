/**
 * Integration-test helpers (brain2daax #93).
 */

import { query } from "@/lib/db/pg";

/**
 * Refuse to run destructive schema resets against anything but the dedicated
 * integration test database. The integration suites `DROP SCHEMA public CASCADE`
 * in their setup; pointed at a real dev/prod `DATABASE_URL` that would wipe all
 * data. Require an unmistakable test-DB marker (`PGDATABASE=daax_test`, or a
 * `DATABASE_URL` whose database is `daax_test`).
 */
export function assertTestDatabase(): void {
  const url = process.env.DATABASE_URL ?? "";
  const pgDatabase = process.env.PGDATABASE ?? "";
  const urlDb =
    url
      .replace(/[?#].*$/, "")
      .split("/")
      .filter(Boolean) // tolerate a trailing slash (…/daax_test/)
      .pop() ?? "";
  const isTestDb = pgDatabase === "daax_test" || urlDb === "daax_test";
  if (!isTestDb) {
    throw new Error(
      "Refusing to reset schema: integration tests must target the dedicated " +
        "test database (PGDATABASE=daax_test, or a DATABASE_URL ending in " +
        "/daax_test). Run them via `bun run test:integration`.",
    );
  }
}

/** Drop and recreate the public schema — guarded to the test DB only. */
export async function resetSchema(): Promise<void> {
  assertTestDatabase();
  await query("DROP SCHEMA IF EXISTS public CASCADE");
  await query("CREATE SCHEMA public");
}
