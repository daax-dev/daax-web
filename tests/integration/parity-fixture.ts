/**
 * Parity-test fixture helper (brain2daax #93). Run via tsx/bun in a child
 * process (NOT inside vitest — better-sqlite3 is a native addon Vite can't wrap).
 *
 * Seeds throwaway SQLite catalog.db + releases.db with the legacy schema and a
 * row in every table the exporter copies (timestamps as ISO-8601 UTC so
 * cross-engine epoch normalisation is exact), then prints the seeded rows as
 * JSON to stdout so the test can compare them against the exported Postgres rows.
 *
 * Usage: tsx tests/integration/parity-fixture.ts --catalog <path> --releases <path>
 */

import Database from "better-sqlite3";

function arg(flag: string): string {
  const i = process.argv.indexOf(flag);
  if (i < 0 || !process.argv[i + 1]) throw new Error(`missing ${flag}`);
  return process.argv[i + 1];
}

const catalogPath = arg("--catalog");
const releasesPath = arg("--releases");
const ts = "2026-06-01T00:00:00.000Z";

const cat = new Database(catalogPath);
cat.exec(`
  CREATE TABLE bases (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, registry TEXT NOT NULL,
    repository TEXT NOT NULL, category TEXT NOT NULL, architecture_json TEXT NOT NULL,
    icon TEXT, color TEXT, security_profile_json TEXT,
    created_at TIMESTAMP, updated_at TIMESTAMP, last_synced_at TIMESTAMP
  );
  CREATE TABLE base_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT, base_id TEXT NOT NULL, tag TEXT NOT NULL,
    digest TEXT NOT NULL, size INTEGER, created TEXT, vulnerabilities_json TEXT
  );
  CREATE TABLE features (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, documentation_url TEXT,
    registry TEXT NOT NULL, repository TEXT NOT NULL, category TEXT NOT NULL,
    tags_json TEXT, options_json TEXT, dependencies_json TEXT, conflicts_json TEXT,
    compatible_bases_json TEXT, incompatible_bases_json TEXT, icon TEXT, install_time TEXT,
    created_at TIMESTAMP, updated_at TIMESTAMP
  );
  CREATE TABLE feature_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT, feature_id TEXT NOT NULL, tag TEXT NOT NULL,
    digest TEXT NOT NULL, release_date TEXT, changelog TEXT
  );
  CREATE TABLE build_specs (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, base_json TEXT NOT NULL,
    features_json TEXT NOT NULL, customizations_json TEXT, output_json TEXT NOT NULL,
    created_by TEXT, created_at TIMESTAMP, updated_at TIMESTAMP
  );
  CREATE TABLE build_jobs (
    id TEXT PRIMARY KEY, spec_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued',
    progress_json TEXT, result_json TEXT, error_json TEXT,
    created_at TIMESTAMP, started_at TIMESTAMP, completed_at TIMESTAMP
  );
  CREATE TABLE built_images (
    digest TEXT PRIMARY KEY, spec_id TEXT, job_id TEXT, tags_json TEXT NOT NULL,
    size INTEGER, layers INTEGER, vulnerabilities_json TEXT,
    created_at TIMESTAMP, last_scanned_at TIMESTAMP
  );
`);
cat
  .prepare(
    `INSERT INTO bases (id,name,description,registry,repository,category,architecture_json,icon,color,security_profile_json,created_at,updated_at,last_synced_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  )
  .run(
    "alpine-base",
    "Alpine",
    "small",
    "docker.io",
    "library/alpine",
    "os",
    JSON.stringify({ platforms: ["amd64", "arm64"] }),
    "icon",
    "#fff",
    JSON.stringify({ rootless: true }),
    ts,
    ts,
    ts,
  );
cat
  .prepare(
    `INSERT INTO base_versions (base_id,tag,digest,size,created,vulnerabilities_json) VALUES (?,?,?,?,?,?)`,
  )
  .run("alpine-base", "latest", "sha256:abc", 8000000, ts, JSON.stringify([]));
cat
  .prepare(
    `INSERT INTO features (id,name,description,documentation_url,registry,repository,category,tags_json,options_json,dependencies_json,conflicts_json,compatible_bases_json,incompatible_bases_json,icon,install_time,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  )
  .run(
    "git-feature",
    "Git",
    "version control",
    "https://example.com",
    "ghcr.io/devcontainers/features",
    "git",
    "tooling",
    JSON.stringify(["vcs"]),
    JSON.stringify({ version: { default: "latest" } }),
    JSON.stringify([]),
    JSON.stringify([]),
    JSON.stringify(["alpine-base"]),
    JSON.stringify([]),
    "git-icon",
    "fast",
    ts,
    ts,
  );
cat
  .prepare(
    `INSERT INTO feature_versions (feature_id,tag,digest,release_date,changelog) VALUES (?,?,?,?,?)`,
  )
  .run("git-feature", "latest", "sha256:def", ts, "initial");
cat
  .prepare(
    `INSERT INTO build_specs (id,name,description,base_json,features_json,customizations_json,output_json,created_by,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
  )
  .run(
    "spec-1",
    "Spec 1",
    "desc",
    JSON.stringify({ imageId: "alpine-base", version: "latest" }),
    JSON.stringify([]),
    null,
    JSON.stringify({ registry: "ghcr.io", repository: "x/y", tags: ["v1"] }),
    "tester",
    ts,
    ts,
  );
cat
  .prepare(
    `INSERT INTO build_jobs (id,spec_id,status,progress_json,result_json,error_json,created_at,started_at,completed_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
  )
  .run(
    "job-1",
    "spec-1",
    "success",
    JSON.stringify({ stage: "done", totalProgress: 100 }),
    JSON.stringify({ ok: true }),
    null,
    ts,
    ts,
    ts,
  );
cat
  .prepare(
    `INSERT INTO built_images (digest,spec_id,job_id,tags_json,size,layers,vulnerabilities_json,created_at,last_scanned_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
  )
  .run(
    "sha256:image1",
    "spec-1",
    "job-1",
    JSON.stringify(["x/y:v1"]),
    123456,
    5,
    JSON.stringify({ critical: 0 }),
    ts,
    ts,
  );

const rel = new Database(releasesPath);
rel.exec(`
  CREATE TABLE releases (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, version TEXT NOT NULL,
    image_name TEXT NOT NULL, image_tag TEXT NOT NULL, created_at TEXT NOT NULL,
    built_at TEXT, build_status TEXT DEFAULT 'pending', build_log TEXT,
    feature_config TEXT NOT NULL, sbom TEXT, notes TEXT
  );
  CREATE TABLE release_shares (
    id INTEGER PRIMARY KEY AUTOINCREMENT, release_id TEXT NOT NULL, share_type TEXT NOT NULL,
    share_value TEXT NOT NULL, shared_at TEXT NOT NULL
  );
  CREATE TABLE feature_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT, release_id TEXT NOT NULL, plugin_id TEXT NOT NULL,
    plugin_name TEXT NOT NULL, maturity TEXT NOT NULL, sub_features TEXT
  );
`);
rel
  .prepare(
    `INSERT INTO releases (id,name,description,version,image_name,image_tag,created_at,built_at,build_status,build_log,feature_config,sbom,notes)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  )
  .run(
    "rel_seed_1",
    "Seed release",
    "desc",
    "1.0.0",
    "ghcr.io/x/y",
    "1.0.0",
    ts,
    ts,
    "success",
    "log",
    JSON.stringify({ plugins: { terminal: { maturity: "ga" } } }),
    JSON.stringify({ bomFormat: "CycloneDX" }),
    "notes",
  );
rel
  .prepare(
    `INSERT INTO release_shares (release_id,share_type,share_value,shared_at) VALUES (?,?,?,?)`,
  )
  .run("rel_seed_1", "github", "octocat", ts);
rel
  .prepare(
    `INSERT INTO feature_snapshots (release_id,plugin_id,plugin_name,maturity,sub_features) VALUES (?,?,?,?,?)`,
  )
  .run("rel_seed_1", "terminal", "Terminal", "ga", JSON.stringify({ a: 1 }));

const out = {
  bases: cat.prepare("SELECT * FROM bases ORDER BY id").all(),
  base_versions: cat.prepare("SELECT * FROM base_versions ORDER BY id").all(),
  features: cat.prepare("SELECT * FROM features ORDER BY id").all(),
  feature_versions: cat
    .prepare("SELECT * FROM feature_versions ORDER BY id")
    .all(),
  build_specs: cat.prepare("SELECT * FROM build_specs ORDER BY id").all(),
  build_jobs: cat.prepare("SELECT * FROM build_jobs ORDER BY id").all(),
  built_images: cat.prepare("SELECT * FROM built_images ORDER BY digest").all(),
  releases: rel.prepare("SELECT * FROM releases ORDER BY id").all(),
  release_shares: rel.prepare("SELECT * FROM release_shares ORDER BY id").all(),
  feature_snapshots: rel
    .prepare("SELECT * FROM feature_snapshots ORDER BY id")
    .all(),
};
cat.close();
rel.close();

process.stdout.write(JSON.stringify(out));
