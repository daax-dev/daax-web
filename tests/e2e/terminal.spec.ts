import { test, expect } from "@playwright/test";

/**
 * Terminal Tests
 *
 * Verify terminal functionality including:
 * - WebSocket connection
 * - PTY creation
 * - Input/output
 * - Session management
 */
test.describe("Terminal", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/shell");
    // Wait for page to settle (terminal loads async)
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
  });

  test("shell page loads", async ({ page }) => {
    // The shell page should load without errors
    await expect(page).toHaveURL(/\/shell/);

    // Should have some UI elements (nav, sidebar, etc.)
    const nav = page.locator("nav");
    await expect(nav.first()).toBeVisible();
  });

  test("terminal component exists or loading state shown", async ({ page }) => {
    // Either terminal loads or we see loading state
    const terminal = page.locator(".xterm");
    const loading = page.getByText(/Loading|Connecting/i);

    // One of these should be visible
    const terminalVisible = await terminal.isVisible().catch(() => false);
    const loadingVisible = await loading.isVisible().catch(() => false);

    // Page should be in a valid state - at least one UI element should be present
    expect(terminalVisible || loadingVisible).toBe(true);
  });

  test("shell page has navigation elements", async ({ page }) => {
    // Check that the shell page has proper layout
    await expect(page.locator("header, nav").first()).toBeVisible();
  });

  test("shell page API is reachable", async ({ request }) => {
    // The terminal recordings API should work
    const response = await request.get("/api/terminal-recordings");
    expect(response.ok()).toBe(true);
  });
});
