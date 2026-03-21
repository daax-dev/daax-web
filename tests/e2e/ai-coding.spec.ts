import { test, expect } from "@playwright/test";

/**
 * AI Coding Tests
 *
 * Verify AI coding features including:
 * - Agent selection (Claude, Aider, etc.)
 * - Session creation
 * - Project selection
 * - Terminal integration
 */
test.describe("AI Coding", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/ai-coding");
  });

  test("AI coding page loads with agent options", async ({ page }) => {
    // Should show agent selection options
    await expect(
      page.getByText(/Claude|Aider|Gemini|Copilot|OpenCode/i).first()
    ).toBeVisible({ timeout: 10000 });
  });

  test("can select a project for AI coding", async ({ page }) => {
    // Look for project selector
    const projectSelector = page.locator(
      'select, [role="combobox"], [data-testid="project-selector"]'
    );

    if ((await projectSelector.count()) > 0) {
      await projectSelector.first().click();
      await page.waitForTimeout(500);

      // Selector should open without errors - check for options or empty state message
      const options = page.locator('[role="option"], option');
      const emptyState = page.getByText(/No projects|Select a project|Empty/i);
      const hasOptions = (await options.count()) > 0;
      const hasEmptyState = await emptyState.isVisible().catch(() => false);
      // Either options are shown or an empty state indicator is present
      expect(hasOptions || hasEmptyState).toBe(true);
    }
  });

  test("can start an AI coding session", async ({ page }) => {
    // Find and click a start/launch button
    const startButton = page.locator(
      'button:has-text("Start"), button:has-text("Launch"), button:has-text("New Session")'
    );

    if ((await startButton.count()) > 0) {
      await startButton.first().click();
      await page.waitForTimeout(2000);

      // Should navigate to session or show terminal
      const terminal = page.locator(".xterm");
      // Either shows terminal or shows session info
      const hasTerminal = (await terminal.count()) > 0;
      const hasSession = await page.getByText(/Session|Running|Active/i).isVisible();

      expect(hasTerminal || hasSession).toBe(true);
    }
  });

  test("AI session list shows active sessions", async ({ page }) => {
    // Look for sessions list/sidebar
    const sessionsList = page.locator(
      '[data-testid="sessions-list"], .sessions-sidebar, aside'
    );

    if ((await sessionsList.count()) > 0) {
      // Sessions panel should be accessible
      await expect(sessionsList.first()).toBeVisible();
    }
  });
});
