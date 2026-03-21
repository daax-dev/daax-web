/* eslint-disable react-hooks/rules-of-hooks */
/**
 * Auth Fixtures for Playwright E2E Tests
 *
 * Provides authenticated and unauthenticated API request contexts
 * for testing auth behavior against a live Traefik+PocketID deployment.
 */

import { test as base, type APIRequestContext } from "@playwright/test";

type AuthFixtures = {
  /** API context with auth cookies (from storageState) */
  authenticatedRequest: APIRequestContext;
  /** API context without any cookies */
  unauthenticatedRequest: APIRequestContext;
};

export const test = base.extend<AuthFixtures>({
  authenticatedRequest: async ({ playwright }, use) => {
    const baseURL = process.env.DAAX_AUTH_BASE_URL;
    if (!baseURL) throw new Error("DAAX_AUTH_BASE_URL required");

    const context = await playwright.request.newContext({
      baseURL,
      storageState: "tests/e2e/.auth/user.json",
    });

    await use(context);
    await context.dispose();
  },

  unauthenticatedRequest: async ({ playwright }, use) => {
    const baseURL = process.env.DAAX_AUTH_BASE_URL;
    if (!baseURL) throw new Error("DAAX_AUTH_BASE_URL required");

    const context = await playwright.request.newContext({
      baseURL,
      // No storageState = no cookies = unauthenticated
    });

    await use(context);
    await context.dispose();
  },
});

export { expect } from "@playwright/test";
