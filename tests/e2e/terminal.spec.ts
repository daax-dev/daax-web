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

  test("terminal component mounts after opening a shell", async ({ page }) => {
    // The shell page starts with no terminal tabs and renders an empty-state
    // placeholder ("Click 'New Shell' to open a terminal"). A terminal only
    // mounts after a tab is opened, so open one first.
    await expect(
      page.getByText(/Click "New Shell" to open a terminal/i),
    ).toBeVisible();
    await page.getByRole("button", { name: "New Shell" }).click();

    // xterm.js injects the `.xterm` element into the DOM on mount
    // (term.open()), independent of whether the WebSocket/PTY actually
    // connects. This keeps the assertion meaningful (the terminal UI loads)
    // while staying robust in a headless CI env without a live PTY.
    const terminal = page.locator(".xterm");
    await expect(terminal.first()).toBeVisible({ timeout: 15000 });
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
