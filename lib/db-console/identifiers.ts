/**
 * Identifier validation + quoting for the admin DB console (F6 — issue #102).
 *
 * This is the SQLi-safety core, ported from `dbadmin.go`. The invariant it
 * enforces:
 *
 *   1. Every table/column name is validated against the LIVE catalog snapshot
 *      (built from `information_schema`, see `lib/db-console/console.ts`) before
 *      it is used. A name that is not present — a non-existent table, or an
 *      injection payload like `users; DROP TABLE` — is REJECTED here and never
 *      reaches SQL.
 *   2. Only after that whitelist check is a name passed through {@link quoteIdent}
 *      (the TS equivalent of `pgx.Identifier.Sanitize`) and interpolated.
 *   3. VALUES are never interpolated — callers bind them as `$N` parameters cast
 *      to the column's catalog type (`$N::type`), see `query-builder.ts`.
 *
 * This module is PURE (no DB, no Next imports) so the rejection behaviour is
 * directly unit-testable with adversarial names against a fixed catalog.
 */

/** Thrown when a supplied table/column/type name is not a known, safe identifier. */
export class InvalidIdentifierError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidIdentifierError";
  }
}

/** One column, as projected from `information_schema.columns`. */
export interface ColumnMeta {
  name: string;
  /**
   * `information_schema.columns.data_type` — a Postgres CATALOG value (never user
   * input). Used as the `$N::<type>` cast target for bound values.
   */
  dataType: string;
  isNullable: boolean;
}

/** One base table and its columns. `schema` qualifies the relation (defends against search_path surprises). */
export interface TableSchema {
  schema: string;
  name: string;
  columns: ColumnMeta[];
}

/**
 * Table name → schema. This map IS the whitelist: only relations present here
 * (i.e. discovered from `information_schema`) may be inspected or written.
 */
export type SchemaCatalog = Map<string, TableSchema>;

/**
 * Quote a Postgres identifier — the TS equivalent of `pgx.Identifier.Sanitize`:
 * wrap in double quotes and DOUBLE every embedded double-quote. A NUL byte is
 * rejected (Postgres identifiers cannot contain one, and it can truncate the
 * string in C-level handling).
 *
 * ⚠️ Quoting is DEFENCE-IN-DEPTH, not an authorization or existence check.
 * Quoting an arbitrary attacker string still yields a syntactically-valid
 * identifier — callers MUST have already validated the name against the live
 * catalog via {@link assertKnownTable} / {@link assertKnownColumn}.
 */
export function quoteIdent(raw: string): string {
  if (typeof raw !== "string" || raw.length === 0) {
    throw new InvalidIdentifierError("identifier must be a non-empty string");
  }
  if (raw.includes("\0")) {
    throw new InvalidIdentifierError("identifier contains a NUL byte");
  }
  return `"${raw.replace(/"/g, '""')}"`;
}

/** The fully-qualified, quoted relation name (`"schema"."table"`). */
export function quoteRelation(table: TableSchema): string {
  return `${quoteIdent(table.schema)}.${quoteIdent(table.name)}`;
}

/**
 * Validate `name` against the catalog whitelist and return its schema. Anything
 * not present — a non-existent table, an injected string — is REJECTED and never
 * reaches SQL.
 */
export function assertKnownTable(
  catalog: SchemaCatalog,
  name: unknown,
): TableSchema {
  if (typeof name !== "string" || name.length === 0) {
    throw new InvalidIdentifierError("table name must be a non-empty string");
  }
  const schema = catalog.get(name);
  if (!schema) {
    throw new InvalidIdentifierError(`unknown table: ${JSON.stringify(name)}`);
  }
  return schema;
}

/** Validate `name` against a table's columns and return its metadata, or REJECT. */
export function assertKnownColumn(
  table: TableSchema,
  name: unknown,
): ColumnMeta {
  if (typeof name !== "string" || name.length === 0) {
    throw new InvalidIdentifierError("column name must be a non-empty string");
  }
  const col = table.columns.find((c) => c.name === name);
  if (!col) {
    throw new InvalidIdentifierError(
      `unknown column ${JSON.stringify(name)} on table ${JSON.stringify(table.name)}`,
    );
  }
  return col;
}

/**
 * Conservative allow-shape for a catalog `data_type` used as a `$N::<type>` cast
 * target. Base types (`text`, `boolean`, `bigint`, `timestamp with time zone`,
 * `character varying`, `double precision`, …) are lowercase words + spaces.
 * Anything with punctuation — `USER-DEFINED` (enums/domains), parenthesised or
 * array types — is rejected, so an exotic/uncastable type is never interpolated.
 * The value is already catalog-sourced; this is belt-and-suspenders.
 */
const CATALOG_TYPE_RE = /^[a-z][a-z ]*$/;

/** Validate a catalog data_type is safe to interpolate as a cast target, or REJECT. */
export function assertCastableType(dataType: string): string {
  if (typeof dataType !== "string" || !CATALOG_TYPE_RE.test(dataType)) {
    throw new InvalidIdentifierError(
      `uncastable column type: ${JSON.stringify(dataType)}`,
    );
  }
  return dataType;
}
