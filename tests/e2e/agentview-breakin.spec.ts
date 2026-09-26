/** Runs the real production proxy with a test-only named operator and proof file.
 * No live daemon, external identity provider or production secret is involved.
 * Run after bun run build. A dedicated fixture on 7794 avoids the recorded
 * reader spec's 7793 port even when the two files run in separate workers.
 */
import { test, expect } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const APP = "http://127.0.0.1:4218";
const DAEMON = "http://127.0.0.1:7794";
const agentId = "chamonix-5d63c187/claude/1c9e4b02-8f7a-4b16-9d33-2ea5c60f7411";
test.describe.configure({ mode: "serial" });
const buildMissing = !existsSync(path.resolve(".next/BUILD_ID"));
const buildRequired = process.env.DAAX_REQUIRE_E2E_BUILD === "1";
const buildReason =
  "Agent View break-in needs a production build; run bun run build before this spec";
test.skip(buildMissing && !buildRequired, buildReason);
test.beforeAll(() => {
  if (buildMissing && buildRequired) throw new Error(buildReason);
});
test.use({
  baseURL: APP,
  extraHTTPHeaders: {
    "X-Forwarded-User": "a8e78e55-bcde-4789-9210-981476abc123",
    "X-Daax-Proxy-Secret": "fixture-daax-proof",
  },
});
let app: ChildProcess | undefined;
let daemon: ChildProcess | undefined;
let dir: string;

async function launch(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
): Promise<ChildProcess> {
  const proc = spawn(command, args, { env, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  // Both Next and the fixture print readiness only after binding. Waiting for
  // this child's output cannot accidentally grade an orphan holding its port.
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error(`startup timed out: ${output}`));
    }, 30000);
    const read = (chunk: Buffer) => {
      output += chunk.toString();
      if (/Ready in|fixture daemon listening/.test(output)) {
        clearTimeout(timer);
        resolve();
      }
    };
    proc.stdout!.on("data", read);
    proc.stderr!.on("data", read);
    proc.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    proc.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`child exited ${code}: ${output}`));
    });
  });
  return proc;
}
async function stop(proc: ChildProcess | undefined) {
  if (!proc || proc.exitCode !== null) return;
  await new Promise<void>((resolve) => {
    proc.once("exit", () => resolve());
    proc.kill("SIGTERM");
  });
}
test.beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "agentview-breakin-"));
  const proof = path.join(dir, "proxy.secret");
  await writeFile(proof, "fixture-daemon-proof\n", { mode: 0o600 });
  app = await launch(
    "node",
    [
      "node_modules/next/dist/bin/next",
      "start",
      "-H",
      "127.0.0.1",
      "-p",
      "4218",
    ],
    {
      ...process.env,
      NODE_ENV: "production",
      HOST: "127.0.0.1",
      HOST_WORKSPACE_PATH: "",
      AGENTVIEW_DAEMON_URL: DAEMON,
      AGENTVIEW_DAEMON_PROXY_SECRET_FILE: proof,
      AGENTVIEW_DAEMON_PROXY_PROOF_HEADER: "X-Dist-Agent-Proxy",
      AGENTVIEW_DAEMON_IDENTITY_HEADER: "X-Auth-Request-User",
      DAAX_REQUIRE_AUTH: "1",
      DAAX_PROXY_SECRET: "fixture-daax-proof",
    },
  );
});
test.afterEach(async () => {
  await stop(daemon);
  daemon = undefined;
});
test.afterAll(async () => {
  await stop(app);
  if (dir) await rm(dir, { recursive: true, force: true });
});

async function startDaemon(flag: string) {
  daemon = await launch(
    "node",
    ["tests/e2e/fixtures/agentview-daemon.mjs", flag],
    {
      ...process.env,
      AGENTVIEW_E2E_DAEMON_PORT: "7794",
    },
  );
}

