/**
 * Release management - Database Operations (Postgres)
 *
 * brain2daax Phase 0 (#93): ported from SQLite (better-sqlite3) to the shared
 * `pg` pool (`lib/db/pg.ts`). Schema lives in `migrations/` (node-pg-migrate).
 * All operations are async.
 *
 * JSON columns (`feature_config`, `sbom`, `sub_features`) are `jsonb`. The
 * public `Release`/`FeatureSnapshot` types expose these as JSON *strings*
 * (callers `JSON.parse` them), so writes `JSON.stringify` into jsonb and reads
 * `JSON.stringify` the parsed jsonb back to a string. timestamptz comes back as
 * a string (pg's default); reads normalise to ISO-8601 via `iso()`.
 */

import path from "path";
import fs from "fs";
import { query } from "@/lib/db/pg";

const DATA_DIR = path.join(process.cwd(), "data");

type Row = Record<string, unknown>;

/**
 * Normalise a timestamptz value to an ISO-8601 string. pg returns timestamptz
 * as a string by default; convert it (or a `Date`) to a consistent ISO string.
 */
function iso(v: unknown): string | undefined {
  if (v == null) return undefined;
  if (v instanceof Date) return v.toISOString();
  return new Date(v as string).toISOString();
}

/** Render a jsonb value (parsed by pg) back to a JSON string for the public type. */
function jsonStr(v: unknown): string | undefined {
  if (v == null) return undefined;
  return typeof v === "string" ? v : JSON.stringify(v);
}

// Types
export interface Release {
  id: string;
  name: string;
  description?: string;
  version: string;
  image_name: string;
  image_tag: string;
  created_at: string;
  built_at?: string;
  build_status: "pending" | "building" | "success" | "failed";
  build_log?: string;
  feature_config: string; // JSON
  sbom?: string; // JSON
  notes?: string;
}

export interface ReleaseShare {
  id: number;
  release_id: string;
  share_type: "github" | "email" | "phone";
  share_value: string;
  shared_at: string;
}

export interface FeatureSnapshot {
  id: number;
  release_id: string;
  plugin_id: string;
  plugin_name: string;
  maturity: string;
  sub_features?: string; // JSON
}

export interface CreateReleaseInput {
  name: string;
  description?: string;
  version: string;
  image_name: string;
  image_tag: string;
  feature_config: object;
  notes?: string;
}

// Generate unique ID
function generateId(): string {
  return `rel_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function mapRelease(row: Row): Release {
  return {
    id: row.id as string,
    name: row.name as string,
    description: (row.description as string) ?? undefined,
    version: row.version as string,
    image_name: row.image_name as string,
    image_tag: row.image_tag as string,
    created_at: iso(row.created_at) as string,
    built_at: iso(row.built_at),
    build_status: row.build_status as Release["build_status"],
    build_log: (row.build_log as string) ?? undefined,
    // feature_config is NOT NULL and required; fall back to "{}" so a stray
    // jsonb `null` (which pg returns as JS null) never yields an invalid Release.
    feature_config: jsonStr(row.feature_config) ?? "{}",
    sbom: jsonStr(row.sbom),
    notes: (row.notes as string) ?? undefined,
  };
}

function mapShare(row: Row): ReleaseShare {
  return {
    id: Number(row.id),
    release_id: row.release_id as string,
    share_type: row.share_type as ReleaseShare["share_type"],
    share_value: row.share_value as string,
    shared_at: iso(row.shared_at) as string,
  };
}

function mapSnapshot(row: Row): FeatureSnapshot {
  return {
    id: Number(row.id),
    release_id: row.release_id as string,
    plugin_id: row.plugin_id as string,
    plugin_name: row.plugin_name as string,
    maturity: row.maturity as string,
    sub_features: jsonStr(row.sub_features),
  };
}

// Columns updateRelease is allowed to set (whitelist; excludes id/created_at).
const UPDATABLE_COLUMNS = new Set([
  "name",
  "description",
  "version",
  "image_name",
  "image_tag",
  "built_at",
  "build_status",
  "build_log",
  "feature_config",
  "sbom",
  "notes",
]);
const JSONB_COLUMNS = new Set(["feature_config", "sbom"]);

// CRUD Operations
export async function createRelease(
  input: CreateReleaseInput,
): Promise<Release> {
  const id = generateId();
  await query(
    `INSERT INTO releases (id, name, description, version, image_name, image_tag, feature_config, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      id,
      input.name,
      input.description || null,
      input.version,
      input.image_name,
      input.image_tag,
      JSON.stringify(input.feature_config),
      input.notes || null,
    ],
  );
  return (await getRelease(id))!;
}

export async function getRelease(id: string): Promise<Release | null> {
  const row = (await query("SELECT * FROM releases WHERE id = $1", [id]))
    .rows[0];
  return row ? mapRelease(row) : null;
}

