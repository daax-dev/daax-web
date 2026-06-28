import "server-only";
import { escapeIdentifier } from "pg";

import { query, getClient } from "@/lib/db/pg";
import { ConsoleError } from "@/lib/db/console-error";
import { forceAuditRow } from "@/lib/db/console-audit";

export { ConsoleError };

/**
 * Admin DB inspection console — read-first, SQLi-safe (brain2daax F6, #102).
 *
 * Ports the safety model of reference-platform's `dbadmin.go` to Postgres/TS
 * (docs/brain2daax.md §3 F6, §10 D4):
 *
 *  1. Table/column identifiers are NEVER interpolated from caller input. Each is
 *     validated against `information_schema` (it must exist as a public BASE
 *     TABLE / a column of that table) and only then embedded, quoted with
 *     `pg.escapeIdentifier` (the TS equivalent of `pgx.Identifier.Sanitize`).
 *  2. Values are ALWAYS bound as parameters, cast to the column's catalog type
 *     (`$N::type`) — never concatenated into SQL.
 *  3. Reads are the default. Writes are opt-in (DAAX_DB_CONSOLE_WRITES=1) and,
 *     for audited (RBAC) tables, force an `auth_audit` row in the same
 *     transaction — fail-closed if that cannot be done (see console-audit.ts).
 *
 * The console is table-AGNOSTIC: it inspects every non-system base table, so the
 * RBAC tables introduced by F5 (#101) appear automatically once that lands. No
 * table list is hard-coded into the read path.
 */

/** node-pg-migrate's bookkeeping table — never an inspection target. */
const MIGRATION_TABLE = "pgmigrations";

/**
 * Schema-qualify a validated table name as `"public"."name"`. Identifiers are
 * validated to exist in the `public` schema; qualifying every statement to
 * `public` prevents a hostile `search_path` from redirecting a read/write to a
 * same-named table in another schema (defense-in-depth).
 */
function qualify(name: string): string {
  return `"public".${escapeIdentifier(name)}`;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

const WRITES_ENV = "DAAX_DB_CONSOLE_WRITES";
const AUDITED_TABLES_ENV = "DAAX_DB_CONSOLE_AUDITED_TABLES";

/**
 * Tables whose raw writes MUST be audited (D4). The RBAC tables F5 (#101) will
 * introduce are ALWAYS audited and cannot be removed by configuration;
 * DAAX_DB_CONSOLE_AUDITED_TABLES can only ADD to this set (e.g. to track F5's
 * final naming, or audit additional sensitive tables) — never shrink it, so a
 * misconfiguration can never silence RBAC-table auditing.
 */
const MANDATORY_AUDITED_TABLES = [
  "rbac_users",
  "rbac_roles",
  "rbac_user_roles",
];

export interface ColumnMeta {
  name: string;
  /** Postgres internal type name (udt_name), e.g. text, int8, jsonb, timestamptz. */
  udt: string;
  dataType: string;
  nullable: boolean;
  hasDefault: boolean;
}

export interface TableSummary {
  name: string;
  /** Planner row estimate (pg_class.reltuples); -1 when unknown. */
  estimatedRows: number;
}

export interface RowPage {
  table: string;
  columns: ColumnMeta[];
  rows: Record<string, unknown>[];
  total: number;
  limit: number;
  offset: number;
}

export type WriteAction = "insert" | "update" | "delete";

export interface WriteOp {
  table: string;
  action: WriteAction;
  /** Column→value map for insert/update. */
  values?: Record<string, unknown>;
  /**
   * Equality filter column→value for update/delete. Required and non-empty: the
   * guard forbids an UNCONDITIONAL write (it does not, and cannot, guarantee the
   * predicate matches a single row — equality on a non-unique column may affect
   * many).
   */
  where?: Record<string, unknown>;
}

export interface WriteResult {
  table: string;
  action: WriteAction;
  rowsAffected: number;
  audited: boolean;
}

/** Whether the opt-in write path is enabled. Off unless DAAX_DB_CONSOLE_WRITES=1. */
export function writesEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[WRITES_ENV] === "1";
}

/**
 * The set of tables whose writes must be audited (lower-cased). Always includes
 * the mandatory RBAC set; DAAX_DB_CONSOLE_AUDITED_TABLES is ADDITIVE only.
 */
export function auditedTables(
  env: NodeJS.ProcessEnv = process.env,
): Set<string> {
  const set = new Set(MANDATORY_AUDITED_TABLES);
  const raw = env[AUDITED_TABLES_ENV];
  if (raw && raw.trim().length > 0) {
    for (const t of raw.split(",").map((s) => s.trim().toLowerCase())) {
      if (t) set.add(t);
    }
  }
  return set;
}

/**
 * Validate a table name against information_schema and return its CANONICAL
 * name (exactly as stored in the catalog). Throws ConsoleError(404) when the
 * name is not a public base table. The migration bookkeeping table is rejected.
 *
 * The name is passed ONLY as a bound parameter here — never interpolated — so an
 * injection attempt simply fails to match a row and is rejected.
 */