test("Interrupt records exactly one signal and shows sent beside its event id, with unknown observed state", async ({
  page,
}) => {
  await startDaemon("--control");
  await page.goto("/agentview");
  await page
    .locator(`[data-testid="agentview-agent"][data-agent-id="${agentId}"]`)
    .click();
  await page.getByRole("button", { name: "Interrupt", exact: true }).click();
  await expect(page.getByTestId("agentview-signal-reply")).toContainText(
    "sent · event fixture-signal-1",
  );
  await expect(page.getByTestId("agentview-breakin-state")).toContainText(
    "unknown, because nothing has been observed yet",
  );
  await expect(page.getByTestId("agentview-breakin-state")).not.toContainText(
    "sent",
  );
  const { signals } = await (await fetch(`${DAEMON}/__signals`)).json();
  expect(signals).toHaveLength(1);
  expect(signals[0].agent_id).toBe(
    "chamonix-5d63c187/claude/1c9e4b02-8f7a-4b16-9d33-2ea5c60f7411",
  );
  expect(signals[0].body).toEqual({ signal: "interrupt" });
  expect(signals[0].headers["x-auth-request-user"]).toBe(
    "a8e78e55-bcde-4789-9210-981476abc123",
  );
  expect(signals[0].headers.cookie).toBeUndefined();
  expect(signals[0].headers.authorization).toBeUndefined();
  expect(signals[0].headers.origin).toBeUndefined();
});

test("--refuse-control disables Interrupt with the fixture's control detail", async ({
  page,
}) => {
  await startDaemon("--refuse-control");
  await page.goto("/agentview");
  await page
    .locator(`[data-testid="agentview-agent"][data-agent-id="${agentId}"]`)
    .click();
  await expect(
    page.getByRole("button", {
      name: "Interrupt — fixture control is unavailable: no authenticated signal target",
    }),
  ).toBeDisabled();
  const { signals } = await (await fetch(`${DAEMON}/__signals`)).json();
  expect(signals).toEqual([]);
});

