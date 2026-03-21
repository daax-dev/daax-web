/**
 * Daax Image Catalog - Database Operations
 *
 * SQLite database for storing catalog metadata, build specs, and jobs.
 */

import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import {
  BaseImage,
  Feature,
  BuildSpec,
  BuildJob,
  BuiltImage,
  DEFAULT_BASE_IMAGES,
  DEFAULT_FEATURES,
} from "@/types/catalog";

// Database path
const DB_PATH =
  process.env.CATALOG_DB_PATH || path.join(process.cwd(), "data", "catalog.db");

// Singleton database instance
let db: Database.Database | null = null;

/**
 * Get or create the database connection
 */
export function getDb(): Database.Database {
  if (!db) {
    // Ensure data directory exists
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    initializeSchema(db);
  }
  return db;
}

/**
 * Initialize the database schema
 */
function initializeSchema(database: Database.Database): void {
  database.exec(`
    -- Base images catalog
    CREATE TABLE IF NOT EXISTS bases (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      registry TEXT NOT NULL,
      repository TEXT NOT NULL,
      category TEXT NOT NULL CHECK (category IN ('os', 'runtime')),
      architecture_json TEXT NOT NULL,
      icon TEXT,
      color TEXT,
      security_profile_json TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_synced_at TIMESTAMP
    );

    -- Base image versions
    CREATE TABLE IF NOT EXISTS base_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      base_id TEXT NOT NULL REFERENCES bases(id) ON DELETE CASCADE,
      tag TEXT NOT NULL,
      digest TEXT NOT NULL,
      size INTEGER,
      created TEXT,
      vulnerabilities_json TEXT,
      UNIQUE(base_id, tag)
    );

    -- Features catalog
    CREATE TABLE IF NOT EXISTS features (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      documentation_url TEXT,
      registry TEXT NOT NULL,
      repository TEXT NOT NULL,
      category TEXT NOT NULL,
      tags_json TEXT,
      options_json TEXT,
      dependencies_json TEXT,
      conflicts_json TEXT,
      compatible_bases_json TEXT,
      incompatible_bases_json TEXT,
      icon TEXT,
      install_time TEXT CHECK (install_time IN ('fast', 'medium', 'slow')),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Feature versions
    CREATE TABLE IF NOT EXISTS feature_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      feature_id TEXT NOT NULL REFERENCES features(id) ON DELETE CASCADE,
      tag TEXT NOT NULL,
      digest TEXT NOT NULL,
      release_date TEXT,
      changelog TEXT,
      UNIQUE(feature_id, tag)
    );

    -- Build specifications
    CREATE TABLE IF NOT EXISTS build_specs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      base_json TEXT NOT NULL,
      features_json TEXT NOT NULL,
      customizations_json TEXT,
      output_json TEXT NOT NULL,
      created_by TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Build jobs
    CREATE TABLE IF NOT EXISTS build_jobs (
      id TEXT PRIMARY KEY,
      spec_id TEXT NOT NULL REFERENCES build_specs(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'queued',
      progress_json TEXT,
      result_json TEXT,
      error_json TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      started_at TIMESTAMP,
      completed_at TIMESTAMP
    );

    -- Built images (local registry cache)
    CREATE TABLE IF NOT EXISTS built_images (
      digest TEXT PRIMARY KEY,
      spec_id TEXT REFERENCES build_specs(id),
      job_id TEXT REFERENCES build_jobs(id),
      tags_json TEXT NOT NULL,
      size INTEGER,
      layers INTEGER,
      vulnerabilities_json TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_scanned_at TIMESTAMP
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_base_versions_base ON base_versions(base_id);
    CREATE INDEX IF NOT EXISTS idx_feature_versions_feature ON feature_versions(feature_id);
    CREATE INDEX IF NOT EXISTS idx_build_jobs_spec ON build_jobs(spec_id);
    CREATE INDEX IF NOT EXISTS idx_build_jobs_status ON build_jobs(status);
    CREATE INDEX IF NOT EXISTS idx_built_images_spec ON built_images(spec_id);
  `);

  // Seed default data if tables are empty
  seedDefaultData(database);
}

/**
 * Seed default base images and features
 */
