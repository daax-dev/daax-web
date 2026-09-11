import { test, expect } from "@playwright/test";

/**
 * Ghostty Terminal Tests
 *
 * The /shell page can open either an xterm.js tab (default) or a Ghostty tab.
 * The Ghostty path is the only place daax instantiates WebAssembly at runtime:
 * GhosttyTerminal.tsx dynamically imports ghostty-web, awaits init() (which
 * fetches and instantiates ghostty-vt.wasm), and only then constructs the
 * Terminal and calls open(), which injects the <canvas>.
 *
 * A visible canvas therefore proves the WASM module loaded and the renderer
 * mounted — the assertion that catches a bad ghostty-web upgrade or a missing
 * wasm asset. Like terminal.spec.ts, this deliberately does not require a live
 * PTY, so it stays meaningful in a headless CI env.
 */
test.describe("Ghostty Terminal", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/shell");
    await page.waitForLoadState("networkidle");
  });

  test("ghostty terminal mounts and instantiates WebAssembly", async ({
    page,
  }) => {
    // Switch the default terminal type from xterm to Ghostty, then open a tab.
    await page.getByRole("radio", { name: "Use Ghostty" }).click();
    await page.getByRole("button", { name: "New Ghostty" }).click();

    // term.open() runs only after `await init()` resolves, so the canvas is
    // proof the wasm module instantiated.
    await expect(page.locator("canvas").first()).toBeVisible({
      timeout: 30000,
    });

    // The component swaps in an error panel if the dynamic import or init()
    // throws; it must not appear.
    await expect(
      page.getByText("Failed to load Ghostty Terminal"),
    ).toBeHidden();
  });
});
