import "server-only";
import { escapeIdentifier } from "pg";
import type { PoolClient } from "pg";

import { ConsoleError } from "@/lib/db/console-error";

/**
 * Forced audit-row writer for the admin DB console (brain2daax F6/D4, #102).
 *
 * D4 invariant: a raw write to an audited (RBAC) table MUST force an `auth_audit`
 * row. The generic CRUD path bypasses app-code auditing otherwise, so the audit
 * is enforced HERE, inside the caller's transaction. If a satisfactory audit row
 * cannot be written, this THROWS — the caller rolls back, so the write is
 * refused (fail-closed).
 *
 * `auth_audit` is owned by F5 (#101), which is not yet merged. Rather than
 * hard-code F5's (not-yet-final) column names, this introspects `auth_audit`'s
 * actual columns and maps a small set of semantic fields onto whatever exists,
 * via candidate name lists. This is forward-compatible: when F5 lands the table,
 * the audit row is written; until then (table absent), every audited write is
 * refused — which is the correct fail-closed posture.
 */

export interface AuditEntry {
  /** Identifier of the super-admin performing the write. */
  actor: string;
  /** Action verb, e.g. "db_console_update". */
  action: string;
  /** The table being written. */
  targetTable: string;
  /** Structured context (stored into a json/jsonb/text detail column if present). */
  detail: Record<string, unknown>;
}

interface AuditColumn {
  name: string;
  udt: string;
  nullable: boolean;
  hasDefault: boolean;
}

// Semantic field → candidate column names (first present wins). Lower-cased.
const ACTOR_COLUMNS = [
  "actor",
  "actor_email",
  "actor_username",
  "user_email",
  "username",
  "user_id",
  "principal",
  "created_by",
  "subject",
];
const ACTION_COLUMNS = ["action", "event", "operation", "activity", "kind"];
const TARGET_COLUMNS = [
  "target",
  "target_table",
  "resource",
  "table_name",
  "object",
  "entity",
];
const DETAIL_COLUMNS = [
  "detail",
  "details",
  "metadata",
  "payload",
  "data",
  "context",
];
const TIMESTAMP_COLUMNS = [
  "created_at",
  "timestamp",
  "occurred_at",
  "logged_at",
  "ts",
  "at",
];

async function getAuditColumns(client: PoolClient): Promise<AuditColumn[]> {
  const res = await client.query<{
    column_name: string;
    udt_name: string;
    is_nullable: string;
    column_default: string | null;
  }>(
    `SELECT column_name, udt_name, is_nullable, column_default
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'auth_audit'
      ORDER BY ordinal_position`,
  );
  return res.rows.map((r) => ({
    name: r.column_name,
    udt: r.udt_name,
    nullable: r.is_nullable === "YES",
    hasDefault: r.column_default !== null,
  }));
}

/** First column whose (lower-cased) name is in `candidates`, else undefined. */
function pick(
  columns: AuditColumn[],
  candidates: string[],
): AuditColumn | undefined {
  const set = new Set(candidates);
  return columns.find((c) => set.has(c.name.toLowerCase()));
}

/** Serialize a value for a target column (stringify objects for json/text). */
function prep(value: unknown): unknown {
  if (value == null) return null;
  if (typeof value === "string") return value;
  // json/jsonb and text-family columns all accept a JSON string.
  return JSON.stringify(value);
}

/**
 * Insert a forced audit row using the caller's transaction client. Throws
 * ConsoleError when `auth_audit` is absent, or when a NOT NULL column without a
 * default cannot be satisfied from the entry (fail-closed).
 */
export async function forceAuditRow(
  client: PoolClient,
  entry: AuditEntry,
): Promise<void> {
  const columns = await getAuditColumns(client);
  if (columns.length === 0) {
    throw new ConsoleError(
      "Refusing audited write: the auth_audit table is absent, so the write " +
        "cannot be audited (fail-closed). This lands with F5 (#101).",
      409,
    );
  }

  // Plan column → bound value, and column → raw SQL expression (e.g. now()).
  const boundCols: string[] = [];
  const boundVals: unknown[] = [];
  const exprCols: string[] = [];
  const exprSql: string[] = [];
  const planned = new Set<string>();

  const assign = (col: AuditColumn | undefined, value: unknown) => {
    if (!col || planned.has(col.name)) return;
    boundCols.push(col.name);
    boundVals.push(prep(value));
    planned.add(col.name);
  };

  // The ACTOR is the load-bearing audit field: an audit row that records THAT an
  // RBAC change happened but not WHO is worthless for accountability. Require an
  // actor column to map, else fail closed (the write is refused & rolled back).
  const actorCol = pick(columns, ACTOR_COLUMNS);
  if (!actorCol) {
    throw new ConsoleError(
      "Refusing audited write: auth_audit has no column that maps to the actor " +
        "(who performed the write). Cannot record accountability — extend the " +
        "actor candidate mapping or add an actor column.",
      409,
    );
  }

  assign(actorCol, entry.actor);
  assign(pick(columns, ACTION_COLUMNS), entry.action);
  assign(pick(columns, TARGET_COLUMNS), entry.targetTable);
  assign(pick(columns, DETAIL_COLUMNS), entry.detail);

  // A NOT NULL timestamp column without a default gets now().
  const tsCol = pick(columns, TIMESTAMP_COLUMNS);
  if (tsCol && !tsCol.hasDefault && !planned.has(tsCol.name)) {
    exprCols.push(tsCol.name);
    exprSql.push("now()");
    planned.add(tsCol.name);
  }

  // Fail closed if any NOT NULL, no-default column remains unsatisfied: writing
  // an audit row that violates the schema would abort the txn anyway, but an
  // explicit error names the offending column.
  const unsatisfied = columns.filter(
    (c) => !c.nullable && !c.hasDefault && !planned.has(c.name),
  );
  if (unsatisfied.length > 0) {
    throw new ConsoleError(
      "Refusing audited write: cannot populate required auth_audit column(s) " +
        `[${unsatisfied.map((c) => c.name).join(", ")}] — the F6 audit mapping ` +
        "does not cover them. Configure auth_audit to match, or extend the mapping.",
      409,
    );
  }

  if (boundCols.length === 0 && exprCols.length === 0) {
    throw new ConsoleError(
      "Refusing audited write: no auth_audit column matched the audit fields " +
        "(actor/action/target/detail). Cannot prove the write was audited.",
      409,
    );
  }

  const allCols = [...boundCols, ...exprCols].map((c) => escapeIdentifier(c));
  const placeholders = [...boundVals.map((_, i) => `$${i + 1}`), ...exprSql];
  // Schema-qualify the audit target too, so a hostile search_path cannot divert
  // the forced audit row to a same-named table in another schema.
  await client.query(
    `INSERT INTO "public"."auth_audit" (${allCols.join(", ")}) VALUES (${placeholders.join(", ")})`,
    boundVals,
  );
}
