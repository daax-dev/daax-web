import { test, expect, type Page } from "@playwright/test";

/**
 * Digital Workers UI (docs/plans/digital-workers.md §7.1).
 *
 * The /api/workers routes are stubbed with page.route so the spec needs no
 * Postgres and never starts a real LLM run: it covers the navigation entry,
 * adding the TPM from its template, the detail tabs, and an ask round trip.
 */

const now = "2026-09-26T10:00:00.000Z";
const worker = {
  id: "5f0c1d7e-0000-4000-8000-000000000001",
  slug: "tpm",
  name: "Technical Project Manager",
  role: "tpm",
  description: "Tracks goals across Backlog.md projects and GitHub.",
  instructions: "Role: Technical Project Manager.",
  engine: "claude-cli",
  model: null,
  runMode: "schedule",
  cron: "0 8,16 * * 1-5",
  cooldownSeconds: 1800,
  maxRunsPerDay: 6,
  timeoutSeconds: 900,
  autonomy: "propose",
  executor: "auto",
  workingDir: null,
  mcpServers: [
    {
      kind: "inline",
      id: "backlog",
      type: "stdio",
      command: "backlog",
      args: ["mcp", "start"],
    },
  ],
  enabled: false,
  pausedReason: null,
  createdBy: null,
  createdAt: now,
  updatedAt: now,
  state: "paused",
  lastRun: null,
  nextRunAt: null,
  activeGoals: 1,
};
const engines = {
  "claude-cli": {
    available: true,
    note: "claude -p (host, subscription login)",
  },
  "codex-cli": {
    available: true,
    note: "codex exec (host, subscription login)",
  },
  "agent-sdk": { available: false, note: "set ANTHROPIC_API_KEY to enable" },
};
const brief = {
  id: "5f0c1d7e-0000-4000-8000-0000000000b1",
  workerId: worker.id,
  trigger: "schedule",
  input: "",
  status: "succeeded",
  engine: "claude-cli",
  queuedAt: now,
  startedAt: now,
  finishedAt: now,
  summary:
    "## Summary\nOne goal at risk.\n\n## Goals\n| Goal | Status | Evidence |\n| --- | --- | --- |\n| Ship workers | at-risk | PR 12 CI red |",
  error: null,
  usage: {},
  requestedBy: null,
};
const askRunId = "5f0c1d7e-0000-4000-8000-0000000000a1";

async function stubApi(page: Page) {
  const created = { value: false };
  await page.route("**/api/workers", async (route) => {
    if (route.request().method() === "POST") {
      created.value = true;
      return route.fulfill({ status: 201, json: { worker } });
    }
    return route.fulfill({
      json: {
        workers: created.value ? [worker] : [],
        templates: [
          { slug: "tpm", name: worker.name, description: worker.description },
        ],
        engines,
        schedulerLeader: true,
      },
    });
  });
  await page.route("**/api/workers/tpm", (route) =>
    route.fulfill({
      json: {
        worker,
        goals: [
          {
            id: "g1",
            workerId: worker.id,
            title: "Ship the workers module",
            description: "",
            projectRef: "/workspace/daax-web",
            successCriteria: "PR merged",
            status: "active",
            priority: 0,
            createdAt: now,
            updatedAt: now,
          },
        ],
        brief,
      },
    }),
  );
  await page.route(`**/api/workers/${worker.id}/runs*`, (route) =>
    route.request().method() === "POST"
      ? route.fulfill({
          status: 202,
          json: {
            run: {
              ...brief,
              id: askRunId,
              trigger: "adhoc",
              status: "queued",
              summary: null,
            },
          },
        })
      : route.fulfill({ json: { runs: [brief] } }),
  );
  await page.route(`**/api/workers/runs/${askRunId}*`, (route) =>
    route.fulfill({
      json: {
        run: {
          ...brief,
          id: askRunId,
          trigger: "adhoc",
          input: "what is blocking release?",
          summary: "CI is red on PR 12; the fix is waiting on review.",
        },
        events: [
          {
            id: 1,
            runId: askRunId,
            seq: 0,
            at: now,
            type: "message",
            text: "Checking PRs.",
          },
        ],
      },
    }),
  );
  await page.route(`**/api/workers/runs/${brief.id}*`, (route) =>
    route.fulfill({ json: { run: brief, events: [] } }),
  );
  await page.route("**/api/mcp/config*", (route) =>
    route.fulfill({ json: { state: { mcps: [] } } }),
  );
}

test.describe("Digital Workers", () => {
  test("add the TPM from its template, open it, and ask a question", async ({
    page,
  }) => {
    await stubApi(page);
    await page.goto("/workers");

    await expect(
      page.getByRole("heading", { name: "Digital Workers", level: 1 }),
    ).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText("claude-cli: ready")).toBeVisible();
    await expect(page.getByText("agent-sdk: unavailable")).toBeVisible();

    await page.getByTestId("create-tpm").click();
    const card = page.getByTestId("worker-card-tpm");
    await expect(card).toBeVisible();
    await expect(card.getByTestId("worker-state")).toHaveText("paused");

    await card.getByRole("link", { name: "Open" }).click();
    await expect(page).toHaveURL(/\/workers\/tpm$/);
    await expect(page.getByTestId("brief")).toContainText("One goal at risk.");
    await expect(page.getByTestId("brief").locator("table")).toContainText(
      "at-risk",
    );

    await page.getByRole("tab", { name: /Goals/ }).click();
    await expect(page.getByTestId("goals-tab")).toContainText(
      "Ship the workers module",
    );

    await page.getByRole("tab", { name: "Schedule" }).click();
    await expect(page.getByTestId("schedule-tab")).toContainText("Next:");

    const ask = page.getByLabel("Ask the worker");
    await ask.fill("what is blocking release?");
    await ask.press("Enter");
    await expect(page.getByTestId("ask-answer")).toContainText(
      "CI is red on PR 12; the fix is waiting on review.",
    );
  });

  test("Workers appears in the top navigation", async ({ page }) => {
    await stubApi(page);
    await page.goto("/");
    await page.getByRole("link", { name: "Workers" }).first().click();
    await expect(page).toHaveURL(/\/workers$/);
  });
});
