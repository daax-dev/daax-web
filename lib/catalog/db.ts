/**
 * Daax Image Catalog - Database Operations (Postgres)
 *
 * brain2daax Phase 0 (#93): ported from SQLite (better-sqlite3) to the shared
 * `pg` pool (`lib/db/pg.ts`). Schema lives in `migrations/` (node-pg-migrate),
 * not inline DDL. All operations are async.
 *
 * jsonb columns: write with `JSON.stringify(value)` (node-pg renders a bare JS
 * array as a Postgres array literal, which is wrong for jsonb), read straight
 * back as parsed JS values (no `JSON.parse`). timestamptz columns come back as
 * JS `Date`; the public types are strings, so reads normalise via `iso()`.
 */

import { query } from "@/lib/db/pg";
import {
  BaseImage,
  Feature,
  BuildSpec,
  BuildJob,
  BuiltImage,
  DEFAULT_BASE_IMAGES,
  DEFAULT_FEATURES,
} from "@/types/catalog";

type Row = Record<string, unknown>;

/** Normalise a timestamptz value (pg returns `Date`) to an ISO string. */
function iso(v: unknown): string | undefined {
  if (v == null) return undefined;
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

// ============================================================================
// Default-data seeding (idempotent; replaces the old seed-on-first-open path)
// ============================================================================

let seeded = false;
let seedingPromise: Promise<void> | null = null;

/**
 * Seed default bases/features once per process. Idempotent via
 * `ON CONFLICT (id) DO NOTHING`, so concurrent processes (Next + terminal) and
 * repeat calls are safe.
 */
async function ensureSeeded(): Promise<void> {
  if (seeded) return;
  if (!seedingPromise) {
    seedingPromise = seedDefaultData().then(() => {
      seeded = true;
    });
  }
  return seedingPromise;
}

async function seedDefaultData(): Promise<void> {
  const now = new Date().toISOString();

  const baseCount = await query<{ count: string }>(
    "SELECT COUNT(*)::int AS count FROM bases",
  );
  if (Number(baseCount.rows[0]?.count ?? 0) === 0) {
    for (const base of DEFAULT_BASE_IMAGES) {
      await query(
        `INSERT INTO bases (id, name, description, registry, repository, category, architecture_json, icon, color, security_profile_json, created_at, updated_at, last_synced_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (id) DO NOTHING`,
        [
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
        ],
      );
      await query(
        `INSERT INTO base_versions (base_id, tag, digest, size, created)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (base_id, tag) DO NOTHING`,
        [
          base.id,
          "latest",
          `sha256:${generateFakeDigest()}`,
          getDefaultSize(base.id),
          now,
        ],
      );
    }
  }

  const featureCount = await query<{ count: string }>(
    "SELECT COUNT(*)::int AS count FROM features",
  );
  if (Number(featureCount.rows[0]?.count ?? 0) === 0) {
    for (const feature of DEFAULT_FEATURES) {
      await query(
        `INSERT INTO features (id, name, description, documentation_url, registry, repository, category, tags_json, options_json, dependencies_json, conflicts_json, compatible_bases_json, incompatible_bases_json, icon, install_time, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
         ON CONFLICT (id) DO NOTHING`,
        [
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
        ],
      );
      await query(
        `INSERT INTO feature_versions (feature_id, tag, digest, release_date)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (feature_id, tag) DO NOTHING`,
        [feature.id, "latest", `sha256:${generateFakeDigest()}`, now],
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
// Mappers
// ============================================================================

function mapBase(row: Row, versions: Row[]): BaseImage {
  return {
    id: row.id as string,
    name: row.name as string,
    description: row.description as string,
    registry: row.registry as string,
    repository: row.repository as string,
    category: row.category as "os" | "runtime",
    architecture: row.architecture_json as BaseImage["architecture"],
    securityProfile: row.security_profile_json as BaseImage["securityProfile"],
    icon: row.icon as string,
    color: row.color as string,
    versions: versions.map((v) => ({
      tag: v.tag as string,
      digest: v.digest as string,
      size: Number(v.size),
      created: v.created as string,
      vulnerabilities:
        (v.vulnerabilities_json as BaseImage["versions"][number]["vulnerabilities"]) ??
        undefined,
    })),
    createdAt: iso(row.created_at) as string,
    updatedAt: iso(row.updated_at) as string,
    lastSyncedAt: iso(row.last_synced_at) as string,
  };
}

function mapFeature(row: Row, versions: Row[]): Feature {
  return {
    id: row.id as string,
    name: row.name as string,
    description: row.description as string,
    documentationUrl: (row.documentation_url as string) ?? undefined,
    registry: row.registry as string,
    repository: row.repository as string,
    category: row.category as Feature["category"],
    tags: (row.tags_json as string[]) ?? [],
    options: (row.options_json as Feature["options"]) ?? [],
    dependencies: (row.dependencies_json as string[]) ?? [],
    conflicts: (row.conflicts_json as string[]) ?? [],
    compatibleBases: (row.compatible_bases_json as string[]) ?? [],
    incompatibleBases: (row.incompatible_bases_json as string[]) ?? [],
    icon: row.icon as string,
    installTime: row.install_time as "fast" | "medium" | "slow",
    versions: versions.map((v) => ({
      tag: v.tag as string,
      digest: v.digest as string,
      releaseDate: v.release_date as string,
      changelog: (v.changelog as string) ?? undefined,
    })),
    createdAt: iso(row.created_at) as string,
    updatedAt: iso(row.updated_at) as string,
  };
}

function mapBuildSpec(row: Row): BuildSpec {
  return {
    id: row.id as string,
    name: row.name as string,
    description: (row.description as string) ?? undefined,
    base: row.base_json as BuildSpec["base"],
    features: row.features_json as BuildSpec["features"],
    customizations:
      (row.customizations_json as BuildSpec["customizations"]) ?? undefined,
    output: row.output_json as BuildSpec["output"],
    createdBy: row.created_by as string,
    createdAt: iso(row.created_at) as string,
    updatedAt: iso(row.updated_at) as string,
  };
}

function mapBuildJob(row: Row): BuildJob {
  return {
    id: row.id as string,
    specId: row.spec_id as string,
    status: row.status as BuildJob["status"],
    progress:
      (row.progress_json as BuildJob["progress"]) ??
      ({
        stage: "",
        stageProgress: 0,
        totalProgress: 0,
        logs: [],
      } as BuildJob["progress"]),
    result: (row.result_json as BuildJob["result"]) ?? undefined,
    error: (row.error_json as BuildJob["error"]) ?? undefined,
    createdAt: iso(row.created_at) as string,
    startedAt: iso(row.started_at),
    completedAt: iso(row.completed_at),
  };
}

function mapBuiltImage(row: Row): BuiltImage {
  return {
    digest: row.digest as string,
    specId: (row.spec_id as string) ?? undefined,
    jobId: (row.job_id as string) ?? undefined,
    tags: row.tags_json as string[],
    size: Number(row.size),
    layers: Number(row.layers),
    vulnerabilities:
      (row.vulnerabilities_json as BuiltImage["vulnerabilities"]) ?? undefined,
    createdAt: iso(row.created_at) as string,
    lastScannedAt: iso(row.last_scanned_at),
  };
}

// ============================================================================
// Base Image Operations
// ============================================================================

export async function getAllBases(): Promise<BaseImage[]> {
  await ensureSeeded();
  const bases = await query("SELECT * FROM bases ORDER BY category, name");
  const result: BaseImage[] = [];
  for (const row of bases.rows) {
    const versions = await query(
      "SELECT * FROM base_versions WHERE base_id = $1 ORDER BY tag",
      [row.id],
    );
    result.push(mapBase(row, versions.rows));
  }
  return result;
}

export async function getBaseById(id: string): Promise<BaseImage | null> {
  await ensureSeeded();
  const row = (await query("SELECT * FROM bases WHERE id = $1", [id])).rows[0];
  if (!row) return null;
  const versions = await query(
    "SELECT * FROM base_versions WHERE base_id = $1 ORDER BY tag",
    [id],
  );
  return mapBase(row, versions.rows);
}

// ============================================================================
// Feature Operations
// ============================================================================

export async function getAllFeatures(): Promise<Feature[]> {
  await ensureSeeded();
  const features = await query(
    "SELECT * FROM features ORDER BY category, name",
  );
  const result: Feature[] = [];
  for (const row of features.rows) {
    const versions = await query(
      "SELECT * FROM feature_versions WHERE feature_id = $1 ORDER BY tag",
      [row.id],
    );
    result.push(mapFeature(row, versions.rows));
  }
  return result;
}

export async function getFeatureById(id: string): Promise<Feature | null> {
  await ensureSeeded();
  const row = (await query("SELECT * FROM features WHERE id = $1", [id]))
    .rows[0];
  if (!row) return null;
  const versions = await query(
    "SELECT * FROM feature_versions WHERE feature_id = $1 ORDER BY tag",
    [id],
  );
  return mapFeature(row, versions.rows);
}

export async function getFeaturesByCategory(
  category: string,
): Promise<Feature[]> {
  return (await getAllFeatures()).filter((f) => f.category === category);
}

export async function getCompatibleFeatures(
  baseId: string,
): Promise<Feature[]> {
  return (await getAllFeatures()).filter((f) => {
    if (
      (!f.compatibleBases || f.compatibleBases.length === 0) &&
      (!f.incompatibleBases || f.incompatibleBases.length === 0)
    ) {
      return true;
    }
    if (f.incompatibleBases && f.incompatibleBases.includes(baseId)) {
      return false;
    }
    if (f.compatibleBases && f.compatibleBases.length > 0) {
      return f.compatibleBases.includes(baseId);
    }
    return true;
  });
}

// ============================================================================
// Build Spec Operations
// ============================================================================

export async function getAllBuildSpecs(): Promise<BuildSpec[]> {
  const specs = await query(
    "SELECT * FROM build_specs ORDER BY updated_at DESC",
  );
  return specs.rows.map(mapBuildSpec);
}

export async function getBuildSpecById(id: string): Promise<BuildSpec | null> {
  const row = (await query("SELECT * FROM build_specs WHERE id = $1", [id]))
    .rows[0];
  return row ? mapBuildSpec(row) : null;
}

export async function createBuildSpec(
  spec: Omit<BuildSpec, "id" | "createdAt" | "updatedAt">,
): Promise<BuildSpec> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await query(
    `INSERT INTO build_specs (id, name, description, base_json, features_json, customizations_json, output_json, created_by, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
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
    ],
  );
  return { ...spec, id, createdAt: now, updatedAt: now };
}

export async function updateBuildSpec(
  id: string,
  updates: Partial<Omit<BuildSpec, "id" | "createdAt" | "updatedAt">>,
): Promise<BuildSpec | null> {
  const existing = await getBuildSpecById(id);
  if (!existing) return null;

  const now = new Date().toISOString();
  const updated = { ...existing, ...updates, updatedAt: now };

  await query(
    `UPDATE build_specs SET name = $1, description = $2, base_json = $3, features_json = $4, customizations_json = $5, output_json = $6, updated_at = $7 WHERE id = $8`,
    [
      updated.name,
      updated.description || null,
      JSON.stringify(updated.base),
      JSON.stringify(updated.features),
      updated.customizations ? JSON.stringify(updated.customizations) : null,
      JSON.stringify(updated.output),
      now,
      id,
    ],
  );
  return updated;
}

export async function deleteBuildSpec(id: string): Promise<boolean> {
  const result = await query("DELETE FROM build_specs WHERE id = $1", [id]);
  return (result.rowCount ?? 0) > 0;
}

// ============================================================================
// Build Job Operations
// ============================================================================

export async function getJobsForSpec(specId: string): Promise<BuildJob[]> {
  const jobs = await query(
    "SELECT * FROM build_jobs WHERE spec_id = $1 ORDER BY created_at DESC",
    [specId],
  );
  return jobs.rows.map(mapBuildJob);
}

export async function getJobById(jobId: string): Promise<BuildJob | null> {
  const row = (await query("SELECT * FROM build_jobs WHERE id = $1", [jobId]))
    .rows[0];
  return row ? mapBuildJob(row) : null;
}

export async function createBuildJob(specId: string): Promise<BuildJob> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const progress = {
    stage: "Queued",
    stageProgress: 0,
    totalProgress: 0,
    logs: [],
  };
  await query(
    `INSERT INTO build_jobs (id, spec_id, status, progress_json, created_at) VALUES ($1,$2,$3,$4,$5)`,
    [id, specId, "queued", JSON.stringify(progress), now],
  );
  return { id, specId, status: "queued", progress, createdAt: now };
}

export async function updateBuildJob(
  jobId: string,
  updates: Partial<BuildJob>,
): Promise<BuildJob | null> {
  const existing = await getJobById(jobId);
  if (!existing) return null;

  const updated = { ...existing, ...updates };
  await query(
    `UPDATE build_jobs SET status = $1, progress_json = $2, result_json = $3, error_json = $4, started_at = $5, completed_at = $6 WHERE id = $7`,
    [
      updated.status,
      JSON.stringify(updated.progress),
      updated.result ? JSON.stringify(updated.result) : null,
      updated.error ? JSON.stringify(updated.error) : null,
      updated.startedAt || null,
      updated.completedAt || null,
      jobId,
    ],
  );
  return updated;
}

// ============================================================================
// Built Image Operations
// ============================================================================

export async function getAllBuiltImages(): Promise<BuiltImage[]> {
  const images = await query(
    "SELECT * FROM built_images ORDER BY created_at DESC",
  );
  return images.rows.map(mapBuiltImage);
}

export async function createBuiltImage(
  image: Omit<BuiltImage, "createdAt">,
): Promise<BuiltImage> {
  const now = new Date().toISOString();
  await query(
    `INSERT INTO built_images (digest, spec_id, job_id, tags_json, size, layers, vulnerabilities_json, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      image.digest,
      image.specId || null,
      image.jobId || null,
      JSON.stringify(image.tags),
      image.size,
      image.layers,
      image.vulnerabilities ? JSON.stringify(image.vulnerabilities) : null,
      now,
    ],
  );
  return { ...image, createdAt: now };
}

// ============================================================================
// Convenience Aliases for Dashboard
// ============================================================================

/** Alias for getAllBuildSpecs - for backward compatibility with dashboard code */
export async function getAllBuilds(): Promise<BuildSpec[]> {
  return getAllBuildSpecs();
}

/** Alias for getAllBuiltImages - for backward compatibility with dashboard code */
export async function getAllImages(): Promise<BuiltImage[]> {
  return getAllBuiltImages();
}
