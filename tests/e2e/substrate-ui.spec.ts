import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

/**
 * Substrate controls in AI Coding (dx#123), end to end against a live dev
 * cluster. OPT-IN: DAAX_SUBSTRATE_E2E=1, with daax running in host-dev mode
 * (loopback operator) with the substrate backend on, e.g.
 *
 *   DAAX_SUBSTRATE_ENABLED=1 DAAX_SUBSTRATE_ATESPACE=kinsale
 *   DAAX_SUBSTRATE_KUBECONFIG=~/.kube-substrate/config (never ~/.kube/config)
 *   DAAX_SUBSTRATE_TEMPLATES_FILE=<templates.env with TEMPLATE_DAAX_CLAUDE_*>
 *   DAAX_SUBSTRATE_GATEWAY_NAMESPACE=<THROWAWAY namespace with a placeholder
 *     llm-upstream Secret and an `llm` Deployment; never a live gateway>
 *   DATABASE_URL=<throwaway Postgres>
 *
 * DAAX_SUBSTRATE_E2E_GATEWAY_NS must name the same throwaway namespace (the
 * spec reads the Secret's field managers there). DAAX_SUBSTRATE_E2E_SHOTS is
 * where light/dark screenshots of each screen are written.
 *
 * Walks: launcher (inline egress error) -> create -> running tab attached ->
 * close tab (detach, still running) -> reattach (same shell) -> egress editor
 * (policy updated on the actor) -> suspend -> resume (same shell) -> admin
 * provider key (never echoed, per-provider field manager) -> audit -> End.
 */
const enabled = process.env.DAAX_SUBSTRATE_E2E === "1";
const KUBECONFIG = process.env.DAAX_SUBSTRATE_KUBECONFIG ?? "";
const ATESPACE = process.env.DAAX_SUBSTRATE_ATESPACE ?? "kinsale";
const GATEWAY_NS = process.env.DAAX_SUBSTRATE_E2E_GATEWAY_NS ?? "";
const SHOTS =
  process.env.DAAX_SUBSTRATE_E2E_SHOTS ?? "test-results/substrate-shots";
const TEST_KEY = `sk-e2e-placeholder-${Date.now()}`;

test.describe.configure({ mode: "serial" });
test.skip(!enabled, "set DAAX_SUBSTRATE_E2E=1 (live substrate dev cluster)");

