import { test, expect } from "@playwright/test";

/**
 * Agent View in Settings: the tab can be reordered.
 *
 * config.toml ships an order for the AI Coding sub-features that predates
 * Agent View (and Sessions). The settings page's drag handler used to compute
 * positions against that stored order alone, so dropping a tab it did not list
 * found no index and did nothing — silently. The handler now appends anything
 * the stored order omits, the same rule the titlebar renders by.
 *
 * Needs no daemon: this is the settings page and the titlebar only.
 */
test.describe("Agent View can be reordered in settings", () => {
  // Tall enough that the expanded sub-feature list is on screen: a native
  // drag onto a row below the fold does not reach it.
  test.use({ viewport: { width: 1440, height: 1000 } });

  test("dragging Agent View above Coding Agents moves it to the front of the AI Coding nav", async ({
    page,
  }) => {
    // The plugin list lives on the Admin tab, which the host-dev operator is
    // (GET /api/auth/access answers isAdmin for a trusted local operator).
    await page.goto("/settings?tab=admin");
    await expect(
      page.getByRole("heading", { name: "Settings", level: 1 }),
    ).toBeVisible({ timeout: 30_000 });

    // The AI Coding plugin row, expanded to show its sub-features.
    const pluginRow = page
      .locator('[draggable="true"]', { hasText: "AI Coding" })
      .first();
    await expect(pluginRow).toBeVisible();
    await pluginRow.locator("button").first().click();

    const agentView = page
      .locator('[draggable="true"]', { hasText: "Agent View" })
      .first();
    const codingAgents = page
      .locator('[draggable="true"]', { hasText: "Coding Agents" })
      .first();
    await expect(agentView).toBeVisible();
    await expect(codingAgents).toBeVisible();

    // The sub-feature names in list order, read from the DOM each time.
    const names = () =>
      page.locator('[draggable="true"] .font-medium.text-sm').allTextContents();
    const indexOf = async (name: string) => (await names()).indexOf(name);

    // Before: Agent View is below Coding Agents in the list.
    expect(await indexOf("Agent View")).toBeGreaterThan(
      await indexOf("Coding Agents"),
    );

    await agentView.dragTo(codingAgents);

    // The list itself reorders at once; the drop is what used to be ignored.
    await expect
      .poll(
        async () =>
          (await indexOf("Agent View")) < (await indexOf("Coding Agents")),
      )
      .toBe(true);

    // Persisting is a separate, explicit act on this page.
    // Dispatched rather than pointed at: the button sits at the foot of a
    // long page that keeps re-laying out while the list above it settles, and
    // a pointer click never finds it stable. What this test is about is the
    // order that gets saved, not the reachability of the Save button.
    const save = page.getByRole("button", { name: "Save Settings" });
    await expect(save).toBeEnabled();
    await save.dispatchEvent("click");

    // After: the stored order names agentview first...
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const raw = localStorage.getItem("daax-settings");
          if (!raw) return null;
          const parsed = JSON.parse(raw) as {
            subFeatureOrder?: Record<string, string[]>;
          };
          return parsed.subFeatureOrder?.["ai-coding"]?.[0] ?? null;
        }),
      )
      .toBe("agentview");

    // ...and the AI Coding nav renders it first, on a fresh navigation.
    await page.goto("/agentview");
    const link = (name: string) =>
      page.getByRole("link", { name, exact: true }).first();
    await expect(link("Agent View")).toBeVisible();
    const [av, ca] = await Promise.all([
      link("Agent View").boundingBox(),
      link("Coding Agents").boundingBox(),
    ]);
    expect(av!.x).toBeLessThan(ca!.x);
  });
});
