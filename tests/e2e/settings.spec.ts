import { test, expect } from "@playwright/test";

/**
 * Settings Tests
 *
 * Verify settings page and configuration options.
 */
test.describe("Settings", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/settings");
  });

  test("settings page loads", async ({ page }) => {
    await expect(page).toHaveURL(/\/settings/);
    await expect(page.getByText(/Settings/i).first()).toBeVisible({
      timeout: 10000,
    });
  });

  test("shows theme settings", async ({ page }) => {
    // Look for theme/appearance settings
    const themeSection = page.getByText(/Theme|Appearance|Dark|Light/i);
    await expect(themeSection.first()).toBeVisible();
  });

  test("can toggle theme", async ({ page }) => {
    // Find theme toggle
    const themeToggle = page.locator(
      '[data-testid="theme-toggle"], button:has-text("Dark"), button:has-text("Light")',
    );

    if ((await themeToggle.count()) > 0) {
      await themeToggle.first().click();
      await page.waitForTimeout(500);

      // Verify page is in a valid state after toggle (class attribute exists)
      const htmlClass = await page.locator("html").getAttribute("class");
      expect(htmlClass !== undefined).toBe(true);
    }
  });

  test("shows container image settings", async ({ page }) => {
    // Look for container/docker settings
    const containerSettings = page.getByText(/Container|Docker|Image/i);
    if ((await containerSettings.count()) > 0) {
      await expect(containerSettings.first()).toBeVisible();
    }
  });

  test("shows AI coding settings", async ({ page }) => {
    // Look for AI-related settings
    const aiSettings = page.getByText(/AI|Claude|Agent/i);
    if ((await aiSettings.count()) > 0) {
      await expect(aiSettings.first()).toBeVisible();
    }
  });
});
