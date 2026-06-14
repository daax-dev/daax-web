/**
 * E2E: catalog + releases flows against Postgres (brain2daax Phase 0 — #93).
 *
 * Exercises the PG-backed catalog read paths and the releases create/list/get/
 * delete lifecycle through the running Next server. These routes require a
 * Postgres connection (DATABASE_URL / PG*); when the server has no PG wired
 * (e.g. the default `bun dev` E2E run with no database), the suite skips so it
 * never red-flags an unrelated environment. Run it against a PG-backed server
 * (see CLAUDE.md › Database) to get full coverage.
 */

import { test, expect, type APIRequestContext } from "@playwright/test";

async function pgBacked(request: APIRequestContext): Promise<boolean> {
  // Probe /api/releases (reads straight from Postgres, no provenance fallback)
  // rather than /api/catalog/bases, which can 200 via the provenance server even
  // when Postgres isn't configured.
  const res = await request.get("/api/releases");
  return res.ok();
}

test.describe("catalog + releases (Postgres)", () => {
  test("catalog bases/features read from Postgres", async ({ request }) => {
    test.skip(!(await pgBacked(request)), "No Postgres wired to this server");

    const bases = await request.get("/api/catalog/bases");
    expect(bases.ok()).toBe(true);
    const basesBody = await bases.json();
    expect(Array.isArray(basesBody.bases)).toBe(true);
    expect(basesBody.bases.length).toBeGreaterThan(0); // seeded defaults

    const features = await request.get("/api/catalog/features");
    expect(features.ok()).toBe(true);
    const featuresBody = await features.json();
    expect(Array.isArray(featuresBody.features)).toBe(true);
  });

  test("release create → list → get → delete lifecycle", async ({
    request,
  }) => {
    test.skip(!(await pgBacked(request)), "No Postgres wired to this server");

    const create = await request.post("/api/releases", {
      data: {
        name: "e2e-release",
        version: "0.0.1",
        image_name: "ghcr.io/daax/e2e",
        image_tag: "0.0.1",
        feature_config: { plugins: { terminal: { maturity: "ga" } } },
      },
    });
    // Unauthenticated POST may be gated (401) in strict-auth deployments; only
    // assert the lifecycle when creation is permitted.
    test.skip(
      create.status() === 401,
      "Release creation requires auth in this deployment",
    );
    expect(create.status()).toBe(201);
    const { release } = await create.json();
    expect(release.id).toMatch(/^rel_/);
    // feature_config round-trips as a JSON string (caller-parseable).
    expect(typeof release.feature_config).toBe("string");

    const list = await request.get("/api/releases");
    expect(list.ok()).toBe(true);
    const { releases } = await list.json();
    expect(releases.some((r: { id: string }) => r.id === release.id)).toBe(
      true,
    );

    const got = await request.get(`/api/releases/${release.id}`);
    expect(got.ok()).toBe(true);
    expect((await got.json()).release.name).toBe("e2e-release");

    const del = await request.delete(`/api/releases/${release.id}`);
    expect(del.ok()).toBe(true);

    const gone = await request.get(`/api/releases/${release.id}`);
    expect(gone.status()).toBe(404);
  });
});
