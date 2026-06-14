/**
 * Parity-test fixture helper (brain2daax #93). Run via tsx in a child process
 * (NOT inside vitest — better-sqlite3 is a native addon that Vite can't wrap).
 *
 * Seeds throwaway SQLite catalog.db + releases.db with the legacy schema and a
 * couple of rows per table (timestamps as ISO-8601 UTC so cross-engine epoch
 * normalisation is exact), then prints the seeded rows as JSON to stdout so the
 * test can compare them against the exported Postgres rows.
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
  releases: rel.prepare("SELECT * FROM releases ORDER BY id").all(),
  release_shares: rel.prepare("SELECT * FROM release_shares ORDER BY id").all(),
  feature_snapshots: rel
    .prepare("SELECT * FROM feature_snapshots ORDER BY id")
    .all(),
};
cat.close();
rel.close();

process.stdout.write(JSON.stringify(out));