function ate(args: string[]): string {
  return execFileSync("kubectl-ate", ["--kubeconfig", KUBECONFIG, ...args], {
    env: { ...process.env, KUBECONFIG },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function kubectl(args: string[]): string {
  return execFileSync("kubectl", ["--kubeconfig", KUBECONFIG, ...args], {
    env: { ...process.env, KUBECONFIG },
    encoding: "utf8",
  });
}

async function setTheme(page: Page, theme: "light" | "dark") {
  await page.evaluate((t) => {
    localStorage.setItem("theme", t);
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(t);
    document.documentElement.style.colorScheme = t;
  }, theme);
  await page.waitForTimeout(150);
}

async function shot(page: Page, name: string) {
  mkdirSync(SHOTS, { recursive: true });
  for (const t of ["light", "dark"] as const) {
    await setTheme(page, t);
    await page.screenshot({ path: join(SHOTS, `${name}-${t}.png`) });
  }
  await setTheme(page, "dark");
}

/** Text currently rendered by the xterm DOM renderer. */
const xtermText = (page: Page) =>
  page.locator(".xterm-rows").first().innerText();

async function typeInTerminal(page: Page, text: string) {
  await page.locator(".xterm").first().click();
  await page.keyboard.type(text, { delay: 15 });
}

let sessionId = "";
let actorName = "";

test.use({ viewport: { width: 1440, height: 900 } });

test("launch, attach, detach, reattach, egress, suspend/resume, admin, End", async ({
  page,
}) => {
  test.setTimeout(600_000);

  // ---- Substrate page, empty or with sessions ---------------------------
  await page.goto("/ai-coding/substrate");
  await expect(page.getByRole("heading", { name: "Substrate" })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByRole("link", { name: "Substrate" })).toBeVisible();
  await shot(page, "01-substrate-sessions-before");

  // ---- Launcher ---------------------------------------------------------
  await page.getByRole("button", { name: "Launch", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Launch New Agent")).toBeVisible();
  await expect(dialog.getByLabel("Substrate")).toBeChecked();
  await expect(
    dialog.getByText(/nono in-sandbox policy is active only on microVM/),
  ).toBeVisible();
  await expect(dialog.getByTestId("launch-template")).toHaveText(
    /daax-claude-gvisor-/,
  );
  await dialog.getByLabel(/Codex CLI/).click();
  await expect(dialog.getByTestId("launch-template")).toHaveText(
    /No ActorTemplate/,
  );
  await expect(dialog.getByRole("button", { name: "Launch" })).toBeDisabled();
  await dialog.getByLabel(/Claude Code/).click();

  await dialog.getByLabel("npm").click();
  await dialog.getByPlaceholder(/api\.example\.com/).fill("10.0.0.1");
  await dialog.getByRole("button", { name: "Add host" }).click();
  await expect(dialog.getByText(/IP addresses are not allowed/)).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Launch" })).toBeDisabled();
  await shot(page, "02-launcher-inline-egress-error");
  await dialog.getByRole("button", { name: "Remove 10.0.0.1" }).click();
  await dialog
    .getByPlaceholder(/api\.example\.com/)
    .fill("registry.yarnpkg.com");
  await dialog.getByRole("button", { name: "Add host" }).click();
  await dialog.getByLabel("Branch").fill("agent/claude");
  await expect(dialog.getByRole("button", { name: "Launch" })).toBeEnabled({
    timeout: 15_000,
  });
  await shot(page, "03-launcher-substrate");

  const created = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/substrate/sessions") &&
      r.request().method() === "POST",
  );
  await dialog.getByRole("button", { name: "Launch" }).click();
  const createdBody = await (await created).json();
  expect((await created).status()).toBe(202);
  sessionId = createdBody.id;
  actorName = createdBody.actorName;
  expect(actorName).toMatch(/^daax-[0-9a-f]{10}$/);
  expect(createdBody.egressHosts).toEqual([
    "registry.npmjs.org",
    "registry.yarnpkg.com",
  ]);

  // ---- Running tab, attached -------------------------------------------
  const tabState = page
    .locator(`#substrate-tabpanel-${sessionId}`)
    .getByTestId("session-state");
  await expect(tabState).toHaveAttribute("data-state", "running", {
    timeout: 300_000,
  });
  await expect
    .poll(() => xtermText(page), { timeout: 90_000 })
    .toMatch(/Attached to persistent session/);
  await page.waitForTimeout(3000);
  // The template's AGENT runs in tmux window 0; open a shell window
  // (C-b c), as the #527 ptyd integration test does.
  await page.locator(".xterm").first().click();
  await page.keyboard.press("Control+b");
  await page.keyboard.type("c");
  await page.waitForTimeout(1500);
  await typeInTerminal(page, "export E2EVAR=kept-$((6*7))\n");
  await typeInTerminal(page, "echo marker-$E2EVAR\n");
  await expect
    .poll(() => xtermText(page), { timeout: 30_000 })
    .toMatch(/marker-kept-42/);
  await expect(page.getByText("provisional").first()).toBeVisible();
  await shot(page, "04-session-tab-running");

  // ---- Close the tab: detach only ---------------------------------------
  await page.getByRole("button", { name: /Close tab \(detach/ }).click();
  await expect(
    page.getByText(/Detached\. The session keeps running/),
  ).toBeVisible();
  const row = page.locator(`[data-session="${sessionId}"]`);
  await expect(row.getByTestId("session-state")).toHaveAttribute(
    "data-state",
    "running",
  );
  expect(
    ate(["get", "actor", actorName, "-a", ATESPACE, "-o", "json"]),
  ).toMatch(/RUNNING/);
  await shot(page, "05-sessions-list-after-detach");

  // ---- Reattach: same shell ---------------------------------------------
  await row.getByRole("button", { name: /Attach/ }).click();
  await expect
    .poll(() => xtermText(page), { timeout: 90_000 })
    .toMatch(/Attached to persistent session/);
  await page.waitForTimeout(2000);
  await typeInTerminal(page, "echo again-$E2EVAR\n");
  await expect
    .poll(() => xtermText(page), { timeout: 30_000 })
    .toMatch(/again-kept-42/);

  // ---- Egress editor ----------------------------------------------------
  await page.getByRole("button", { name: "Egress", exact: true }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText("Egress allowlist")).toBeVisible();
  await expect(sheet.getByTestId("egress-current")).toContainText(
    "registry.yarnpkg.com",
  );
  await sheet.getByLabel("PyPI").click();
  await sheet
    .getByRole("button", { name: "Remove registry.yarnpkg.com" })
    .click();
  await expect(
    sheet.getByRole("button", { name: "Save allowlist" }),
  ).toBeEnabled({ timeout: 15_000 });
  await shot(page, "06-egress-editor");
  await sheet.getByRole("button", { name: "Save allowlist" }).click();
  await expect(page.getByText("Egress allowlist updated.")).toBeVisible({
    timeout: 60_000,
  });
  const pol = JSON.parse(
    ate(["get", "egress-policy", actorName, "-a", ATESPACE, "-o", "json"]),
  );
  const tls = pol.rules.find(
    (r: { tlsPassthrough?: unknown }) => r.tlsPassthrough,
  ).tlsPassthrough;
  expect(tls.hostnames).toEqual([
    "files.pythonhosted.org",
    "pypi.org",
    "registry.npmjs.org",
  ]);
  expect(pol.rules[0].http.hostnames).toHaveLength(1);

  // ---- Suspend / resume -------------------------------------------------
  await page.getByRole("button", { name: "Suspend" }).first().click();
  await expect(tabState).toHaveAttribute("data-state", "suspended", {
    timeout: 300_000,
  });
  await expect(page.getByTestId("session-detached-panel")).toContainText(
    /suspended/,
    {
      timeout: 300_000,
    },
  );
  await shot(page, "07-session-suspended");
  await page
    .getByTestId("session-detached-panel")
    .getByRole("button", { name: "Resume" })
    .click();
  await expect(tabState).toHaveAttribute("data-state", "running", {
    timeout: 300_000,
  });
  await expect
    .poll(() => xtermText(page), { timeout: 120_000 })
    .toMatch(/Attached to persistent session/);
  await page.waitForTimeout(2000);
  await typeInTerminal(page, "echo resumed-$E2EVAR\n");
  await expect
    .poll(() => xtermText(page), { timeout: 30_000 })
    .toMatch(/resumed-kept-42/);

  // ---- Sessions list (admin: owner column) ------------------------------
  await page.getByRole("tab", { name: /Sessions/ }).click();
  await expect(page.getByText("Owner")).toBeVisible();
  await shot(page, "08-sessions-list-admin");

  // ---- Admin: provider keys + audit -------------------------------------
  await page.goto("/ai-coding/admin");
  await expect(
    page.getByRole("heading", { name: "AI Coding Admin" }),
  ).toBeVisible({
    timeout: 60_000,
  });
  const openai = page.getByTestId("provider-openai");
  await expect(openai.getByTestId("provider-key-chip")).toHaveAttribute(
    "data-set",
    "false",
    {
      timeout: 30_000,
    },
  );
  await shot(page, "09-admin-keys-unset");
  await openai.getByLabel("OpenAI API key").fill(TEST_KEY);
  const put = page.waitForResponse((r) =>
    r.url().includes("/provider-keys/openai"),
  );
  await openai.getByRole("button", { name: "Save" }).click();
  const putRes = await put;
  expect(await putRes.text()).not.toContain(TEST_KEY);
  await expect(openai.getByTestId("provider-key-chip")).toHaveAttribute(
    "data-set",
    "true",
    {
      timeout: 30_000,
    },
  );
  await expect(openai.getByLabel("OpenAI API key")).toHaveValue("");
  expect(await page.content()).not.toContain(TEST_KEY);
  // Anthropic (`key`) untouched; OpenAI owned by its own field manager.
  const secret = JSON.parse(
    kubectl([
      "-n",
      GATEWAY_NS,
      "get",
      "secret",
      "llm-upstream",
      "-o",
      "json",
      "--show-managed-fields",
    ]),
  );
  expect(Buffer.from(secret.data.key, "base64").toString()).toBe("unset");
  expect(Buffer.from(secret.data.openai, "base64").toString()).toBe(TEST_KEY);
  const managers = (
    secret.metadata.managedFields as Array<{
      manager: string;
      fieldsV1: unknown;
    }>
  )
    .filter((m) => JSON.stringify(m.fieldsV1).includes("f:openai"))
    .map((m) => m.manager);
  expect(managers).toEqual(["daax-web-openai"]);
  expect(
    secret.metadata.annotations?.[
      "kubectl.kubernetes.io/last-applied-configuration"
    ],
  ).toBeUndefined();
  await page.getByRole("button", { name: "Refresh audit" }).click();
  await expect(page.getByTestId("audit-row").first()).toBeVisible();
  await expect(page.getByText("provider-key").first()).toBeVisible();
  expect(await page.content()).not.toContain(TEST_KEY);
  await shot(page, "10-admin-keys-and-audit");
  // Back to the placeholder.
  await openai.getByRole("button", { name: "Unset" }).click();
  await expect(openai.getByTestId("provider-key-chip")).toHaveAttribute(
    "data-set",
    "false",
    {
      timeout: 30_000,
    },
  );

  // ---- End session (confirmed) ------------------------------------------
  await page.goto("/ai-coding/substrate");
  const row2 = page.locator(`[data-session="${sessionId}"]`);
  await expect(row2).toBeVisible({ timeout: 60_000 });
  await row2.getByRole("button", { name: "End session" }).click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm.getByText("End this session?")).toBeVisible();
  await shot(page, "11-end-confirm");
  await confirm.getByRole("button", { name: "End session" }).click();
  await expect(row2).toHaveCount(0, { timeout: 300_000 });
  await expect
    .poll(
      () => {
        try {
          ate(["get", "actor", actorName, "-a", ATESPACE, "-o", "json"]);
          return "present";
        } catch {
          return "gone";
        }
      },
      { timeout: 120_000 },
    )
    .toBe("gone");
  actorName = "";
});

test.afterAll(() => {
  // Never leave a test actor behind (only the daax-<hex> this spec created).
  if (actorName && /^daax-[0-9a-f]{10}$/.test(actorName)) {
    try {
      ate(["delete", "egress-policy", actorName, "-a", ATESPACE]);
    } catch {
      /* already gone */
    }
    try {
      ate(["delete", "actor", actorName, "-a", ATESPACE]);
    } catch {
      /* already gone */
    }
  }
});
