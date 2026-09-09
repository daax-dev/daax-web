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
test.skip(
  !existsSync(path.resolve(".next/BUILD_ID")),
  "Agent View break-in needs a production build; run bun run build before this spec",
);
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
      name: "Interrupt — nothing to interrupt: no process has been observed for this session",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(page.getByTestId("agentview-breakin-state")).toContainText(
    "unknown",
  );
  expect(posts).toEqual([]);
});

test("wrong-node fixture refusal uses 421 and the daemon's exact sentence", async ({
  request,
}) => {
  await startDaemon("--control");
  const response = await request.post(
    "/api/agentview/agents/galway%2Fclaude%2Fsession/signal",
    {
      data: { signal: "interrupt" },
    },
  );
  expect(response.status()).toBe(421);
  const body = await response.json();
  // Node fetch retries 421 once; the audit sequence is transport-dependent.
  // The route unit test separately pins byte-for-byte event_id pass-through.
  expect(body.event_id).toMatch(/^fixture-signal-[1-9][0-9]*$/);
  expect(body).toMatchObject({
    agent_id: "galway/claude/session",
    signal: "interrupt",
    outcome: "refused",
    recorded: true,
    note: "refusal recorded",
    error:
      'no agent "galway/claude/session" is in this node\'s registry; its prefix names node galway, and control is not federated: node galway has its own control surface at https://agent.galway.example (ADR 0026 §3); this daemon can only signal processes it can see',
  });
});
