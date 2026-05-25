/**
 * Authenticated Navigation Tests
 *
 * Verifies all pages load correctly when authenticated via Pocket ID.
 * Checks for absence of error banners and console 401 errors.
 *
 * Requires: DAAX_AUTH_BASE_URL, auth-setup project to have run first.
 */

import { test, expect } from "@playwright/test";

const PAGES = [
  { path: "/", name: "Homepage" },
  { path: "/shell", name: "Shell" },
  { path: "/ai-coding", name: "AI Coding" },
  { path: "/mcp", name: "MCP" },
  { path: "/analytics", name: "Analytics" },
  { path: "/settings", name: "Settings" },
  { path: "/backlog", name: "Backlog" },
  { path: "/testcontainers", name: "Test Containers" },
];

test.describe("Authenticated Page Navigation", () => {
  for (const { path, name } of PAGES) {
    test(`${name} (${path}) loads without errors`, async ({ page }) => {
      // Collect console errors
      const consoleErrors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") {
          consoleErrors.push(msg.text());
        }
      });

      // Collect failed network requests
      const failedRequests: { url: string; status: number }[] = [];
      page.on("response", (response) => {
        if (response.status() === 401 || response.status() === 429) {
          failedRequests.push({
            url: response.url(),
            status: response.status(),
          });
        }
      });

      const response = await page.goto(path, { waitUntil: "networkidle" });

      // Page should load (200, not redirect to login)
      expect(response?.status()).toBe(200);

      // Should not have been redirected to the auth provider
      expect(page.url()).not.toContain("auth.galway.poley.dev");
      expect(page.url()).not.toContain("auth.poley.dev/authorize");

      // No 401 errors in network requests
      const auth401s = failedRequests.filter((r) => r.status === 401);
      expect(
        auth401s,
        `Found 401 errors: ${auth401s.map((r) => r.url).join(", ")}`,
      ).toHaveLength(0);

      // No 429 rate limit errors
      const rateLimits = failedRequests.filter((r) => r.status === 429);
      expect(
        rateLimits,
        `Found 429 rate-limit errors: ${rateLimits.map((r) => r.url).join(", ")}`,
      ).toHaveLength(0);
    });
  }

  test("Backlog page renders tasks without error banner", async ({ page }) => {
    await page.goto("/backlog", { waitUntil: "networkidle" });

    // Wait for content to load
    await page.waitForTimeout(2000);

    // Check there's no error message visible
    const errorBanner = page.locator('[class*="destructive"]').first();
    const hasError = await errorBanner.isVisible().catch(() => false);

    if (hasError) {
      const errorText = await errorBanner.textContent();
      // Fail with the actual error text for debugging
      expect(errorText).toBeFalsy();
    }
  });
});
