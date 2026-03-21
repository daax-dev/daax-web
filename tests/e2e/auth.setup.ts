/**
 * Playwright Auth Setup - Pocket ID OIDC
 *
 * Authenticates using a Pocket ID one-time-access-token (OAT)
 * and saves browser state (cookies/storage) for use by authenticated test projects.
 *
 * Requires:
 *   DAAX_AUTH_BASE_URL     - Base URL of daax behind Traefik (e.g., https://daax.galway.poley.dev)
 *   POCKET_ID_OAT_COMMAND  - Shell command that outputs a one-time-access-token URL
 *                            (e.g., "ssh galway 'cd ~/jarvis/ps/auth.poley.dev && docker compose exec pocket-id /app/pocket-id one-time-access-token jpoley'")
 */

import { test as setup, expect } from "@playwright/test";
import { execSync } from "child_process";

const AUTH_FILE = "tests/e2e/.auth/user.json";

setup("authenticate via Pocket ID OAT", async ({ page }) => {
  const baseUrl = process.env.DAAX_AUTH_BASE_URL;
  const oatCommand = process.env.POCKET_ID_OAT_COMMAND;

  if (!baseUrl) {
    throw new Error(
      "DAAX_AUTH_BASE_URL is required for auth setup. " +
        "Set it to the Traefik-fronted daax URL (e.g., https://daax.galway.poley.dev)"
    );
  }

  if (!oatCommand) {
    throw new Error(
      "POCKET_ID_OAT_COMMAND is required for auth setup. " +
        'It should output a URL like "https://auth.galway.poley.dev/lc/oat/<token>"'
    );
  }

  // 1. Generate one-time-access-token
  console.log("Generating Pocket ID one-time-access-token...");
  const oatOutput = execSync(oatCommand, { encoding: "utf-8" }).trim();

  // Extract the URL from the command output
  // OAT command may output extra text; find the URL line
  const urlMatch = oatOutput.match(/https?:\/\/\S+/);
  if (!urlMatch) {
    throw new Error(
      `Could not find URL in OAT command output:\n${oatOutput}`
    );
  }
  const oatUrl = urlMatch[0];
  console.log(`OAT URL: ${oatUrl}`);

  // 2. Navigate to the OAT URL - this authenticates the browser session
  await page.goto(oatUrl, { waitUntil: "networkidle" });

  // 3. After OAT login, Pocket ID should redirect back.
  //    Navigate to daax to ensure the auth cookie works with daax's domain
  await page.goto(baseUrl, { waitUntil: "networkidle" });

  // 4. Verify we're authenticated by checking for absence of login redirect
  //    The page should load daax content, not redirect to auth provider
  const url = page.url();
  expect(url).toContain(new URL(baseUrl).hostname);

  // 5. Save authenticated state
  await page.context().storageState({ path: AUTH_FILE });
  console.log(`Auth state saved to ${AUTH_FILE}`);
});
