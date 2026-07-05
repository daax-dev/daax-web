import { test, expect } from "@playwright/test";

/**
 * Build / deploy-provenance admin page (F8, issue #99).
 *
 * Verifies the settings > Build page (`/settings/build`, rendered by
 * `components/settings/BuildPanel.tsx`) surfaces build provenance:
 *   - version, git SHA, build time/branch (the `build-version` grid),
 *   - deployment metadata (mode / deployed-by / host, or the empty-state note),
 *   - SBOM download links + viewer *when a build bundles SBOMs*.
 *
 * Runs under the local `chromium` project (no auth). `requireAuth` bypasses to
 * the local operator in non-strict mode, so `/api/build` returns 200 and the
 * panel renders for both a from-source `bun dev` run and a deployed container.
 * SBOM assertions branch on availability: a from-source dev build ships no SBOM
 * (`sbom-none`), a released image bundles both formats — the test exercises
 * whichever state the running build presents, without weakening any gating.
 */
test.describe("Build provenance page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/settings/build");
  });

  test("renders build provenance fields", async ({ page }) => {
    await expect(page).toHaveURL(/\/settings\/build/);

    // Page heading.
    await expect(
      page.getByRole("heading", { name: "Build", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Version/provenance grid populated from GET /api/build.
    const versionGrid = page.getByTestId("build-version");
    await expect(versionGrid).toBeVisible();

    // Each provenance field label renders (BuildPanel.versionRows).
    for (const label of [
      "Version",
      "Git SHA",
      "Build time",
      "Node runtime",
      "Next.js",
      "Branch",
    ]) {
      await expect(versionGrid.getByText(label, { exact: true })).toBeVisible();
    }

    // Values, not just labels. Scope each assertion to the InfoTile carrying
    // its LABEL, then read that tile's value (the last <span>). Selecting by
    // label text — not a presentation class — keeps the "Version" value from
    // being confused with "Node runtime" (both vX.Y.Z) and pins the Git SHA
    // check to the "Git SHA" tile so a stray hex string elsewhere on the page
    // can't false-positive. (InfoTile in BuildPanel.tsx = container div with a
    // label span followed by the value span.)
    const tileValue = (label: string) =>
      versionGrid
        .locator("div")
        .filter({ has: page.getByText(label, { exact: true }) })
        .locator("span")
        .last();
    await expect(tileValue("Version")).toHaveText(/^v\d+\.\d+\.\d+/);
    // Git SHA value is a hex commit (a bare dev build renders "000000"; a real
    // build a full 40-char sha), scoped to the "Git SHA" tile.
    await expect(tileValue("Git SHA")).toHaveText(/^[0-9a-f]{6,40}$/i);
  });

  test("shows deployment metadata section", async ({ page }) => {
    // Deployment card is always present; it renders either the metadata grid
    // (mode/host/deployer, always knowable) or the explicit empty-state note.
    await expect(page.getByRole("heading", { name: "Deployment" })).toBeVisible(
      { timeout: 15000 },
    );

    const deployment = page.getByTestId("build-deployment");
    const deploymentNone = page.getByTestId("build-deployment-none");
    await expect(deployment.or(deploymentNone)).toBeVisible();
  });

  test("shows SBOM links when the build bundles SBOMs", async ({ page }) => {
    // Wait for the panel to hydrate from /api/build before branching.
    await expect(page.getByTestId("build-version")).toBeVisible({
      timeout: 15000,
    });

    const download = page.getByTestId("sbom-download");
    const none = page.getByTestId("sbom-none");
    // Exactly one of the two SBOM states renders — enforce the invariant so a
    // regression that renders both (or neither) can't silently pass.
    expect(await download.or(none).count()).toBe(1);
    await expect(download.or(none)).toBeVisible();

    if ((await download.count()) > 0) {
      // Build bundles SBOMs: download link points at the SBOM API and the
      // viewer expands into a component table.
      await expect(download).toHaveAttribute("href", /\/api\/build\/sbom\?/);

      const toggle = page.getByTestId("sbom-view-toggle");
      await expect(toggle).toBeVisible();
      await toggle.click();
      await expect(page.getByTestId("sbom-panel")).toBeVisible();
      // Confirm the SBOM document actually fetched+parsed. sbom-raw-toggle
      // renders only inside BuildPanel's `{sbom && ...}` branch, so it's proof
      // the document is truthy. (sbom-format-select renders whenever the panel
      // is open — even on a failed fetch — so it is NOT evidence of a load.)
      await expect(page.getByTestId("sbom-raw-toggle")).toBeVisible({
        timeout: 15000,
      });
    } else {
      // From-source build: explicit "no SBOM bundled" note, no download link.
      await expect(none).toBeVisible();
      await expect(download).toHaveCount(0);
    }
  });
});
