/**
 * Agent View (dist-agent) e2e.
 *
 * Drives the tab in the real app against the fixture daemon at
 * tests/e2e/fixtures/agentview-daemon.mjs, which replays recorded agentd
 * answers on 7793. The Next server's proxy reads AGENTVIEW_DAEMON_URL at
 * request time, so the whole file skips — visibly, with a sentence — unless
 * that variable aims the proxy at the fixture port. The lead wires it in
 * playwright.config.ts webServer.env and in CI.
 *
 * The two describes below each own the daemon process on 7793, so the file
 * runs in one worker, in order ("default" mode overrides the config's
 * fullyParallel without making a failure skip the tests after it): a refusing
 * daemon and an answering one cannot share a port.
 */

import { test, expect, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const FIXTURE_URL = "http://127.0.0.1:7793";
const FIXTURE_PORT = "7793";
const DAEMON_SCRIPT = path.resolve(
  __dirname,
  "fixtures",
  "agentview-daemon.mjs",
);
const FIXTURE_DIR = path.resolve(__dirname, "fixtures", "agentview");

test.describe.configure({ mode: "default" });

test.skip(
  process.env.AGENTVIEW_DAEMON_URL !== FIXTURE_URL,
  "AGENTVIEW_DAEMON_URL is not aimed at the fixture daemon on 7793; the lead wires this in playwright.config.ts webServer.env and in CI",
);

// ─── Fixture daemon lifecycle ────────────────────────────────────────────────

async function startDaemon(args: string[] = []): Promise<ChildProcess> {
  const proc = spawn("node", [DAEMON_SCRIPT, ...args], {
    env: { ...process.env, AGENTVIEW_E2E_DAEMON_PORT: FIXTURE_PORT },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const stderr: string[] = [];
  proc.stderr?.on("data", (d) => stderr.push(String(d)));
  await expect
    .poll(
      async () => {
        if (proc.exitCode !== null)
          throw new Error(
            `fixture daemon exited ${proc.exitCode}: ${stderr.join("")}`,
          );
        try {
          const res = await fetch(`${FIXTURE_URL}/api/v1/healthz`);
          return res.status;
        } catch {
          return 0;
        }
      },
      { timeout: 15_000, message: "fixture daemon healthz" },
    )
    .toBe(200);
  return proc;
}

async function stopDaemon(proc: ChildProcess | undefined): Promise<void> {
  if (!proc || proc.exitCode !== null) return;
  const exited = new Promise<void>((resolve) =>
    proc.once("exit", () => resolve()),
  );
  proc.kill("SIGTERM");
  await exited;
  // The port must actually be free before the next daemon binds it.
  await expect
    .poll(
      async () => {
        try {
          await fetch(`${FIXTURE_URL}/api/v1/healthz`);
          return "up";
        } catch {
          return "down";
        }
      },
      { timeout: 10_000, message: "fixture daemon port released" },
    )
    .toBe("down");
}

// The second source: the wire, not the DOM.
const recordedAgentIds = (): string[] =>
  (
    JSON.parse(readFileSync(path.join(FIXTURE_DIR, "agents.json"), "utf8")) as {
      agents: { agent_id: string }[];
    }
  ).agents.map((a) => a.agent_id);

const recordedUnavailable = (): { name: string; detail: string } => {
  const node = JSON.parse(
    readFileSync(path.join(FIXTURE_DIR, "node.json"), "utf8"),
  ) as {
    node: {
      capabilities: {
        signals: Record<string, { level: string; detail?: string }>;
      };
    };
  };
  const entry = Object.entries(node.node.capabilities.signals).find(
    ([, c]) => c.level === "CAPABILITY_LEVEL_UNAVAILABLE" && c.detail,
  );
  if (!entry)
    throw new Error("node.json has no UNAVAILABLE signal with a detail");
  return { name: entry[0], detail: entry[1].detail! };
};

const openOverview = async (page: Page) => {
  await page.goto("/agentview");
  await expect(
    page.getByRole("heading", { name: "Agent View", level: 1 }),
  ).toBeVisible();
};

// ─── An answering daemon ─────────────────────────────────────────────────────

test.describe("Agent View against the recorded daemon", () => {
  let daemon: ChildProcess | undefined;

  test.beforeAll(async () => {
    daemon = await startDaemon();
  });

  test.afterAll(async () => {
    await stopDaemon(daemon);
  });

  test("the AI Coding nav shows Agent View and the page renders its heading and tabs", async ({
    page,
  }) => {
    await page.goto("/ai-coding");
    const link = page.getByRole("link", { name: "Agent View" });
    await expect(link).toBeVisible();
    await link.click();
    // In dev the first visit to a route compiles it, which can outlast the
    // default 5 s expectation.
    await expect(page).toHaveURL(/\/agentview$/, { timeout: 30_000 });
    await expect(
      page.getByRole("heading", { name: "Agent View", level: 1 }),
    ).toBeVisible();
    const tabs = page.getByTestId("agentview-tabs");
    await expect(tabs).toBeVisible();
    await expect(tabs.getByRole("tab", { name: "Overview" })).toBeVisible();
    await expect(tabs.getByRole("tab", { name: "Console" })).toBeVisible();
  });

  test("Overview renders recorded agents and an UNAVAILABLE capability with its reason", async ({
    page,
  }) => {
    await openOverview(page);
    const cards = page.getByTestId("agentview-agent");
    await expect(cards.first()).toBeVisible();
    const ids = recordedAgentIds();
    expect(ids.length).toBeGreaterThan(0);
    const firstId = await cards.first().getAttribute("data-agent-id");
    expect(ids).toContain(firstId);

    const unavailable = recordedUnavailable();
    const row = page.getByTestId(`agentview-cap-${unavailable.name}`);
    await expect(row).toHaveAttribute(
      "data-level",
      "CAPABILITY_LEVEL_UNAVAILABLE",
    );
    await expect(row).toContainText("UNAVAILABLE");
    await expect(row).toContainText(unavailable.detail);
  });

  test("the identity provider renders two ages", async ({ page }) => {
    await openOverview(page);
    const attempt = page.getByTestId("agentview-idp-attempt");
    const success = page.getByTestId("agentview-idp-success");
    await expect(attempt).toBeVisible();
    await expect(success).toBeVisible();
    await expect(attempt).toContainText("last attempt");
    await expect(success).toContainText("last success");
    // An age or "never" — never a blank.
    await expect(attempt).toContainText(/ago|never/);
    await expect(success).toContainText(/ago|never/);
  });

  test("the stream goes live and the head sequence advances", async ({
    page,
  }) => {
    await openOverview(page);
    await expect(page.getByTestId("agentview-stream")).toHaveAttribute(
      "data-state",
      "live",
    );
    const head = page.getByTestId("agentview-event").first();
    await expect(head).toBeVisible();
    const first = Number(await head.getAttribute("data-sequence"));
    expect(Number.isFinite(first)).toBe(true);
    await expect
      .poll(async () => Number(await head.getAttribute("data-sequence")), {
        timeout: 10_000,
        message: "head sequence increases",
      })
      .toBeGreaterThan(first);
  });

  test("clicking an agent card filters the timeline to that agent", async ({
    page,
  }) => {
    await openOverview(page);
    const rows = page.getByTestId("agentview-event");
    await expect(rows.first()).toBeVisible();

    const card = page.getByTestId("agentview-agent").first();
    const agentId = await card.getAttribute("data-agent-id");
    expect(agentId).toBeTruthy();
    await card.click();
    await expect(card).toHaveAttribute("aria-pressed", "true");

    await expect
      .poll(
        async () => {
          const ids = await rows.evaluateAll((els) =>
            els.map((el) => el.getAttribute("data-agent-id")),
          );
          return ids.length > 0 && ids.every((id) => id === agentId);
        },
        { timeout: 10_000, message: "every row belongs to the selected agent" },
      )
      .toBe(true);
  });

  test("the Console tab embeds the daemon's page with the theme in the URL", async ({
    page,
  }) => {
    await openOverview(page);
    await page.getByRole("tab", { name: "Console" }).click();
    const frame = page.getByTestId("agentview-console").locator("iframe");
    await expect(frame).toHaveAttribute("src", /theme=(light|dark)/);
    await expect(frame).toHaveAttribute("src", /:7717\//);
  });
});

// ─── A refusing daemon ───────────────────────────────────────────────────────

test.describe("Agent View against a daemon that refuses", () => {
  let daemon: ChildProcess | undefined;

  test.beforeAll(async () => {
    daemon = await startDaemon(["--refuse"]);
  });

  test.afterAll(async () => {
    await stopDaemon(daemon);
  });

  test("renders the refused notice and no empty list beneath it", async ({
    page,
  }) => {
    await openOverview(page);
    const notice = page.getByTestId("agentview-refused");
    await expect(notice).toBeVisible();
    await expect(notice).toContainText("refused");
    await expect(page.getByTestId("agentview-agents-empty")).toHaveCount(0);
    await expect(page.getByTestId("agentview-event")).toHaveCount(0);
    await expect(page.getByTestId("agentview-events-empty")).toHaveCount(0);
    await expect(page.getByTestId("agentview-unreachable")).toHaveCount(0);
  });
});