export async function listReleases(): Promise<Release[]> {
  const res = await query("SELECT * FROM releases ORDER BY created_at DESC");
  return res.rows.map(mapRelease);
}

export async function updateRelease(
  id: string,
  updates: Partial<Release>,
): Promise<Release | null> {
  const current = await getRelease(id);
  if (!current) return null;

  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  for (const [key, value] of Object.entries(updates)) {
    if (!UPDATABLE_COLUMNS.has(key)) continue;
    fields.push(`${key} = $${i++}`);
    if (JSONB_COLUMNS.has(key)) {
      // feature_config/sbom are exposed as JSON *strings* (and callers — e.g. the
      // build route — pass pre-stringified JSON). A string is already JSON, which
      // Postgres assignment-casts text→jsonb; only stringify a non-string. (Double
      // stringifying a string would store a JSON-string-wrapping-JSON in jsonb.)
      // A null value becomes jsonb `null` ("null"), NOT SQL NULL — matching the
      // legacy SQLite behavior and keeping the NOT NULL `feature_config` valid.
      values.push(typeof value === "string" ? value : JSON.stringify(value));
    } else {
      values.push(value);
    }
  }

  if (fields.length > 0) {
    values.push(id);
    await query(
      `UPDATE releases SET ${fields.join(", ")} WHERE id = $${i}`,
      values,
    );
  }

  return getRelease(id);
}

export async function deleteRelease(id: string): Promise<boolean> {
  const result = await query("DELETE FROM releases WHERE id = $1", [id]);
  return (result.rowCount ?? 0) > 0;
}

// Share management
export async function addReleaseShare(
  releaseId: string,
  shareType: "github" | "email" | "phone",
  shareValue: string,
): Promise<ReleaseShare | null> {
  try {
    const res = await query(
      `INSERT INTO release_shares (release_id, share_type, share_value)
       VALUES ($1,$2,$3) RETURNING *`,
      [releaseId, shareType, shareValue],
    );
    return res.rows[0] ? mapShare(res.rows[0]) : null;
  } catch (err) {
    // Only swallow the EXPECTED constraint violations (duplicate share /
    // missing release): unique_violation (23505), foreign_key_violation (23503).
    // Rethrow anything else (connectivity, permissions, …) so it isn't hidden.
    const code = (err as { code?: string })?.code;
    if (code === "23505" || code === "23503") return null;
    throw err;
  }
}

export async function getReleaseShares(
  releaseId: string,
): Promise<ReleaseShare[]> {
  const res = await query(
    "SELECT * FROM release_shares WHERE release_id = $1 ORDER BY shared_at DESC",
    [releaseId],
  );
  return res.rows.map(mapShare);
}

export async function removeReleaseShare(id: number): Promise<boolean> {
  const result = await query("DELETE FROM release_shares WHERE id = $1", [id]);
  return (result.rowCount ?? 0) > 0;
}

// Feature snapshots for audit
export async function saveFeatureSnapshot(
  releaseId: string,
  pluginId: string,
  pluginName: string,
  maturity: string,
  subFeatures?: object,
): Promise<void> {
  await query(
    `INSERT INTO feature_snapshots (release_id, plugin_id, plugin_name, maturity, sub_features)
     VALUES ($1,$2,$3,$4,$5)`,
    [
      releaseId,
      pluginId,
      pluginName,
      maturity,
      subFeatures ? JSON.stringify(subFeatures) : null,
    ],
  );
}

export async function getFeatureSnapshots(
  releaseId: string,
): Promise<FeatureSnapshot[]> {
  const res = await query(
    "SELECT * FROM feature_snapshots WHERE release_id = $1 ORDER BY plugin_id",
    [releaseId],
  );
  return res.rows.map(mapSnapshot);
}

/**
 * Logical backup of the releases data (Postgres analog of the old SQLite file
 * copy): exports the releases tables to a timestamped JSON file under
 * data/backups and returns its path. Engine-level pg_dump/snapshot policy is
 * tracked separately (brain2daax §4, #103).
 */
export async function backupDatabase(): Promise<string> {
  const backupDir = path.join(DATA_DIR, "backups");
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const [releases, shares, snapshots] = await Promise.all([
    query("SELECT * FROM releases ORDER BY created_at"),
    query("SELECT * FROM release_shares ORDER BY id"),
    query("SELECT * FROM feature_snapshots ORDER BY id"),
  ]);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(backupDir, `releases-${timestamp}.json`);
  fs.writeFileSync(
    backupPath,
    JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        engine: "postgres",
        tables: {
          releases: releases.rows,
          release_shares: shares.rows,
          feature_snapshots: snapshots.rows,
        },
      },
      null,
      2,
    ),
  );
  return backupPath;
}

// Close the shared pool (for graceful shutdown).
export { closePool as closeDatabase } from "@/lib/db/pg";
