// SQLite database for release management
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

// Database location
const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "releases.db");

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize database connection
let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    initSchema();
  }
  return db;
}

// Initialize database schema
function initSchema() {
  const database = getDb();

  // Releases table
  database
    .prepare(
      `
    CREATE TABLE IF NOT EXISTS releases (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      version TEXT NOT NULL,
      image_name TEXT NOT NULL,
      image_tag TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      built_at TEXT,
      build_status TEXT DEFAULT 'pending',
      build_log TEXT,
      feature_config TEXT NOT NULL,
      sbom TEXT,
      notes TEXT
    )
  `,
    )
    .run();

  // Shared users table
  database
    .prepare(
      `
    CREATE TABLE IF NOT EXISTS release_shares (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      release_id TEXT NOT NULL,
      share_type TEXT NOT NULL,
      share_value TEXT NOT NULL,
      shared_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (release_id) REFERENCES releases(id) ON DELETE CASCADE,
      UNIQUE(release_id, share_type, share_value)
    )
  `,
    )
    .run();

  // Feature snapshots for audit
  database
    .prepare(
      `
    CREATE TABLE IF NOT EXISTS feature_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      release_id TEXT NOT NULL,
      plugin_id TEXT NOT NULL,
      plugin_name TEXT NOT NULL,
      maturity TEXT NOT NULL,
      sub_features TEXT,
      FOREIGN KEY (release_id) REFERENCES releases(id) ON DELETE CASCADE
    )
  `,
    )
    .run();
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

// CRUD Operations
export function createRelease(input: CreateReleaseInput): Release {
  const database = getDb();
  const id = generateId();

  const stmt = database.prepare(`
    INSERT INTO releases (id, name, description, version, image_name, image_tag, feature_config, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id,
    input.name,
    input.description || null,
    input.version,
    input.image_name,
    input.image_tag,
    JSON.stringify(input.feature_config),
    input.notes || null,
  );

  return getRelease(id)!;
}

export function getRelease(id: string): Release | null {
  const database = getDb();
  const stmt = database.prepare("SELECT * FROM releases WHERE id = ?");
  const row = stmt.get(id) as Release | undefined;
  return row || null;
}

export function listReleases(): Release[] {
  const database = getDb();
  const stmt = database.prepare(
    "SELECT * FROM releases ORDER BY created_at DESC",
  );
  return stmt.all() as Release[];
}

export function updateRelease(
  id: string,
  updates: Partial<Release>,
): Release | null {
  const database = getDb();
  const current = getRelease(id);
  if (!current) return null;

  const fields: string[] = [];
  const values: unknown[] = [];

  for (const [key, value] of Object.entries(updates)) {
    if (key !== "id" && key !== "created_at") {
      fields.push(`${key} = ?`);
      values.push(typeof value === "object" ? JSON.stringify(value) : value);
    }
  }

  if (fields.length > 0) {
    values.push(id);
    const stmt = database.prepare(
      `UPDATE releases SET ${fields.join(", ")} WHERE id = ?`,
    );
    stmt.run(...values);
  }

  return getRelease(id);
}

export function deleteRelease(id: string): boolean {
  const database = getDb();
  const stmt = database.prepare("DELETE FROM releases WHERE id = ?");
  const result = stmt.run(id);
  return result.changes > 0;
}

// Share management
export function addReleaseShare(
  releaseId: string,
  shareType: "github" | "email" | "phone",
  shareValue: string,
): ReleaseShare | null {
  const database = getDb();
  try {
    const stmt = database.prepare(`
      INSERT INTO release_shares (release_id, share_type, share_value)
      VALUES (?, ?, ?)
    `);
    const result = stmt.run(releaseId, shareType, shareValue);

    const selectStmt = database.prepare(
      "SELECT * FROM release_shares WHERE id = ?",
    );
    return selectStmt.get(result.lastInsertRowid) as ReleaseShare;
  } catch {
    return null; // Duplicate or foreign key error
  }
}

export function getReleaseShares(releaseId: string): ReleaseShare[] {
  const database = getDb();
  const stmt = database.prepare(
    "SELECT * FROM release_shares WHERE release_id = ? ORDER BY shared_at DESC",
  );
  return stmt.all(releaseId) as ReleaseShare[];
}

export function removeReleaseShare(id: number): boolean {
  const database = getDb();
  const stmt = database.prepare("DELETE FROM release_shares WHERE id = ?");
  const result = stmt.run(id);
  return result.changes > 0;
}

// Feature snapshots for audit
export function saveFeatureSnapshot(
  releaseId: string,
  pluginId: string,
  pluginName: string,
  maturity: string,
  subFeatures?: object,
): void {
  const database = getDb();
  const stmt = database.prepare(`
    INSERT INTO feature_snapshots (release_id, plugin_id, plugin_name, maturity, sub_features)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(
    releaseId,
    pluginId,
    pluginName,
    maturity,
    subFeatures ? JSON.stringify(subFeatures) : null,
  );
}

export function getFeatureSnapshots(releaseId: string): FeatureSnapshot[] {
  const database = getDb();
  const stmt = database.prepare(
    "SELECT * FROM feature_snapshots WHERE release_id = ? ORDER BY plugin_id",
  );
  return stmt.all(releaseId) as FeatureSnapshot[];
}

// Backup database
export function backupDatabase(): string {
  const database = getDb();
  const backupDir = path.join(DATA_DIR, "backups");
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(backupDir, `releases-${timestamp}.db`);

  database.backup(backupPath);
  return backupPath;
}

// Close database (for graceful shutdown)
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}
