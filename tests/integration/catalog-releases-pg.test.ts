/**
 * Integration tests (brain2daax Phase 0 — issue #93).
 *
 * Against a real Postgres (provided by `bun run test:integration`):
 *  1. CRUD round-trips through the rewritten `pg`-backed data layers
 *     (`lib/catalog/db.ts`, `lib/releases-db.ts`).
 *  2. Exporter parity: seed a throwaway SQLite catalog.db + releases.db, run
 *     `scripts/export-sqlite-to-postgres.ts`, then assert per-table row counts
 *     match exactly and a cross-engine content checksum matches.
 *
 * Self-skips when Postgres is not configured. Resets to a clean migrated schema
 * in beforeAll so it is independent of other integration files' state.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { Client } from "pg";
import { runner } from "node-pg-migrate";
import { resolveDbConfig, isDbConfigured } from "@/lib/db/config";
import { query, closePool } from "@/lib/db/pg";
import {
  getAllBases,
  getAllFeatures,
  createBuildSpec,
  getBuildSpecById,
  updateBuildSpec,
  getAllBuildSpecs,
  deleteBuildSpec,
  createBuildJob,
  getJobById,
  getJobsForSpec,
  createBuiltImage,
  getAllBuiltImages,
} from "@/lib/catalog/db";
import {
  createRelease,
  getRelease,
  listReleases,
  updateRelease,
  deleteRelease,
  addReleaseShare,
  getReleaseShares,
  removeReleaseShare,
  saveFeatureSnapshot,
  getFeatureSnapshots,
} from "@/lib/releases-db";
import type { BuildSpec } from "@/types/catalog";

const MIGRATIONS_DIR = path.resolve(process.cwd(), "migrations");
const configured = isDbConfigured();

async function migrateUp(): Promise<void> {
  const client = new Client(resolveDbConfig().poolConfig);
  await client.connect();
  try {
    await runner({
      dbClient: client,
      migrationsTable: "pgmigrations",
      dir: MIGRATIONS_DIR,
      direction: "up",
      count: Infinity,
      createMigrationsSchema: false,
      singleTransaction: true,
      log: () => {},
    });
  } finally {
    await client.end();
  }
}

const SPEC: Omit<BuildSpec, "id" | "createdAt" | "updatedAt"> = {
  name: "test-spec",
  description: "spec for #93 integration test",
  base: { imageId: "alpine-base", version: "latest" },
  features: [],
  output: { registry: "ghcr.io", repository: "x/y", tags: ["v1"] },
  createdBy: "tester",
};

describe.skipIf(!configured)(
  "catalog + releases data layers (Postgres)",
  () => {
    beforeAll(async () => {
      await query("DROP SCHEMA IF EXISTS public CASCADE");
      await query("CREATE SCHEMA public");
      await migrateUp();
    });

    afterAll(async () => {
      await closePool();
    });

    it("seeds default bases and features on first read", async () => {
      const bases = await getAllBases();
      const features = await getAllFeatures();
      expect(bases.length).toBeGreaterThan(0);
      expect(features.length).toBeGreaterThan(0);
      // jsonb round-trips to a structured object, not a string.
      expect(typeof bases[0].architecture).toBe("object");
      expect(Array.isArray(features[0].tags)).toBe(true);
    });

    it("build spec + job + image CRUD round-trip", async () => {
      // specA: exercise read/update + a built image (kept; built_images.spec_id
      // has no ON DELETE, matching the original schema).
      const specA = await createBuildSpec(SPEC);
      expect(specA.id).toBeTruthy();

      const fetched = await getBuildSpecById(specA.id);
      expect(fetched?.name).toBe("test-spec");
      expect(fetched?.output).toEqual(SPEC.output); // jsonb structured round-trip

      const updated = await updateBuildSpec(specA.id, { name: "renamed-spec" });
      expect(updated?.name).toBe("renamed-spec");
      expect((await getAllBuildSpecs()).some((s) => s.id === specA.id)).toBe(
        true,
      );

      const jobA = await createBuildJob(specA.id);
      expect(jobA.status).toBe("queued");
      expect((await getJobById(jobA.id))?.specId).toBe(specA.id);
      expect((await getJobsForSpec(specA.id)).length).toBe(1);

      const digest = `sha256:${"a".repeat(64)}`;
      await createBuiltImage({
        digest,
        specId: specA.id,
        jobId: jobA.id,
        tags: ["x/y:v1"],
        size: 123,
        layers: 4,
      });
      expect((await getAllBuiltImages()).some((i) => i.digest === digest)).toBe(
        true,
      );

      // specB: deleting a spec cascades to its jobs (build_jobs.spec_id ON DELETE CASCADE).
      const specB = await createBuildSpec({ ...SPEC, name: "spec-b" });
      const jobB = await createBuildJob(specB.id);
      expect(await deleteBuildSpec(specB.id)).toBe(true);
      expect(await getBuildSpecById(specB.id)).toBeNull();
      expect(await getJobById(jobB.id)).toBeNull();
    });

    it("release CRUD + shares + snapshots, feature_config string contract", async () => {
      const cfg = { plugins: { terminal: { maturity: "ga" } } };
      const release = await createRelease({
        name: "rel-1",
        version: "1.0.0",
        image_name: "ghcr.io/x/y",
        image_tag: "1.0.0",
        feature_config: cfg,
      });
      expect(release.id).toMatch(/^rel_/);
      // feature_config is exposed as a JSON *string* (callers JSON.parse it).
      expect(typeof release.feature_config).toBe("string");
      expect(JSON.parse(release.feature_config)).toEqual(cfg);

      expect((await getRelease(release.id))?.name).toBe("rel-1");
      expect((await listReleases()).some((r) => r.id === release.id)).toBe(
        true,
      );

      const updated = await updateRelease(release.id, {
        build_status: "success",
      });
      expect(updated?.build_status).toBe("success");

      const share = await addReleaseShare(release.id, "github", "octocat");
      expect(share?.share_value).toBe("octocat");
      // Unique constraint → duplicate returns null, not a throw.
      expect(await addReleaseShare(release.id, "github", "octocat")).toBeNull();
      expect((await getReleaseShares(release.id)).length).toBe(1);
      expect(await removeReleaseShare(share!.id)).toBe(true);

      await saveFeatureSnapshot(release.id, "terminal", "Terminal", "ga", {
        a: 1,
      });
      const snaps = await getFeatureSnapshots(release.id);
      expect(snaps.length).toBe(1);
      expect(JSON.parse(snaps[0].sub_features!)).toEqual({ a: 1 });

      // Delete cascades to shares + snapshots.
      expect(await deleteRelease(release.id)).toBe(true);
      expect(await getFeatureSnapshots(release.id)).toEqual([]);
    });

    describe("exporter parity (SQLite → Postgres)", () => {
      // JSON-as-text columns per table (canonicalised before hashing).
      const JSON_COLS: Record<string, Set<string>> = {
        bases: new Set(["architecture_json", "security_profile_json"]),
        base_versions: new Set(["vulnerabilities_json"]),
        releases: new Set(["feature_config", "sbom"]),
        feature_snapshots: new Set(["sub_features"]),
      };
      // Timestamp columns per table (normalised to epoch ms).
      const TS_COLS: Record<string, Set<string>> = {
        bases: new Set(["created_at", "updated_at", "last_synced_at"]),
        releases: new Set(["created_at", "built_at"]),
        release_shares: new Set(["shared_at"]),
      };
      const COUNT_TABLES = [
        "bases",
        "base_versions",
        "releases",
        "release_shares",
        "feature_snapshots",
      ];

      function canon(v: unknown): unknown {
        if (v === null || typeof v !== "object") return v;
        if (Array.isArray(v)) return v.map(canon);
        const o = v as Record<string, unknown>;
        return Object.keys(o)
          .sort()
          .reduce<Record<string, unknown>>((acc, k) => {
            acc[k] = canon(o[k]);
            return acc;
          }, {});
      }

      function cellHash(table: string, col: string, v: unknown): string {
        if (v == null) return "∅";
        if (JSON_COLS[table]?.has(col)) {
          const parsed = typeof v === "string" ? JSON.parse(v) : v;
          return JSON.stringify(canon(parsed));
        }
        if (TS_COLS[table]?.has(col))
          return String(new Date(v as string).getTime());
        if (v instanceof Date) return String(v.getTime());
        return String(v);
      }

      function rowsHash(
        table: string,
        rows: Record<string, unknown>[],
      ): string {
        const h = crypto.createHash("sha256");
        for (const row of rows) {
          for (const col of Object.keys(row).sort()) {
            h.update(`${col}=${cellHash(table, col, row[col])};`);
          }
          h.update("\n");
        }
        return h.digest("hex");
      }

      let tmpDir = "";
      // Source rows as seeded into SQLite (captured from the tsx fixture helper).
      let sourceRows: Record<string, Record<string, unknown>[]> = {};

      beforeAll(async () => {
        // Clean migrated schema (drop the seeded/CRUD data) for exact-count parity.
        await query("DROP SCHEMA IF EXISTS public CASCADE");
        await query("CREATE SCHEMA public");
        await migrateUp();

        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "daax-parity-"));
        const catalogPath = path.join(tmpDir, "catalog.db");
        const releasesPath = path.join(tmpDir, "releases.db");

        // Seed the SQLite fixtures + capture the source rows in a child process
        // (better-sqlite3 is a native addon that can't load inside vitest).
        const seeded = execFileSync(
          "node_modules/.bin/tsx",
          [
            "tests/integration/parity-fixture.ts",
            "--catalog",
            catalogPath,
            "--releases",
            releasesPath,
          ],
          { encoding: "utf8", env: process.env },
        );
        sourceRows = JSON.parse(seeded);

        // Run the real exporter against the throwaway SQLite files.
        execFileSync(
          "node_modules/.bin/tsx",
          [
            "scripts/export-sqlite-to-postgres.ts",
            "--catalog",
            catalogPath,
            "--releases",
            releasesPath,
          ],
          { stdio: "pipe", env: process.env },
        );
      });

      afterAll(() => {
        if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
      });

      it("per-table row counts match the source exactly", async () => {
        for (const table of COUNT_TABLES) {
          const srcCount = sourceRows[table].length;
          const pgCount = Number(
            (
              await query<{ c: string }>(
                `SELECT COUNT(*)::int AS c FROM ${table}`,
              )
            ).rows[0].c,
          );
          expect(pgCount, `row count for ${table}`).toBe(srcCount);
        }
      });

      it("content checksums match between SQLite and Postgres", async () => {
        for (const table of COUNT_TABLES) {
          const pgRows = (await query(`SELECT * FROM ${table} ORDER BY id`))
            .rows as Record<string, unknown>[];
          expect(rowsHash(table, pgRows), `checksum for ${table}`).toBe(
            rowsHash(table, sourceRows[table]),
          );
        }
      });
    });
  },
);
