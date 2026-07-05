/**
 * Admin DB console — server-side data layer (F6 — issue #102).
 *
 * The impure half of the console: it loads the catalog whitelist from
 * `information_schema`, then delegates ALL identifier validation and SQL
 * construction to the pure `identifiers.ts` / `query-builder.ts` modules. No
 * user-supplied identifier is ever interpolated here without first being
 * validated against {@link loadSchemaCatalog}.
 *
 * Writes go through {@link executeWrite}, which forces an `auth_audit` row in the
 * SAME transaction as the mutation (D4): if the audit insert fails, the whole
 * write rolls back, so a raw write can never bypass the audit trail.
 */

import "server-only";

import { getClient, query } from "@/lib/db/pg";
import {
  assertKnownTable,
  type ColumnMeta,
  type SchemaCatalog,
} from "./identifiers";
import {
  buildBoundedCount,
  buildSelectRows,
  buildWrite,
  clampLimit,
  clampOffset,
  normalizeDirection,
  COUNT_CAP,
  type WriteOp,
  type WriteRequest,
} from "./query-builder";

/**
 * Build the catalog whitelist from `information_schema`: every base table in the
 * `public` schema and its columns. Views and other schemas are excluded. This is
 * the authoritative set of relations the console may touch — a name absent here
 * is rejected by {@link assertKnownTable}.
 */
export async function loadSchemaCatalog(): Promise<SchemaCatalog> {
  const res = await query<{
    table_schema: string;
    table_name: string;
    column_name: string;
    data_type: string;
    is_nullable: string;
  }>(
    `SELECT c.table_schema, c.table_name, c.column_name, c.data_type, c.is_nullable
       FROM information_schema.columns c
       JOIN information_schema.tables t
         ON t.table_schema = c.table_schema AND t.table_name = c.table_name
      WHERE c.table_schema = 'public'
        AND t.table_type = 'BASE TABLE'
      ORDER BY c.table_name, c.ordinal_position`,
  );
  const catalog: SchemaCatalog = new Map();
  for (const row of res.rows) {
    let ts = catalog.get(row.table_name);
    if (!ts) {
      ts = { schema: row.table_schema, name: row.table_name, columns: [] };
      catalog.set(row.table_name, ts);
    }
    ts.columns.push({
      name: row.column_name,
      dataType: row.data_type,
      isNullable: row.is_nullable === "YES",
    });
  }
  return catalog;
}

export interface TableListItem {
  name: string;
  columns: number;
  /** Planner row estimate (`pg_class.reltuples`), fast and approximate. */
  estimatedRows: number;
}

/** List every inspectable table with its column count and an approximate row count. */
export async function listTables(): Promise<TableListItem[]> {
  const catalog = await loadSchemaCatalog();
  // Single fast query for approximate counts across all public tables.
  const est = await query<{ name: string; estimate: string }>(
    `SELECT c.relname AS name, c.reltuples::bigint AS estimate
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'`,
  );
  const estMap = new Map(
    est.rows.map((r) => [r.name, Math.max(0, Number(r.estimate) || 0)]),
  );
  return [...catalog.values()]
    .map((t) => ({
      name: t.name,
      columns: t.columns.length,
      estimatedRows: estMap.get(t.name) ?? 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface InspectOptions {
  limit?: unknown;
  offset?: unknown;
  orderBy?: string | null;
  direction?: unknown;
}

export interface InspectResult {
  table: string;
  columns: ColumnMeta[];
  rows: Record<string, unknown>[];
  /** Bounded exact row count; `true` when it hit {@link COUNT_CAP}. */
  total: number;
  totalCapped: boolean;
  limit: number;
  offset: number;
}

/**
 * Read a page of rows from a table. The name is validated against the live
 * catalog (rejected if unknown) before any SQL runs; pagination is clamped so a
 * client cannot request an unbounded scan.
 */
export async function inspectTable(
  name: string,
  opts: InspectOptions,
): Promise<InspectResult> {
  const catalog = await loadSchemaCatalog();
  const table = assertKnownTable(catalog, name); // throws InvalidIdentifierError on unknown

  const limit = clampLimit(opts.limit);
  const offset = clampOffset(opts.offset);
  const direction = normalizeDirection(opts.direction);
  const select = buildSelectRows(table, {
    limit,
    offset,
    orderBy: opts.orderBy ?? null,
    direction,
  });
  const count = buildBoundedCount(table, COUNT_CAP);

  const [rowsRes, countRes] = await Promise.all([
    query<Record<string, unknown>>(select.text, select.params),
    query<{ n: string }>(count.text, count.params),
  ]);
  const total = Number(countRes.rows[0]?.n ?? 0);
  return {
    table: table.name,
    columns: table.columns,
    rows: rowsRes.rows,
    total,
    totalCapped: total >= COUNT_CAP,
    limit,
    offset,
  };
}

/** Audit context threaded into the forced `auth_audit` row for a write. */
export interface WriteAuditContext {
  subject: string | null;
  route: string;
  ip: string | null;
  ua: string | null;
}

export interface WriteResult {
  op: WriteOp;
  table: string;
  rowCount: number;
}

/**
 * Execute a validated write inside a single transaction that ALSO writes an
 * `auth_audit` row (D4). The mutation and the audit insert commit together — if
 * the audit insert throws, the whole transaction rolls back and the write fails.
 * This makes it impossible for a raw console write (to any table, including the
 * RBAC tables) to escape the audit log.
 *
 * The table name and every column are validated against the live catalog before
 * SQL is built; values are bound as `$N::type` parameters.
 */
export async function executeWrite(
  name: string,
  req: WriteRequest,
  audit: WriteAuditContext,
): Promise<WriteResult> {
  const catalog = await loadSchemaCatalog();
  const table = assertKnownTable(catalog, name); // reject unknown table
  const built = buildWrite(table, req); // reject unknown columns / bad shape

  const client = await getClient();
  try {
    await client.query("BEGIN");
    const res = await client.query(built.text, built.params);
    // FORCED audit row in the SAME transaction (D4). A failure here rolls back
    // the mutation above — the write cannot outlive a failed audit.
    await client.query(
      `INSERT INTO auth_audit (event, subject, permission, route, ip, ua, outcome, detail)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        "db-console-write",
        audit.subject,
        "admin:db:write",
        audit.route,
        audit.ip,
        audit.ua,
        "allow",
        JSON.stringify({
          op: req.op,
          table: table.name,
          rowCount: res.rowCount ?? 0,
        }),
      ],
    );
    await client.query("COMMIT");
    return { op: req.op, table: table.name, rowCount: res.rowCount ?? 0 };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore rollback error — original error is the meaningful one */
    }
    throw err;
  } finally {
    client.release();
  }
}