function seedDefaultData(database: Database.Database): void {
  const baseCount = database
    .prepare("SELECT COUNT(*) as count FROM bases")
    .get() as { count: number };
  const featureCount = database
    .prepare("SELECT COUNT(*) as count FROM features")
    .get() as { count: number };

  const now = new Date().toISOString();

  // Seed base images
  if (baseCount.count === 0) {
    const insertBase = database.prepare(`
      INSERT INTO bases (id, name, description, registry, repository, category, architecture_json, icon, color, security_profile_json, created_at, updated_at, last_synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertVersion = database.prepare(`
      INSERT INTO base_versions (base_id, tag, digest, size, created)
      VALUES (?, ?, ?, ?, ?)
    `);

    for (const base of DEFAULT_BASE_IMAGES) {
      insertBase.run(
        base.id,
        base.name,
        base.description,
        base.registry,
        base.repository,
        base.category,
        JSON.stringify(base.architecture),
        base.icon,
        base.color,
        JSON.stringify({ ...base.securityProfile, lastScanned: now }),
        now,
        now,
        now,
      );

      // Add default versions
      insertVersion.run(
        base.id,
        "latest",
        `sha256:${generateFakeDigest()}`,
        getDefaultSize(base.id),
        now,
      );
    }
  }

  // Seed features
  if (featureCount.count === 0) {
    const insertFeature = database.prepare(`
      INSERT INTO features (id, name, description, documentation_url, registry, repository, category, tags_json, options_json, dependencies_json, conflicts_json, compatible_bases_json, incompatible_bases_json, icon, install_time, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertVersion = database.prepare(`
      INSERT INTO feature_versions (feature_id, tag, digest, release_date)
      VALUES (?, ?, ?, ?)
    `);

    for (const feature of DEFAULT_FEATURES) {
      insertFeature.run(
        feature.id,
        feature.name,
        feature.description,
        feature.documentationUrl || null,
        feature.registry,
        feature.repository,
        feature.category,
        JSON.stringify(feature.tags),
        JSON.stringify(feature.options),
        JSON.stringify(feature.dependencies || []),
        JSON.stringify(feature.conflicts || []),
        JSON.stringify(feature.compatibleBases || []),
        JSON.stringify(feature.incompatibleBases || []),
        feature.icon,
        feature.installTime,
        now,
        now,
      );

      // Add default version
      insertVersion.run(
        feature.id,
        "latest",
        `sha256:${generateFakeDigest()}`,
        now,
      );
    }
  }
}

function generateFakeDigest(): string {
  return Array.from({ length: 64 }, () =>
    Math.floor(Math.random() * 16).toString(16),
  ).join("");
}

function getDefaultSize(baseId: string): number {
  const sizes: Record<string, number> = {
    "debian-base": 45_000_000,
    "alpine-base": 8_000_000,
    busybox: 2_000_000,
    golang: 800_000_000,
    python: 150_000_000,
    rust: 1_200_000_000,
    azul: 300_000_000,
    bun: 150_000_000,
  };
  return sizes[baseId] || 100_000_000;
}

// ============================================================================
// Base Image Operations
// ============================================================================

export function getAllBases(): BaseImage[] {
  const database = getDb();
  const bases = database
    .prepare("SELECT * FROM bases ORDER BY category, name")
    .all() as Record<string, unknown>[];

  return bases.map((row) => {
    const versions = database
      .prepare("SELECT * FROM base_versions WHERE base_id = ? ORDER BY tag")
      .all(row.id) as Record<string, unknown>[];

    return {
      id: row.id as string,
      name: row.name as string,
      description: row.description as string,
      registry: row.registry as string,
      repository: row.repository as string,
      category: row.category as "os" | "runtime",
      architecture: JSON.parse(row.architecture_json as string),
      securityProfile: JSON.parse(row.security_profile_json as string),
      icon: row.icon as string,
      color: row.color as string,
      versions: versions.map((v) => ({
        tag: v.tag as string,
        digest: v.digest as string,
        size: v.size as number,
        created: v.created as string,
        vulnerabilities: v.vulnerabilities_json
          ? JSON.parse(v.vulnerabilities_json as string)
          : undefined,
      })),
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
      lastSyncedAt: row.last_synced_at as string,
    };
  });
}

export function getBaseById(id: string): BaseImage | null {
  const database = getDb();
  const row = database.prepare("SELECT * FROM bases WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;

  if (!row) return null;

  const versions = database
    .prepare("SELECT * FROM base_versions WHERE base_id = ? ORDER BY tag")
    .all(id) as Record<string, unknown>[];

  return {
    id: row.id as string,
    name: row.name as string,
    description: row.description as string,
    registry: row.registry as string,
    repository: row.repository as string,
    category: row.category as "os" | "runtime",
    architecture: JSON.parse(row.architecture_json as string),
    securityProfile: JSON.parse(row.security_profile_json as string),
    icon: row.icon as string,
    color: row.color as string,
    versions: versions.map((v) => ({
      tag: v.tag as string,
      digest: v.digest as string,
      size: v.size as number,
      created: v.created as string,
      vulnerabilities: v.vulnerabilities_json
        ? JSON.parse(v.vulnerabilities_json as string)
        : undefined,
    })),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    lastSyncedAt: row.last_synced_at as string,
  };
}

// ============================================================================
// Feature Operations
// ============================================================================

export function getAllFeatures(): Feature[] {
  const database = getDb();
  const features = database
    .prepare("SELECT * FROM features ORDER BY category, name")
    .all() as Record<string, unknown>[];

  return features.map((row) => {
    const versions = database
      .prepare(
        "SELECT * FROM feature_versions WHERE feature_id = ? ORDER BY tag",
      )
      .all(row.id) as Record<string, unknown>[];

    return {
      id: row.id as string,
      name: row.name as string,
      description: row.description as string,
      documentationUrl: row.documentation_url as string | undefined,
      registry: row.registry as string,
      repository: row.repository as string,
      category: row.category as Feature["category"],
      tags: JSON.parse(row.tags_json as string),
      options: JSON.parse(row.options_json as string),
      dependencies: JSON.parse(row.dependencies_json as string),
      conflicts: JSON.parse(row.conflicts_json as string),
      compatibleBases: JSON.parse(row.compatible_bases_json as string),
      incompatibleBases: JSON.parse(row.incompatible_bases_json as string),
      icon: row.icon as string,
      installTime: row.install_time as "fast" | "medium" | "slow",
      versions: versions.map((v) => ({
        tag: v.tag as string,
        digest: v.digest as string,
        releaseDate: v.release_date as string,
        changelog: v.changelog as string | undefined,
      })),
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  });
}

export function getFeatureById(id: string): Feature | null {
  const database = getDb();
  const row = database
    .prepare("SELECT * FROM features WHERE id = ?")
    .get(id) as Record<string, unknown> | undefined;

  if (!row) return null;

  const versions = database
    .prepare("SELECT * FROM feature_versions WHERE feature_id = ? ORDER BY tag")
    .all(id) as Record<string, unknown>[];

  return {
    id: row.id as string,
    name: row.name as string,
    description: row.description as string,
    documentationUrl: row.documentation_url as string | undefined,
    registry: row.registry as string,
    repository: row.repository as string,
    category: row.category as Feature["category"],
    tags: JSON.parse(row.tags_json as string),
    options: JSON.parse(row.options_json as string),
    dependencies: JSON.parse(row.dependencies_json as string),
    conflicts: JSON.parse(row.conflicts_json as string),
    compatibleBases: JSON.parse(row.compatible_bases_json as string),
    incompatibleBases: JSON.parse(row.incompatible_bases_json as string),
    icon: row.icon as string,
    installTime: row.install_time as "fast" | "medium" | "slow",
    versions: versions.map((v) => ({
      tag: v.tag as string,
      digest: v.digest as string,
      releaseDate: v.release_date as string,
      changelog: v.changelog as string | undefined,
    })),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export function getFeaturesByCategory(category: string): Feature[] {
  return getAllFeatures().filter((f) => f.category === category);
}

export function getCompatibleFeatures(baseId: string): Feature[] {
  return getAllFeatures().filter((f) => {
    // If no compatibility specified, it's compatible with all
    if (
      (!f.compatibleBases || f.compatibleBases.length === 0) &&
      (!f.incompatibleBases || f.incompatibleBases.length === 0)
    ) {
      return true;
    }

    // Check incompatible list
    if (f.incompatibleBases && f.incompatibleBases.includes(baseId)) {
      return false;
    }

    // Check compatible list (if specified)
    if (f.compatibleBases && f.compatibleBases.length > 0) {
      return f.compatibleBases.includes(baseId);
    }

    return true;
  });
}

// ============================================================================
// Build Spec Operations
// ============================================================================

export function getAllBuildSpecs(): BuildSpec[] {
  const database = getDb();
  const specs = database
    .prepare("SELECT * FROM build_specs ORDER BY updated_at DESC")
    .all() as Record<string, unknown>[];

  return specs.map((row) => ({
    id: row.id as string,
    name: row.name as string,
    description: row.description as string | undefined,
    base: JSON.parse(row.base_json as string),
    features: JSON.parse(row.features_json as string),
    customizations: row.customizations_json
      ? JSON.parse(row.customizations_json as string)
      : undefined,
    output: JSON.parse(row.output_json as string),
    createdBy: row.created_by as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }));
}

export function getBuildSpecById(id: string): BuildSpec | null {
  const database = getDb();
  const row = database
    .prepare("SELECT * FROM build_specs WHERE id = ?")
    .get(id) as Record<string, unknown> | undefined;

  if (!row) return null;

  return {
    id: row.id as string,
    name: row.name as string,
    description: row.description as string | undefined,
    base: JSON.parse(row.base_json as string),
    features: JSON.parse(row.features_json as string),
    customizations: row.customizations_json
      ? JSON.parse(row.customizations_json as string)
      : undefined,
    output: JSON.parse(row.output_json as string),
    createdBy: row.created_by as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export function createBuildSpec(
  spec: Omit<BuildSpec, "id" | "createdAt" | "updatedAt">,
): BuildSpec {
  const database = getDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  database
    .prepare(
      `INSERT INTO build_specs (id, name, description, base_json, features_json, customizations_json, output_json, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      spec.name,
      spec.description || null,
      JSON.stringify(spec.base),
      JSON.stringify(spec.features),
      spec.customizations ? JSON.stringify(spec.customizations) : null,
      JSON.stringify(spec.output),
      spec.createdBy,
      now,
      now,
    );

  return { ...spec, id, createdAt: now, updatedAt: now };
}

export function updateBuildSpec(
  id: string,
  updates: Partial<Omit<BuildSpec, "id" | "createdAt" | "updatedAt">>,
): BuildSpec | null {
  const database = getDb();
  const existing = getBuildSpecById(id);
  if (!existing) return null;

  const now = new Date().toISOString();
  const updated = { ...existing, ...updates, updatedAt: now };

  database
    .prepare(
      `UPDATE build_specs SET name = ?, description = ?, base_json = ?, features_json = ?, customizations_json = ?, output_json = ?, updated_at = ? WHERE id = ?`,
    )
    .run(
      updated.name,
      updated.description || null,
      JSON.stringify(updated.base),
      JSON.stringify(updated.features),
      updated.customizations ? JSON.stringify(updated.customizations) : null,
      JSON.stringify(updated.output),
      now,
      id,
    );

  return updated;
}

export function deleteBuildSpec(id: string): boolean {
  const database = getDb();
  const result = database
    .prepare("DELETE FROM build_specs WHERE id = ?")
    .run(id);
  return result.changes > 0;
}

// ============================================================================
// Build Job Operations
// ============================================================================

export function getJobsForSpec(specId: string): BuildJob[] {
  const database = getDb();
  const jobs = database
    .prepare(
      "SELECT * FROM build_jobs WHERE spec_id = ? ORDER BY created_at DESC",
    )
    .all(specId) as Record<string, unknown>[];

  return jobs.map((row) => ({
    id: row.id as string,
    specId: row.spec_id as string,
    status: row.status as BuildJob["status"],
    progress: row.progress_json
      ? JSON.parse(row.progress_json as string)
      : { stage: "", stageProgress: 0, totalProgress: 0, logs: [] },
    result: row.result_json ? JSON.parse(row.result_json as string) : undefined,
    error: row.error_json ? JSON.parse(row.error_json as string) : undefined,
    createdAt: row.created_at as string,
    startedAt: row.started_at as string | undefined,
    completedAt: row.completed_at as string | undefined,
  }));
}

export function getJobById(jobId: string): BuildJob | null {
  const database = getDb();
  const row = database
    .prepare("SELECT * FROM build_jobs WHERE id = ?")
    .get(jobId) as Record<string, unknown> | undefined;

  if (!row) return null;

  return {
    id: row.id as string,
    specId: row.spec_id as string,
    status: row.status as BuildJob["status"],
    progress: row.progress_json
      ? JSON.parse(row.progress_json as string)
      : { stage: "", stageProgress: 0, totalProgress: 0, logs: [] },
    result: row.result_json ? JSON.parse(row.result_json as string) : undefined,
    error: row.error_json ? JSON.parse(row.error_json as string) : undefined,
    createdAt: row.created_at as string,
    startedAt: row.started_at as string | undefined,
    completedAt: row.completed_at as string | undefined,
  };
}

export function createBuildJob(specId: string): BuildJob {
  const database = getDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const progress = {
    stage: "Queued",
    stageProgress: 0,
    totalProgress: 0,
    logs: [],
  };

  database
    .prepare(
      `INSERT INTO build_jobs (id, spec_id, status, progress_json, created_at) VALUES (?, ?, ?, ?, ?)`,
    )
    .run(id, specId, "queued", JSON.stringify(progress), now);

  return {
    id,
    specId,
    status: "queued",
    progress,
    createdAt: now,
  };
}

export function updateBuildJob(
  jobId: string,
  updates: Partial<BuildJob>,
): BuildJob | null {
  const database = getDb();
  const existing = getJobById(jobId);
  if (!existing) return null;

  const updated = { ...existing, ...updates };

  database
    .prepare(
      `UPDATE build_jobs SET status = ?, progress_json = ?, result_json = ?, error_json = ?, started_at = ?, completed_at = ? WHERE id = ?`,
    )
    .run(
      updated.status,
      JSON.stringify(updated.progress),
      updated.result ? JSON.stringify(updated.result) : null,
      updated.error ? JSON.stringify(updated.error) : null,
      updated.startedAt || null,
      updated.completedAt || null,
      jobId,
    );

  return updated;
}

// ============================================================================
// Built Image Operations
// ============================================================================

export function getAllBuiltImages(): BuiltImage[] {
  const database = getDb();
  const images = database
    .prepare("SELECT * FROM built_images ORDER BY created_at DESC")
    .all() as Record<string, unknown>[];

  return images.map((row) => ({
    digest: row.digest as string,
    specId: row.spec_id as string | undefined,
    jobId: row.job_id as string | undefined,
    tags: JSON.parse(row.tags_json as string),
    size: row.size as number,
    layers: row.layers as number,
    vulnerabilities: row.vulnerabilities_json
      ? JSON.parse(row.vulnerabilities_json as string)
      : undefined,
    createdAt: row.created_at as string,
    lastScannedAt: row.last_scanned_at as string | undefined,
  }));
}

export function createBuiltImage(
  image: Omit<BuiltImage, "createdAt">,
): BuiltImage {
  const database = getDb();
  const now = new Date().toISOString();

  database
    .prepare(
      `INSERT INTO built_images (digest, spec_id, job_id, tags_json, size, layers, vulnerabilities_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      image.digest,
      image.specId || null,
      image.jobId || null,
      JSON.stringify(image.tags),
      image.size,
      image.layers,
      image.vulnerabilities ? JSON.stringify(image.vulnerabilities) : null,
      now,
    );

  return { ...image, createdAt: now };
}

// ============================================================================
// Convenience Aliases for Dashboard
// ============================================================================

/**
 * Alias for getAllBuildSpecs - for backward compatibility with dashboard code
 */
export function getAllBuilds(): BuildSpec[] {
  return getAllBuildSpecs();
}

/**
 * Alias for getAllBuiltImages - for backward compatibility with dashboard code
 */
export function getAllImages(): BuiltImage[] {
  return getAllBuiltImages();
}
