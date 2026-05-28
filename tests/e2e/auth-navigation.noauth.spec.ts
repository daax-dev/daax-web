/**
 * Unauthenticated Navigation Tests
 *
 * Verifies pages redirect to Pocket ID login when accessed without auth.
 * The redirect URL should point back to daax after login.
 *
 * Requires: DAAX_AUTH_BASE_URL
 */

import { test, expect } from "@playwright/test";

const PAGES = [
  { path: "/", name: "Homepage" },
  { path: "/shell", name: "Shell" },
  { path: "/ai-coding", name: "AI Coding" },
  { path: "/backlog", name: "Backlog" },
  { path: "/settings", name: "Settings" },
];

test.describe("Unauthenticated Page Navigation", () => {
  for (const { path, name } of PAGES) {
    test(`${name} (${path}) redirects to Pocket ID login`, async ({ page }) => {
      // Don't follow redirects automatically so we can inspect the redirect chain
      const response = await page.goto(path, { waitUntil: "commit" });

      // Traefik ForwardAuth will redirect to Pocket ID OIDC login page
      // After the redirect chain, we should end up on the auth provider
      await page.waitForURL(/auth/, { timeout: 10000 }).catch(() => {
        // Some setups may return 401 directly instead of redirecting
      });

      const finalUrl = page.url();

      // Should either redirect to auth provider or get blocked
      const isRedirectedToAuth =
        finalUrl.includes("auth.galway.poley.dev") ||
        finalUrl.includes("auth.poley.dev");
      const isBlocked = response?.status() === 401;

      expect(
        isRedirectedToAuth || isBlocked,
        `Expected redirect to auth or 401, got ${response?.status()} at ${finalUrl}`,
      ).toBe(true);

      // If redirected, the redirect URL should contain a reference back to daax
      if (isRedirectedToAuth) {
        // The OIDC redirect_uri should point back to daax
        const url = new URL(finalUrl);
        const redirectUri =
          url.searchParams.get("redirect_uri") ||
          url.searchParams.get("rd") ||
          "";
        // The redirect should go back to the daax domain
        if (redirectUri) {
          expect(redirectUri).toContain("daax");
        }
      }
    });
  }
});
