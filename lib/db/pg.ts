/**
 * Postgres connection pool (brain2daax Phase 0 — issue #92).
 *
 * A lazily-initialised singleton `pg.Pool` shared across the app. The pool is
 * created on first use from the shared `resolveDbConfig()` so the runtime app
 * and the migration runner connect through identical configuration.
 *
 * Phase 0 introduces the pooled client; the existing SQLite-backed data layers
 * (`lib/catalog/db.ts`, `lib/releases-db.ts`) are NOT rewritten here — that is
 * the one-time SQLite→Postgres data migration tracked separately (#migrate).
 * As a result nothing in the app boot path imports this module yet, so a
 * deployment without Postgres configured still starts; consumers land later.
 */

import {
  Pool,
  type PoolClient,
  type QueryResult,
  type QueryResultRow,
} from "pg";
import { resolveDbConfig } from "./config";

let pool: Pool | null = null;

/** Connect-establishment timeout (ms) applied to the runtime pool when unset. */
const DEFAULT_CONNECT_TIMEOUT_MS = 5000;

/**
 * Resolve the pool's connection-establishment timeout (ms).
 *
 * Bounds how long a single connect attempt may run before `pg` aborts it.
 * Without it (`pg` default is 0 = wait forever) a black-hole Postgres host —
 * one that accepts the TCP SYN but never completes auth — leaves connect
 * attempts running indefinitely, so repeated callers (e.g. the `/api/health`
 * probe) accumulate pending work. This bounds the runtime pool only; the
 * migration runner keeps `pg`'s default so a DB-startup race can't fail it.
 *
 * Override with `DAAX_DB_CONNECT_TIMEOUT_MS`; a missing/invalid/non-positive
 * value falls back to the default. Keep it well under the healthcheck interval
 * so attempts can't accumulate between probes.
 */
export function resolveConnectTimeoutMs(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env.DAAX_DB_CONNECT_TIMEOUT_MS?.trim();
  if (!raw || !/^\d+$/.test(raw)) return DEFAULT_CONNECT_TIMEOUT_MS;
  const parsed = Number.parseInt(raw, 10);
  return parsed > 0 ? parsed : DEFAULT_CONNECT_TIMEOUT_MS;
}

/** Get (or lazily create) the shared connection pool. Throws `DbConfigError` if unconfigured. */
export function getPool(): Pool {
  if (!pool) {
    const { poolConfig, source } = resolveDbConfig();
    pool = new Pool({
      ...poolConfig,
      connectionTimeoutMillis: resolveConnectTimeoutMs(),
    });
    pool.on("error", (err) => {
      // An idle client emitted an error (e.g. backend terminated). Log; the
      // pool will discard the client. Never let this crash the process.
      console.error("[db] idle pool client error:", err.message);
    });
    console.log(`[db] Postgres pool initialised (source: ${source})`);
  }
  return pool;
}

/** Run a parameterised query against the pool. */
export function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: readonly unknown[],
): Promise<QueryResult<T>> {
  return getPool().query<T>(text, params as unknown[] | undefined);
}

/** Check out a client for a transaction. Caller MUST `release()` it. */
export function getClient(): Promise<PoolClient> {
  return getPool().connect();
}

/**
 * Liveness probe: `SELECT 1`. Resolves true when the pool can reach Postgres.
 * Used by the integration test to prove the pooled client is the connection path.
 */
export async function ping(): Promise<boolean> {
  const result = await query<{ ok: number }>("SELECT 1 AS ok");
  return result.rows[0]?.ok === 1;
}

/** Close the pool (graceful shutdown / test teardown). Safe to call when uninitialised. */
export async function closePool(): Promise<void> {
  if (pool) {
    const closing = pool;
    pool = null;
    await closing.end();
  }
}
