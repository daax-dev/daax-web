/**
 * Parameterised query builder for the admin DB console (F6 — issue #102).
 *
 * PURE (no DB, no Next). Every function takes an ALREADY-VALIDATED
 * {@link TableSchema} (produced by validating a user-supplied name against the
 * live catalog in `identifiers.ts`) and returns `{ text, params }` where:
 *   - identifiers are quoted via `quoteIdent` (defence-in-depth on top of the
 *     whitelist check the caller already performed), and
 *   - values are ALWAYS bound as `$N::<catalog-type>` parameters — never
 *     interpolated — so no user value can alter the SQL.
 *
 * A malformed request (unknown column, missing WHERE on update/delete) throws
 * before any SQL is produced.
 */

import {
  assertCastableType,
  assertKnownColumn,
  quoteIdent,
  quoteRelation,
  InvalidIdentifierError,
  type TableSchema,
} from "./identifiers";

/** Thrown for a structurally-invalid write request (distinct from an unknown identifier). */
export class WriteValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WriteValidationError";
  }
}

export interface BuiltQuery {
  text: string;
  params: unknown[];
}

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;
/** Upper bound on the bounded row count (keeps COUNT fast on huge tables). */
export const COUNT_CAP = 100_000;
/**
 * Upper bound on the paging offset. Keeps the bound `$N::bigint` param a safe
 * integer — an unbounded digits-only offset parses to a float (e.g. `1e+30`)
 * that node-postgres serialises in exponential notation, which Postgres
 * rejects at the bigint cast.
 */
export const MAX_OFFSET = 10_000_000;

function toInt(raw: unknown): number | null {
  if (typeof raw === "number")
    return Number.isFinite(raw) ? Math.floor(raw) : null;
  const n = Number.parseInt(String(raw ?? "").trim(), 10);
  return Number.isFinite(n) ? n : null;
}

/** Clamp a requested page size into `[1, MAX_PAGE_SIZE]`, defaulting when absent/invalid. */
export function clampLimit(raw: unknown): number {
  const n = toInt(raw);
  if (n === null || n <= 0) return DEFAULT_PAGE_SIZE;
  return Math.min(n, MAX_PAGE_SIZE);
}

/** Clamp a requested offset into `[0, MAX_OFFSET]`. */
export function clampOffset(raw: unknown): number {
  const n = toInt(raw);
  if (n === null || n <= 0) return 0;
  return Math.min(n, MAX_OFFSET);
}

export type SortDirection = "asc" | "desc";

/** Normalise a requested sort direction to a fixed whitelist (never interpolated raw). */
export function normalizeDirection(raw: unknown): SortDirection {
  return String(raw ?? "").toLowerCase() === "desc" ? "desc" : "asc";
}

export interface SelectRowsOptions {
  limit: number;
  offset: number;
  /** Optional ORDER BY column — validated against the table before use. */
  orderBy?: string | null;
  direction?: SortDirection;
}

/** `SELECT * FROM "schema"."table" [ORDER BY "col" ASC|DESC] LIMIT $1 OFFSET $2`. */
export function buildSelectRows(
  table: TableSchema,
  opts: SelectRowsOptions,
): BuiltQuery {
  const rel = quoteRelation(table);
  let orderClause = "";
  if (opts.orderBy != null && opts.orderBy !== "") {
    const col = assertKnownColumn(table, opts.orderBy);
    const dir = opts.direction === "desc" ? "DESC" : "ASC";
    orderClause = ` ORDER BY ${quoteIdent(col.name)} ${dir}`;
  }
  return {
    text: `SELECT * FROM ${rel}${orderClause} LIMIT $1::bigint OFFSET $2::bigint`,
    params: [opts.limit, opts.offset],
  };
}

/**
 * Bounded exact count: `SELECT count(*) FROM (SELECT 1 FROM rel LIMIT $1)`.
 * Exact for tables up to `cap` rows; caps out (fast) on huge tables so the
 * console never triggers a full-table COUNT.
 *
 * The inner LIMIT is `cap + 1`, NOT `cap`, so the caller can tell "EXACTLY cap
 * rows" (returns `cap` → exact, NOT capped) apart from "more than cap" (returns
 * `cap + 1` → capped). A plain `LIMIT cap` returns `cap` in BOTH cases, which
 * would wrongly mark an exact `cap`-row table as capped and show a phantom next
 * page. Callers interpret `n > cap` as capped and clamp the displayed total to
 * `cap`.
 */
