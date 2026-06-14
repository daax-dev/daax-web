/**
 * Postgres connection configuration (brain2daax Phase 0 — issue #92).
 *
 * Single source of truth for how daax-web resolves its Postgres connection.
 * BOTH the runtime pool (`lib/db/pg.ts`) and the migration runner
 * (`scripts/db-migrate.ts`) consume this module, so "connection string sourced
 * from env/secret" is one provable code path rather than two divergent ones.
 *
 * Resolution order:
 *   1. `DATABASE_URL` (libpq connection URI) — preferred; carries `?sslmode=...`.
 *   2. Discrete libpq env vars: `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`,
 *      `PGPASSWORD`.
 * Fail-closed: if neither a URL nor the minimal discrete set is present, throw
 * `DbConfigError` — daax never silently connects to a default/localhost DB.
 *
 * This module is framework-agnostic (no `server-only`, no Next imports) so it
 * runs identically under Next, `tsx`, `bun`, and Vitest.
 */

import type { PoolConfig } from "pg";

/** Thrown when Postgres is not configured. Distinct type so callers/tests can assert on it. */
export class DbConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DbConfigError";
  }
}

export interface DaaxDbConfig {
  /** A `PoolConfig` usable directly by `new Pool()` and `new Client()`. */
  poolConfig: PoolConfig;
  /** Where the config came from, for logging. Never contains the password. */
  source: "DATABASE_URL" | "discrete-env";
}

/**
 * Decide whether to enable TLS for a discrete-env connection.
 * `PGSSLMODE` follows libpq semantics; anything other than unset/`disable`/`allow`/`prefer`
 * turns TLS on. `DAAX_DB_SSL=1` is an explicit override. When TLS is enabled we keep
 * `rejectUnauthorized` configurable via `DAAX_DB_SSL_REJECT_UNAUTHORIZED` (defaults true).
 * For `DATABASE_URL`, pass `?sslmode=require` in the URI instead — `pg` honours it.
 */
function resolveSsl(env: NodeJS.ProcessEnv): PoolConfig["ssl"] {
  const explicit = env.DAAX_DB_SSL?.trim().toLowerCase();
  const mode = env.PGSSLMODE?.trim().toLowerCase();
  const tlsRequested =
    explicit === "1" ||
    explicit === "true" ||
    (mode !== undefined && !["", "disable", "allow", "prefer"].includes(mode));
  if (!tlsRequested) return undefined;

  const reject = env.DAAX_DB_SSL_REJECT_UNAUTHORIZED?.trim().toLowerCase();
  const rejectUnauthorized = !(reject === "0" || reject === "false");
  return { rejectUnauthorized };
}

/**
 * Resolve the Postgres connection config from the environment.
 *
 * @param env - environment to read from (defaults to `process.env`; injectable for tests).
 * @throws {DbConfigError} when no usable connection configuration is present.
 */
export function resolveDbConfig(
  env: NodeJS.ProcessEnv = process.env,
): DaaxDbConfig {
  const url = env.DATABASE_URL?.trim();
  if (url) {
    return { poolConfig: { connectionString: url }, source: "DATABASE_URL" };
  }

  const host = env.PGHOST?.trim();
  const database = env.PGDATABASE?.trim();
  const user = env.PGUSER?.trim();

  // Require the minimal libpq triple. Port and password may legitimately be
  // omitted (default 5432; trust/peer auth), so they are not part of the gate.
  const missing = [
    !host && "PGHOST",
    !database && "PGDATABASE",
    !user && "PGUSER",
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new DbConfigError(
      `Postgres is not configured. Set DATABASE_URL, or provide discrete env vars ` +
        `(missing: ${missing.join(", ")}). See CLAUDE.md › Database.`,
    );
  }

  const port = env.PGPORT?.trim();
  // Strict: reject partial numerics like "5432abc" (Number.parseInt would
  // silently accept them). Empty/unset falls back to the default port.
  let parsedPort = 5432;
  if (port) {
    if (!/^\d+$/.test(port)) {
      throw new DbConfigError(`PGPORT is not a valid integer: "${port}".`);
    }
    parsedPort = Number.parseInt(port, 10);
  }

  const poolConfig: PoolConfig = {
    host,
    port: parsedPort,
    database,
    user,
    password: env.PGPASSWORD,
  };

  const ssl = resolveSsl(env);
  if (ssl) poolConfig.ssl = ssl;

  return { poolConfig, source: "discrete-env" };
}

/** True when a Postgres connection is configured, without throwing. */
export function isDbConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  try {
    resolveDbConfig(env);
    return true;
  } catch {
    return false;
  }
}
