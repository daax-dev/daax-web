import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E Test Configuration for Daax
 *
 * Run tests with:
 *   bun run test:e2e          # Run all E2E tests (local, no auth)
 *   bun run test:e2e:ui       # Run with UI mode
 *   bun run test:e2e:debug    # Run with debugging
 *
 * Auth tests (requires Traefik + Pocket ID deployment):
 *   DAAX_AUTH_BASE_URL=https://daax.galway.poley.dev \
 *   POCKET_ID_OAT_COMMAND="ssh galway '...'" \
 *   bun run test:e2e -- --project=auth-setup --project=authenticated --project=unauthenticated
 *
 * Environment variables:
 *   DAAX_BASE_URL         - Base URL of daax (default: http://localhost:4200)
 *   DAAX_AUTH_BASE_URL    - Base URL for auth tests (enables auth projects when set)
 *   POCKET_ID_OAT_COMMAND - Command to generate Pocket ID one-time-access-token
 *   CI                    - Set in CI environments
 */

const authBaseUrl = process.env.DAAX_AUTH_BASE_URL;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["html", { outputFolder: "playwright-report" }], ["list"]],

  use: {
    baseURL: process.env.DAAX_BASE_URL || "http://localhost:4200",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "on-first-retry",
  },

  projects: [
    // --- Local tests (no auth required) ---
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: /auth[-.]/, // Skip auth test files
    },

    // --- Auth tests (gated behind DAAX_AUTH_BASE_URL) ---
    ...(authBaseUrl
      ? [
          {
            name: "auth-setup",
            testMatch: /auth\.setup\.ts/,
            use: {
              ...devices["Desktop Chrome"],
              baseURL: authBaseUrl,
            },
          },
          {
            name: "authenticated",
            testMatch: /\.auth\.spec\.ts$/,
            dependencies: ["auth-setup"],
            use: {
              ...devices["Desktop Chrome"],
              baseURL: authBaseUrl,
              storageState: "tests/e2e/.auth/user.json",
            },
          },
          {
            name: "unauthenticated",
            testMatch: /\.noauth\.spec\.ts$/,
            use: {
              ...devices["Desktop Chrome"],
              baseURL: authBaseUrl,
              // No storageState = no auth cookies
            },
          },
        ]
      : []),
  ],

  // Start the daax server before running tests (only in development)
  webServer: process.env.CI
    ? undefined
    : {
        command: "bun dev",
        url: "http://localhost:4200",
        reuseExistingServer: true,
        timeout: 60000,
      },
});