export function buildBoundedCount(
  table: TableSchema,
  cap = COUNT_CAP,
): BuiltQuery {
  const rel = quoteRelation(table);
  return {
    text: `SELECT count(*)::bigint AS n FROM (SELECT 1 FROM ${rel} LIMIT $1::bigint) _capped`,
    params: [cap + 1],
  };
}

export type WriteOp = "insert" | "update" | "delete";

export interface WriteRequest {
  op: WriteOp;
  /** Column → value for insert/update. */
  values?: Record<string, unknown>;
  /** Column → value equality predicate for update/delete (REQUIRED for both). */
  where?: Record<string, unknown>;
}

/** Render one `"col" = $N::type` (or `"col" IS NULL`) predicate, advancing the param list. */
function predicate(
  table: TableSchema,
  column: string,
  value: unknown,
  params: unknown[],
): string {
  const col = assertKnownColumn(table, column);
  const ident = quoteIdent(col.name);
  if (value === null) return `${ident} IS NULL`;
  const type = assertCastableType(col.dataType);
  params.push(value);
  return `${ident} = $${params.length}::${type}`;
}

/** Build a parameterised INSERT/UPDATE/DELETE. Throws before producing SQL on any invalid input. */
export function buildWrite(table: TableSchema, req: WriteRequest): BuiltQuery {
  if (!req || typeof req !== "object") {
    throw new WriteValidationError("write request must be an object");
  }
  const rel = quoteRelation(table);

  if (req.op === "insert") {
    const values = req.values ?? {};
    const cols = Object.keys(values);
    if (cols.length === 0) {
      throw new WriteValidationError(
        "insert requires at least one column value",
      );
    }
    const params: unknown[] = [];
    const idents: string[] = [];
    const placeholders: string[] = [];
    for (const c of cols) {
      const col = assertKnownColumn(table, c);
      const type = assertCastableType(col.dataType);
      params.push(values[c]);
      idents.push(quoteIdent(col.name));
      placeholders.push(`$${params.length}::${type}`);
    }
    return {
      text: `INSERT INTO ${rel} (${idents.join(", ")}) VALUES (${placeholders.join(", ")})`,
      params,
    };
  }

  if (req.op === "update") {
    const values = req.values ?? {};
    const where = req.where ?? {};
    const setCols = Object.keys(values);
    const whereCols = Object.keys(where);
    if (setCols.length === 0) {
      throw new WriteValidationError(
        "update requires at least one column to set",
      );
    }
    if (whereCols.length === 0) {
      // Refuse an unqualified UPDATE (would rewrite every row).
      throw new WriteValidationError(
        "update requires a non-empty where clause",
      );
    }
    const params: unknown[] = [];
    const setClause = setCols.map((c) => {
      const col = assertKnownColumn(table, c);
      const type = assertCastableType(col.dataType);
      params.push(values[c]);
      return `${quoteIdent(col.name)} = $${params.length}::${type}`;
    });
    const whereClause = whereCols.map((c) =>
      predicate(table, c, where[c], params),
    );
    return {
      text: `UPDATE ${rel} SET ${setClause.join(", ")} WHERE ${whereClause.join(" AND ")}`,
      params,
    };
  }

  if (req.op === "delete") {
    const where = req.where ?? {};
    const whereCols = Object.keys(where);
    if (whereCols.length === 0) {
      // Refuse an unqualified DELETE (would empty the table).
      throw new WriteValidationError(
        "delete requires a non-empty where clause",
      );
    }
    const params: unknown[] = [];
    const whereClause = whereCols.map((c) =>
      predicate(table, c, where[c], params),
    );
    return {
      text: `DELETE FROM ${rel} WHERE ${whereClause.join(" AND ")}`,
      params,
    };
  }

  throw new WriteValidationError(
    `unsupported write op: ${JSON.stringify((req as { op?: unknown }).op)}`,
  );
}

// Re-export so route handlers can catch both rejection classes from one module.
export { InvalidIdentifierError };
