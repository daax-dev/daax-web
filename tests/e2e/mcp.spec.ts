import { test, expect } from "@playwright/test";

/**
 * MCP (Model Context Protocol) Tests
 *
 * Verify MCP catalog and management features.
 */
test.describe("MCP Management", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/mcp");
  });

  test("MCP page loads", async ({ page }) => {
    await expect(page).toHaveURL(/\/mcp/);
    // Should have MCP-related content
    await expect(page.getByText(/MCP|Servers|Protocol/i).first()).toBeVisible({
      timeout: 10000,
    });
  });

  test("shows MCP page content", async ({ page }) => {
    // Wait for page to settle
    await page.waitForLoadState("networkidle");

    // Page should have loaded without errors - verify main content is visible
    const mainContent = page.locator("main, [role='main'], .content").first();
    await expect(mainContent).toBeVisible({ timeout: 10000 });
  });

  test("can search/filter MCP servers", async ({ page }) => {
    const searchInput = page.locator(
      'input[type="search"], input[placeholder*="Search"], input[placeholder*="Filter"]',
    );

    if ((await searchInput.count()) > 0) {
      await searchInput.fill("test");
      await page.waitForTimeout(500);

      // Search should work without errors
      const hasError = await page.getByText(/Error|Failed/i).isVisible();
      expect(hasError).toBe(false);
    }
  });

  test("MCP gateway API works", async ({ request }) => {
    const response = await request.get("/api/mcp/gateway");
    expect(response.status()).toBeLessThan(500);
  });
});