export async function validateTable(table: unknown): Promise<string> {
  if (typeof table !== "string" || table.length === 0) {
    throw new ConsoleError("A table name is required.", 400);
  }
  if (table.toLowerCase() === MIGRATION_TABLE) {
    throw new ConsoleError(`Table '${table}' is not inspectable.`, 404);
  }
  const res = await query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        AND table_name = $1`,
    [table],
  );
  const canonical = res.rows[0]?.table_name;
  if (!canonical) {
    throw new ConsoleError(`Unknown table: '${table}'.`, 404);
  }
  return canonical;
}

/** Fetch validated column metadata for a (validated) table, ordered by position. */
export async function getColumns(table: string): Promise<ColumnMeta[]> {
  const canonical = await validateTable(table);
  const res = await query<{
    column_name: string;
    udt_name: string;
    data_type: string;
    is_nullable: string;
    column_default: string | null;
  }>(
    `SELECT column_name, udt_name, data_type, is_nullable, column_default
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position`,
    [canonical],
  );
  return res.rows.map((r) => ({
    name: r.column_name,
    udt: r.udt_name,
    dataType: r.data_type,
    nullable: r.is_nullable === "YES",
    hasDefault: r.column_default !== null,
  }));
}

/** Validate a column against a table's catalog columns; returns its metadata. */
function requireColumn(
  columns: ColumnMeta[],
  name: unknown,
  table: string,
): ColumnMeta {
  if (typeof name !== "string" || name.length === 0) {
    throw new ConsoleError("Column names must be non-empty strings.", 400);
  }
  const col = columns.find((c) => c.name === name);
  if (!col) {
    throw new ConsoleError(
      `Unknown column '${name}' on table '${table}'.`,
      400,
    );
  }
  return col;
}

/** List every inspectable base table with a planner row estimate. */
export async function listTables(): Promise<TableSummary[]> {
  const res = await query<{ table_name: string; est_rows: string }>(
    `SELECT t.table_name,
            COALESCE(c.reltuples, -1)::bigint AS est_rows
       FROM information_schema.tables t
       LEFT JOIN pg_namespace n ON n.nspname = t.table_schema
       LEFT JOIN pg_class c ON c.relname = t.table_name
                           AND c.relnamespace = n.oid
                           AND c.relkind = 'r'
      WHERE t.table_schema = 'public'
        AND t.table_type = 'BASE TABLE'
        AND t.table_name <> $1
      ORDER BY t.table_name`,
    [MIGRATION_TABLE],
  );
  return res.rows.map((r) => ({
    name: r.table_name,
    estimatedRows: Number(r.est_rows),
  }));
}

/** Clamp a caller-supplied limit/offset into a safe, bounded range. */
function clampPaging(
  limit: unknown,
  offset: unknown,
): {
  limit: number;
  offset: number;
} {
  const l = Number(limit);
  const o = Number(offset);
  const safeLimit =
    Number.isFinite(l) && l > 0
      ? Math.min(Math.floor(l), MAX_LIMIT)
      : DEFAULT_LIMIT;
  const safeOffset = Number.isFinite(o) && o > 0 ? Math.floor(o) : 0;
  return { limit: safeLimit, offset: safeOffset };
}

/**
 * Read a page of rows from a table (read-only). The table name is validated and
 * quoted; LIMIT/OFFSET are bound parameters. ORDER BY 1 (the first column's
 * ordinal position — not an identifier) gives deterministic pagination without
 * embedding any caller input.
 */
export async function listRows(
  table: unknown,
  paging: { limit?: unknown; offset?: unknown } = {},
): Promise<RowPage> {
  const canonical = await validateTable(table);
  const columns = await getColumns(canonical);
  const { limit, offset } = clampPaging(paging.limit, paging.offset);
  const quoted = qualify(canonical);

  const totalRes = await query<{ count: string }>(
    `SELECT count(*)::bigint AS count FROM ${quoted}`,
  );
  const total = Number(totalRes.rows[0]?.count ?? 0);

  const rowsRes = await query(
    `SELECT * FROM ${quoted} ORDER BY 1 LIMIT $1 OFFSET $2`,
    [limit, offset],
  );

  return {
    table: canonical,
    columns,
    rows: rowsRes.rows as Record<string, unknown>[],
    total,
    limit,
    offset,
  };
}

/** Serialize a value for a column, honoring json/jsonb (stringify non-strings). */
function prepValue(value: unknown, col: ColumnMeta): unknown {
  if (value === undefined) return null;
  if (value === null) return null;
  const isJson = col.udt === "json" || col.udt === "jsonb";
  if (isJson && typeof value !== "string") return JSON.stringify(value);
  return value;
}

/** A `column = $N::type` (or `column IS NULL`) fragment plus the bound value. */
interface Predicate {
  sql: string;
  value?: unknown;
}

function buildPredicates(
  where: Record<string, unknown>,
  columns: ColumnMeta[],
  table: string,
  startIndex: number,
): { clauses: string[]; values: unknown[] } {
  const clauses: string[] = [];
  const values: unknown[] = [];
  let i = startIndex;
  for (const [name, raw] of Object.entries(where)) {
    const col = requireColumn(columns, name, table);
    const quotedCol = escapeIdentifier(col.name);
    if (raw === null) {
      clauses.push(`${quotedCol} IS NULL`);
      continue;
    }
    const castType = escapeIdentifier(col.udt);
    clauses.push(`${quotedCol} = $${i}::${castType}`);
    values.push(prepValue(raw, col));
    i += 1;
  }
  return { clauses, values };
}

/**
 * Execute an opt-in write (insert/update/delete) safely.
 *
 * Refuses unless DAAX_DB_CONSOLE_WRITES=1. Validates the table and every column;
 * binds all values as `$N::type`. UPDATE/DELETE require a non-empty WHERE (no
 * unconditional write). When the table is audited (D4), the write and a
 * forced `auth_audit` row commit together in one transaction; if the audit row
 * cannot be written, the whole transaction rolls back (fail-closed).
 *
 * @param actor identifier of the super-admin performing the write (for the audit row)
 */
export async function executeWrite(
  op: WriteOp,
  actor: string,
): Promise<WriteResult> {
  if (!writesEnabled()) {
    throw new ConsoleError(
      `DB console writes are disabled. Set ${WRITES_ENV}=1 to enable.`,
      403,
    );
  }

  const canonical = await validateTable(op.table);
  const columns = await getColumns(canonical);
  const quotedTable = qualify(canonical);
  const isAudited = auditedTables().has(canonical.toLowerCase());

  // Build the write SQL + params (identifiers validated+quoted, values bound).
  let sql: string;
  let params: unknown[] = [];

  if (op.action === "insert") {
    const values = op.values ?? {};
    const entries = Object.entries(values);
    if (entries.length === 0) {
      throw new ConsoleError("INSERT requires at least one column value.", 400);
    }
    const cols: string[] = [];
    const placeholders: string[] = [];
    entries.forEach(([name, raw], idx) => {
      const col = requireColumn(columns, name, canonical);
      cols.push(escapeIdentifier(col.name));
      placeholders.push(`$${idx + 1}::${escapeIdentifier(col.udt)}`);
      params.push(prepValue(raw, col));
    });
    sql = `INSERT INTO ${quotedTable} (${cols.join(", ")}) VALUES (${placeholders.join(", ")})`;
  } else if (op.action === "update") {
    const values = op.values ?? {};
    const where = op.where ?? {};
    const setEntries = Object.entries(values);
    if (setEntries.length === 0) {
      throw new ConsoleError(
        "UPDATE requires at least one column to set.",
        400,
      );
    }
    if (Object.keys(where).length === 0) {
      throw new ConsoleError(
        "UPDATE requires a non-empty WHERE (refusing unconditional update).",
        400,
      );
    }
    const setClauses: string[] = [];
    setEntries.forEach(([name, raw], idx) => {
      const col = requireColumn(columns, name, canonical);
      setClauses.push(
        `${escapeIdentifier(col.name)} = $${idx + 1}::${escapeIdentifier(col.udt)}`,
      );
      params.push(prepValue(raw, col));
    });
    const { clauses, values: whereVals } = buildPredicates(
      where,
      columns,
      canonical,
      params.length + 1,
    );
    params = params.concat(whereVals);
    sql = `UPDATE ${quotedTable} SET ${setClauses.join(", ")} WHERE ${clauses.join(" AND ")}`;
  } else if (op.action === "delete") {
    const where = op.where ?? {};
    if (Object.keys(where).length === 0) {
      throw new ConsoleError(
        "DELETE requires a non-empty WHERE (refusing unconditional delete).",
        400,
      );
    }
    const { clauses, values: whereVals } = buildPredicates(
      where,
      columns,
      canonical,
      1,
    );
    params = whereVals;
    sql = `DELETE FROM ${quotedTable} WHERE ${clauses.join(" AND ")}`;
  } else {
    throw new ConsoleError(`Unsupported write action: '${op.action}'.`, 400);
  }

  const client = await getClient();
  try {
    await client.query("BEGIN");

    // D4: force the audit row FIRST so a missing/unsatisfiable auth_audit table
    // aborts the transaction before the write — the write can never land
    // unaudited for an audited table.
    if (isAudited) {
      await forceAuditRow(client, {
        actor,
        action: `db_console_${op.action}`,
        targetTable: canonical,
        // Record the SUBMITTED VALUES, not just column names: an RBAC audit's
        // whole purpose is forensic — "who changed what TO WHICH value" (e.g.
        // "alice set role=superadmin"). Names alone ("changed the role column")
        // lose the key fact. The audited set is the RBAC tables (role/identity
        // assignments), and auth_audit is itself admin-restricted, so capturing
        // values here is appropriate and not a secret-leak vector.
        detail: {
          action: op.action,
          table: canonical,
          values: op.values ?? null,
          where: op.where ?? null,
        },
      });
    }

    const res = await client.query(sql, params);
    await client.query("COMMIT");
    return {
      table: canonical,
      action: op.action,
      rowsAffected: res.rowCount ?? 0,
      audited: isAudited,
    };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
