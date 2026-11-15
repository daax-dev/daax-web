import { execFileSync } from "node:child_process";
import {
  expect,
  test,
  type APIRequestContext,
  type Browser,
  type Page,
} from "@playwright/test";

/**
 * Substrate sessions across tenants (dx#119 x dx#123), end to end against a
 * live dev cluster. OPT-IN: DAAX_SUBSTRATE_E2E=1 and DAAX_SUBSTRATE_E2E_TENANCY=1,
 * with the substrate-ui.spec.ts setup plus a forwarded-identity posture:
 *
 *   DAAX_PROXY_SECRET=<throwaway>   (the app trusts X-Forwarded-User with it)
 *   DAAX_WS_TOKEN_SECRET=<throwaway> (substrate attach tickets)
 *   DAAX_ADMIN_USERS=<DAAX_SUBSTRATE_E2E_ADMIN_SUB>
 *   DAAX_SUBSTRATE_E2E_PROXY_SECRET=<same as DAAX_PROXY_SECRET>
 *
 * Each browser context is one person, sending the headers traefik-forward-auth
 * would: two users with the default `user` role (A, B) and one admin.
 *
 * Walks: A launches, attaches, sets a shell variable, detaches, edits egress
 * -> B sees no such session, and every B request on it (get, attach,
 * suspend, resume, egress, End, DELETE) answers 404 with the actor untouched;
 * B's own session is invisible to A -> the admin sees both with their owners,
 * attaches to A's same shell, suspends, resumes and Ends A's session and B's.
 */
const enabled =
  process.env.DAAX_SUBSTRATE_E2E === "1" &&
  process.env.DAAX_SUBSTRATE_E2E_TENANCY === "1";
const KUBECONFIG = process.env.DAAX_SUBSTRATE_KUBECONFIG ?? "";
const ATESPACE = process.env.DAAX_SUBSTRATE_ATESPACE ?? "kinsale";
const PROXY_SECRET = process.env.DAAX_SUBSTRATE_E2E_PROXY_SECRET ?? "";
const SUB_A =
  process.env.DAAX_SUBSTRATE_E2E_USER_A_SUB ??
  "a1e2e000-0000-4000-8000-00000000000a";
const SUB_B =
  process.env.DAAX_SUBSTRATE_E2E_USER_B_SUB ??
  "b1e2e000-0000-4000-8000-00000000000b";
const SUB_ADMIN = process.env.DAAX_SUBSTRATE_E2E_ADMIN_SUB ?? "";

test.describe.configure({ mode: "serial" });
test.skip(
  !enabled,
  "set DAAX_SUBSTRATE_E2E=1 DAAX_SUBSTRATE_E2E_TENANCY=1 (live substrate dev cluster)",
);
test.use({ viewport: { width: 1440, height: 900 } });