test("the unmodified recorded ACTIVE row has no observed process and cannot be interrupted", async ({
  page,
}) => {
  await startDaemon("");
  const posts: string[] = [];
  page.on("request", (req) => {
    if (req.method() === "POST" && req.url().endsWith("/signal"))
      posts.push(req.url());
  });
  await page.goto("/agentview");
  await page
    .locator(`[data-testid="agentview-agent"][data-agent-id="${agentId}"]`)
    .click();
  await expect(
    page.getByRole("button", {
      name: "Interrupt — this daemon's authenticator admits everybody: no --auth was given, so this daemon authenticates nobody. Every control action is recorded with the principal that asked for it, and the honest value of that here is nobody, so control is unavailable for every agent on this daemon (ADR 0017 §2)",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(page.getByTestId("agentview-breakin-state")).toContainText(
    "unknown",
  );
  // No pid and no stop event is also how the daemon shows a live process it
  // has not linked yet, so Resume waits rather than forking it.
  await expect(
    page.getByRole("button", {
      name: "Resume here — daax cannot tell whether this session is still running: the daemon has recorded no start or stop of its process; it ties a Claude process to its session only when it was started with --session-id or --resume <id>, so a plain claude, claude -c or the picker cannot be linked",
      exact: true,
    }),
  ).toBeDisabled();
  expect(posts).toEqual([]);
});

test("a live WAITING session can be taken over: Interrupt ends it and Resume follows", async ({
  page,
}) => {
  const waitingId =
    "chamonix-5d63c187/claude/7a2e4c19-5b3d-4e8f-9c61-0d4b2a8e3f57";
  await startDaemon("--ends-on-signal");
  await page.goto("/agentview");
  await page
    .locator(`[data-testid="agentview-agent"][data-agent-id="${waitingId}"]`)
    .click();
  await expect(page.getByTestId("agentview-breakin-state")).toHaveText(
    "running · the session is WAITING",
  );
  await expect(
    page.getByRole("button", {
      name: "Resume here — this session's process is still running (pid 424300); interrupt it first — two processes on one session would fork the conversation",
      exact: true,
    }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Interrupt", exact: true }).click();
  await expect(page.getByTestId("agentview-breakin-state")).toContainText(
    "interrupted (observed): process 424300 ended",
    { timeout: 15000 },
  );
  await expect(
    page.getByRole("button", { name: "Resume here", exact: true }),
  ).toBeEnabled();
});

test("Codex, stale-tracker and reopened rows refuse Resume, each with its reason", async ({
  page,
}) => {
  await startDaemon("--control");
  await page.goto("/agentview");
  for (const [id, reason] of [
    [
      "chamonix-5d63c187/codex/01a0dbdb-7e21-7c4a-9f3e-2b6d8c1a5e40",
      "daax cannot tell whether this session is still running: the daemon has recorded no start or stop of its process; for codex the daemon often cannot link a session to its process at all, so Resume waits for an observed exit",
    ],
    [
      "chamonix-5d63c187/claude/3d8f1b6a-2c47-4e90-a5d3-7b1e9c4f6a28",
      "daax cannot tell whether this session is still running: the daemon has recorded no start or stop of its process; it ties a Claude process to its session only when it was started with --session-id or --resume <id>, so a plain claude, claude -c or the picker cannot be linked",
    ],
    [
      "chamonix-5d63c187/claude/5c9d2e71-8a43-4f06-b2d1-6e0f3a7c9b58",
      "daax cannot tell whether this session is still running: the session's transcript has records after its process was seen to stop; another process may be running it",
    ],
  ]) {
    await page
      .locator(`[data-testid="agentview-agent"][data-agent-id="${id}"]`)
      .click();
    await expect(
      page.getByRole("button", {
        name: `Resume here — ${reason}`,
        exact: true,
      }),
    ).toBeDisabled();
  }
});

test("wrong-node fixture refusal uses 404 and the daemon's exact sentence", async ({
  request,
}) => {
  await startDaemon("--control");
  const response = await request.post(
    "/api/agentview/agents/galway%2Fclaude%2Fsession/signal",
    {
      data: { signal: "interrupt" },
    },
  );
  const { signals } = await (await fetch(`${DAEMON}/__signals`)).json();
  expect(signals).toHaveLength(1);
  expect(signals[0].agent_id).toBe("galway/claude/session");
  expect(signals[0].body).toEqual({ signal: "interrupt" });
  expect(response.status()).toBe(404);
  const body = await response.json();
  expect(body).toEqual({
    event_id: "fixture-signal-1",
    agent_id: "galway/claude/session",
    signal: "interrupt",
    outcome: "refused",
    recorded: true,
    note: "refusal recorded",
    error:
      'no agent "galway/claude/session" is in this node\'s registry; its prefix names node galway, and control is not federated: node galway has its own control surface at https://agent.galway.example (ADR 0026 §3); this daemon can only signal processes it can see',
  });
});

test("Interrupt observes the baseline process ending and names its pid", async ({
  page,
}) => {
  await startDaemon("--ends-on-signal");
  await page.goto("/agentview");
  await page
    .locator(`[data-testid="agentview-agent"][data-agent-id="${agentId}"]`)
    .click();
  await expect(
    page.getByRole("button", {
      name: "Resume here — this session's process is still running (pid 424242); interrupt it first — two processes on one session would fork the conversation",
      exact: true,
    }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Interrupt", exact: true }).click();
  await expect(page.getByTestId("agentview-breakin-state")).toContainText(
    "interrupted (observed): process 424242 ended",
    { timeout: 15000 },
  );
  await expect(page.getByTestId("agentview-breakin-state")).not.toContainText(
    "future",
  );
  // The ended row has no pid to signal; that must not disable Resume, here or
  // after a reload, where no in-page baseline survives.
  await expect(
    page.getByRole("button", { name: "Resume here", exact: true }),
  ).toBeEnabled();
  await page.reload();
  await page
    .locator(`[data-testid="agentview-agent"][data-agent-id="${agentId}"]`)
    .click();
  await expect(
    page.getByRole("button", {
      name: "Interrupt — no process id is recorded for this agent, so there is nothing to signal",
    }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Resume here", exact: true }),
  ).toBeEnabled();
  const { signals } = await (await fetch(`${DAEMON}/__signals`)).json();
  expect(signals).toHaveLength(1);
  const { agents } = await (await fetch(`${DAEMON}/api/v1/agents`)).json();
  const row = agents.find(
    (agent: { agent_id: string }) => agent.agent_id === agentId,
  );
  expect(row).not.toHaveProperty("process_alive");
  expect(row).not.toHaveProperty("agent_pid");
  const { events } = await (
    await fetch(
      `${DAEMON}/api/v1/events?agent_id=${encodeURIComponent(agentId)}`,
    )
  ).json();
  expect(events).toContainEqual(
    expect.objectContaining({
      event_type: "EVENT_TYPE_AGENT_STOPPED",
      process_id: 424242,
    }),
  );
  expect(events).toContainEqual(
    expect.objectContaining({
      event_type: "EVENT_TYPE_PROCESS_EXITED",
      agent_id: "chamonix-5d63c187/claude/1c9e4b02-8f7a-4b16-9d33-2ea5c60f7411",
    }),
  );
});
