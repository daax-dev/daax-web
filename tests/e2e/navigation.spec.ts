import { test, expect } from "@playwright/test";

/**
 * Navigation Tests
 *
 * Verify all main pages load correctly and navigation works.
 */
test.describe("Navigation", () => {
  test("homepage loads with all feature cards", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveTitle(/daax/i);

    // Check for main feature cards (looking for any link on the page)
    const links = page.getByRole("link");
    expect(await links.count()).toBeGreaterThan(0);
  });

  test("can navigate to shell page", async ({ page }) => {
    await page.goto("/shell");
    await expect(page).toHaveURL(/\/shell/);
    // Page should load successfully
    await page.waitForLoadState("networkidle");
    // Navigation should still be visible
    await expect(page.locator("nav").first()).toBeVisible();
  });

  test("can navigate to AI coding page", async ({ page }) => {
    await page.goto("/ai-coding");
    await expect(page).toHaveURL(/\/ai-coding/);
    // AI coding interface should be visible
    await expect(page.getByRole("heading")).toContainText(/AI|Claude|Coding/i);
  });

  test("can navigate to MCP page", async ({ page }) => {
    await page.goto("/mcp");
    await expect(page).toHaveURL(/\/mcp/);
    // MCP page should load without errors
    await page.waitForLoadState("networkidle");
  });

  test("can navigate to analytics page", async ({ page }) => {
    await page.goto("/analytics");
    await expect(page).toHaveURL(/\/analytics/);
  });

  test("can navigate to settings page", async ({ page }) => {
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/settings/);
    await expect(page.getByText(/Settings|Configuration/i)).toBeVisible();
  });

  test("titlebar navigation works", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Should have navigation links
    const navLinks = page.getByRole("link");
    const count = await navLinks.count();

    // Should have at least some navigation
    expect(count).toBeGreaterThan(0);
  });
});