function ate(args: string[]): string {
  return execFileSync("kubectl-ate", ["--kubeconfig", KUBECONFIG, ...args], {
    env: { ...process.env, KUBECONFIG },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

const actorState = (name: string) => {
  try {
    return ate(["get", "actor", name, "-a", ATESPACE, "-o", "json"]).match(
      /ACTOR_STATE_[A-Z]+|RUNNING|SUSPENDED/,
    )?.[0];
  } catch {
    return "gone";
  }
};

/** A browser context acting as one person behind the forward-auth gate. */
async function person(browser: Browser, sub: string, name: string) {
  const context = await browser.newContext({
    extraHTTPHeaders: {
      "x-forwarded-user": sub,
      "x-forwarded-username": name,
      "x-forwarded-email": `${name}@e2e.invalid`,
      "x-daax-proxy-secret": PROXY_SECRET,
    },
  });
  return { context, page: await context.newPage(), api: context.request };
}

const xtermText = (page: Page) =>
  page.locator(".xterm-rows").first().innerText();

async function typeInTerminal(page: Page, text: string) {
  await page.locator(".xterm").first().click();
  await page.keyboard.type(text, { delay: 15 });
}

async function attached(page: Page) {
  await expect
    .poll(() => xtermText(page), { timeout: 90_000 })
    .toMatch(/Attached to persistent session/);
  await page.waitForTimeout(2000);
}

async function createViaApi(api: APIRequestContext) {
  const res = await api.post("/api/substrate/sessions", {
    data: { agent: "claude", sandboxClass: "gvisor" },
  });
  expect(res.status()).toBe(202);
  return (await res.json()) as { id: string; actorName: string };
}

async function waitRunning(api: APIRequestContext, id: string) {
  await expect
    .poll(
      async () =>
        (await (await api.get(`/api/substrate/sessions/${id}`)).json()).state,
      { timeout: 300_000 },
    )
    .toBe("running");
}

const actors: string[] = [];

test("user B cannot reach user A's substrate session; the admin can do everything", async ({
  browser,
}) => {
  test.setTimeout(900_000);
  expect(PROXY_SECRET, "DAAX_SUBSTRATE_E2E_PROXY_SECRET").not.toBe("");
  expect(SUB_ADMIN, "DAAX_SUBSTRATE_E2E_ADMIN_SUB").not.toBe("");
  const a = await person(browser, SUB_A, "e2e-user-a");
  const b = await person(browser, SUB_B, "e2e-user-b");
  const adm = await person(browser, SUB_ADMIN, "e2e-admin");

  // ---- A launches through the UI, attaches, sets a variable -------------
  await a.page.goto("/ai-coding/substrate");
  await expect(a.page.getByRole("heading", { name: "Substrate" })).toBeVisible({
    timeout: 60_000,
  });
  await expect(a.page.getByText("Your substrate sessions.")).toBeVisible();
  await expect(a.page.getByRole("link", { name: "Admin" })).toHaveCount(0);
  await a.page.getByRole("button", { name: "Launch", exact: true }).click();
  const dialog = a.page.getByRole("dialog");
  await expect(dialog.getByLabel("Substrate")).toBeChecked();
  await dialog.getByLabel(/Claude Code/).click();
  await dialog.getByLabel("npm").click();
  await expect(dialog.getByRole("button", { name: "Launch" })).toBeEnabled({
    timeout: 15_000,
  });
  const created = a.page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/substrate/sessions") &&
      r.request().method() === "POST",
  );
  await dialog.getByRole("button", { name: "Launch" }).click();
  const sA = (await (await created).json()) as {
    id: string;
    actorName: string;
    ownerSubject: string;
  };
  actors.push(sA.actorName);
  expect(sA.ownerSubject).toBe(SUB_A);
  const tabState = a.page
    .locator(`#substrate-tabpanel-${sA.id}`)
    .getByTestId("session-state");
  await expect(tabState).toHaveAttribute("data-state", "running", {
    timeout: 300_000,
  });
  await attached(a.page);
  await a.page.locator(".xterm").first().click();
  await a.page.keyboard.press("Control+b");
  await a.page.keyboard.type("c");
  await a.page.waitForTimeout(1500);
  await typeInTerminal(a.page, "export TENANTVAR=a-owns-$((6*7))\n");
  await typeInTerminal(a.page, "echo mark-$TENANTVAR\n");
  await expect
    .poll(() => xtermText(a.page), { timeout: 30_000 })
    .toMatch(/mark-a-owns-42/);
  await a.page.getByRole("button", { name: /Close tab \(detach/ }).click();
  await expect(
    a.page.getByText(/Detached\. The session keeps running/),
  ).toBeVisible();

  // ---- B: nothing of A's is visible or reachable ------------------------
  await b.page.goto("/ai-coding/substrate");
  await expect(b.page.getByText("Your substrate sessions.")).toBeVisible({
    timeout: 60_000,
  });
  await expect(b.page.locator(`[data-session="${sA.id}"]`)).toHaveCount(0);
  const listB = await (await b.api.get("/api/substrate/sessions")).json();
  expect(listB.sessions.map((s: { id: string }) => s.id)).not.toContain(sA.id);
  const base = `/api/substrate/sessions/${sA.id}`;
  const probes: Array<[string, () => ReturnType<APIRequestContext["get"]>]> = [
    ["get", () => b.api.get(base)],
    ["attach", () => b.api.post(`${base}/attach`)],
    ["suspend", () => b.api.post(`${base}/suspend`)],
    ["resume", () => b.api.post(`${base}/resume`)],
    [
      "egress",
      () => b.api.put(`${base}/egress`, { data: { egressPresets: [] } }),
    ],
    ["end", () => b.api.post(`${base}/end`)],
    ["delete", () => b.api.delete(base)],
  ];
  for (const [name, probe] of probes) {
    const res = await probe();
    expect({ name, status: res.status() }).toEqual({ name, status: 404 });
    expect(await res.text()).not.toContain(sA.actorName);
  }
  for (const admin of [
    "/api/substrate/admin/provider-keys",
    "/api/substrate/admin/audit",
  ]) {
    expect((await b.api.get(admin)).status()).toBe(404);
  }
  expect(actorState(sA.actorName)).toMatch(/RUNNING/);
  const sessA = await (await a.api.get(base)).json();
  expect(sessA.state).toBe("running");
  expect(sessA.egressPresets).toEqual(["npm"]);

  // B's own session is B's alone.
  const sB = await createViaApi(b.api);
  actors.push(sB.actorName);
  await waitRunning(b.api, sB.id);
  const listA = await (await a.api.get("/api/substrate/sessions")).json();
  expect(listA.sessions.map((s: { id: string }) => s.id)).toEqual([sA.id]);
  expect(
    (await a.api.post(`/api/substrate/sessions/${sB.id}/end`)).status(),
  ).toBe(404);

  // ---- Admin: sees both with owners, drives A's session ------------------
  await adm.page.goto("/ai-coding/substrate");
  await expect(
    adm.page.getByText("All substrate sessions (admin)."),
  ).toBeVisible({ timeout: 60_000 });
  await expect(adm.page.getByText("Owner")).toBeVisible();
  const rowA = adm.page.locator(`[data-session="${sA.id}"]`);
  const rowB = adm.page.locator(`[data-session="${sB.id}"]`);
  await expect(rowA).toContainText(SUB_A);
  await expect(rowB).toContainText(SUB_B);

  await rowA.getByRole("button", { name: /Attach/ }).click();
  await attached(adm.page);
  await typeInTerminal(adm.page, "echo admin-sees-$TENANTVAR\n");
  await expect
    .poll(() => xtermText(adm.page), { timeout: 30_000 })
    .toMatch(/admin-sees-a-owns-42/);

  await adm.page.getByRole("button", { name: "Suspend" }).first().click();
  const admTab = adm.page
    .locator(`#substrate-tabpanel-${sA.id}`)
    .getByTestId("session-state");
  await expect(admTab).toHaveAttribute("data-state", "suspended", {
    timeout: 300_000,
  });
  // The session row flips to suspended when the suspend call returns; the
  // actor itself may still report SUSPENDING for a moment.
  await expect
    .poll(() => actorState(sA.actorName), { timeout: 120_000 })
    .toMatch(/_SUSPENDED$|^SUSPENDED$/);
  expect((await b.api.post(`${base}/resume`)).status()).toBe(404);
  await adm.page
    .getByTestId("session-detached-panel")
    .getByRole("button", { name: "Resume" })
    .click();
  await expect(admTab).toHaveAttribute("data-state", "running", {
    timeout: 300_000,
  });
  await attached(adm.page);
  await typeInTerminal(adm.page, "echo resumed-$TENANTVAR\n");
  await expect
    .poll(() => xtermText(adm.page), { timeout: 30_000 })
    .toMatch(/resumed-a-owns-42/);

  // A still owns it and reattaches to the same shell after the admin's resume.
  await a.page.goto("/ai-coding/substrate");
  const rowAforA = a.page.locator(`[data-session="${sA.id}"]`);
  await rowAforA.getByRole("button", { name: /Attach/ }).click();
  await attached(a.page);
  await typeInTerminal(a.page, "echo again-$TENANTVAR\n");
  await expect
    .poll(() => xtermText(a.page), { timeout: 30_000 })
    .toMatch(/again-a-owns-42/);

  // B cannot End it; the admin Ends A's and B's sessions through the UI.
  expect((await b.api.post(`${base}/end`)).status()).toBe(404);
  expect(actorState(sA.actorName)).toMatch(/RUNNING/);
  await adm.page.getByRole("tab", { name: /Sessions/ }).click();
  for (const [row, s] of [
    [rowA, sA],
    [rowB, sB],
  ] as const) {
    await row.getByRole("button", { name: "End session" }).click();
    const confirm = adm.page.getByRole("alertdialog");
    await confirm.getByRole("button", { name: "End session" }).click();
    await expect(row).toHaveCount(0, { timeout: 300_000 });
    await expect
      .poll(() => actorState(s.actorName), { timeout: 120_000 })
      .toBe("gone");
  }
  expect((await a.api.get(base)).status()).toBe(404);
  actors.length = 0;

  await Promise.all([
    a.context.close(),
    b.context.close(),
    adm.context.close(),
  ]);
});

test.afterAll(() => {
  for (const name of actors) {
    if (!/^daax-[0-9a-f]{10}$/.test(name)) continue;
    for (const kind of ["egress-policy", "actor"]) {
      try {
        ate(["delete", kind, name, "-a", ATESPACE]);
      } catch {
        /* already gone */
      }
    }
  }
});
