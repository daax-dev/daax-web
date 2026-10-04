Reading additional input from stdin...
OpenAI Codex v0.154.0
--------
workdir: /Users/jasonpoley/prj/dx/src/daax-web
model: gpt-6-astra
provider: openai
approval: never
sandbox: workspace-write [workdir, /tmp, $TMPDIR] (network access enabled)
reasoning effort: high
reasoning summaries: none
session id: 01a1044a-475a-7502-a493-9be31cb6e4ea
--------
user
Read-only re-validation. Codex r13 reported 3 P2s in the digital workers diff: (1) lib/workers/mcp.ts HTTP discovery skipped notifications/initialized; (2) components/workers/AskBar.tsx had no reachable stop while a run is active; (3) scripts/workers-cli.ts 'logs' without --follow ignored hasMore. Inspect 'git show HEAD' and confirm each is fixed, with tests, and report any new P0-P3 defect introduced by that commit only. State explicitly if none.
hook: SessionStart
hook: SessionStart
hook: SessionStart
hook: SessionStart Completed
hook: SessionStart Completed
hook: SessionStart Completed
hook: UserPromptSubmit
hook: UserPromptSubmit
hook: UserPromptSubmit
hook: UserPromptSubmit Completed
hook: UserPromptSubmit Completed
hook: UserPromptSubmit Completed
codex
The review will inspect `git show HEAD`, check each reported P2 and its test coverage, and assess defects introduced by that commit only. No files will be changed.
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Completed
exec
/bin/zsh -lc 'cat .claude/workflow.md' in /Users/jasonpoley/prj/dx/src/daax-web
 succeeded in 0ms:
# Workflow

## Planning
- A plan is required for any non-trivial change.
- Trivial: typo fix, single-line config update, obvious rename. Everything else requires a plan.
- Write the plan down — in the PR description, the Backlog.md task, or `.logs/decisions/`. Plans held only in chat do not count.
- Present trade-offs as facts: option, cost, risk, reversibility. The operator decides; the agent executes.
- Do not start coding until the plan is approved.

---

## Execution Discipline
- State assumptions that affect implementation. If the request has multiple plausible readings, ask before editing.
- Smallest change that satisfies the verified goal. No speculative features, abstractions, or config.
- Touch only what the task requires. No adjacent cleanup or drive-by refactors. Every changed line traces to the request or its validation.
- Remove only the orphans your change created; leave pre-existing dead code (mention it, don't delete).
- Define a verifiable goal before coding. Add or update tests when behavior changes.
- Maintain BOTH deployment modes (host dev and Docker container) — see `.claude/stack.md`. A change that breaks one mode is incomplete.

---

## Work Intake
Tasks originate from (check in this order):
1. Backlog.md — managed via the `backlog` CLI / MCP server (config: `backlog/config.yml`, project `daax-web`). Tasks live under `backlog/tasks/`. Read `backlog://workflow/overview` (MCP resource) or call `backlog.get_workflow_overview()` before working a task. Never edit task files directly — use the CLI.
2. Direct request from operator.

Identify the source before starting. If the same task appears in multiple systems, ask which is canonical.

---

## Model Selection
- Match model capability to task complexity. Do not waste large models on small tasks.
- Code with one model; validate with a model from a **different provider where possible** (e.g., produced by Claude/Anthropic, validated by Codex/OpenAI, or vice versa). Prefer cross-provider; a different model from the same provider is the fallback; same model is last resort. Record both — producer and validator — in the PR description, and note if cross-provider was not possible.
- Call out when a task requires a paid API call. State the cost estimate before incurring it.

---

## Communication
- Report blockers immediately. No silent workarounds.
- Surface uncertainty. State confidence level. No claims of certainty without a validated primary source.
- Objective language. No first-person pronouns. No apologies.

---

## Definition of Done
A task is done only when:
- [ ] Unit tests pass: `bun run test` (Vitest). For changes touching UI flows or server handlers, also run `bun run test:e2e` (Playwright) or the full suite `bun run test:all` (Vitest + Playwright + agent quick-verify).
- [ ] Type check passes: `bun run typecheck` (`tsc --noEmit`).
- [ ] Linter passes: `bun run lint` (ESLint). Formatter clean: `bun run format:check` (Prettier).
- [ ] Both deployment modes still build (`bun run build`; `docker build --target runner -t daax .` when the change touches the Dockerfile, server, or runtime config).
- [ ] PR opened with problem statement, approach, and test evidence.
- [ ] Non-trivial decisions logged in `.logs/decisions/` per `.claude/history.md`.
- [ ] Validation pass by a separate model — cross-provider (Claude ↔ Codex) where possible — recorded in the PR description as `Validation:` producer model + validator model + verdict (note if cross-provider was not possible).
- [ ] Backlog.md task updated to Done with link to PR/commit (via `backlog task edit <id> -s Done`).

hook: PostToolUse
hook: PostToolUse Completed
exec
/bin/zsh -lc 'git status --short; git show --stat --oneline HEAD; git show --format=fuller --no-ext-diff HEAD' in /Users/jasonpoley/prj/dx/src/daax-web
 succeeded in 0ms:
 M AGENTS.md
?? .logs/reviews/codex-digital-workers-r13.md
?? .logs/reviews/codex-digital-workers-r14.md
?? .worktrees/
?? "backlog/tasks/task-002 - daax-web-native-OIDC-login-against-the-hosts-Pocket-ID-remove-oauth2-proxy-from-daax.md"
7ba34bd fix(workers): MCP http handshake, paged CLI logs, Stop in ask bar (Codex r13 P2s)
 components/workers/AskBar.tsx             | 11 ++++++-
 lib/workers/mcp.ts                        |  5 +++
 scripts/workers-cli.ts                    | 19 +++++++++--
 tests/components/workers/ask-bar.test.tsx | 13 ++++++++
 tests/lib/workers/mcp.test.ts             | 55 ++++++++++++++++++++++++++++++-
 tests/scripts/workers-cli.test.ts         | 18 ++++++++++
 6 files changed, 116 insertions(+), 5 deletions(-)
commit 7ba34bd8e4d3a178731415abe3976ecea6a2cd49
Author:     Jason Poley <jason.poley@gmail.com>
AuthorDate: Sun Oct 4 11:22:18 2026 +1100
Commit:     Jason Poley <jason.poley@gmail.com>
CommitDate: Sun Oct 4 11:22:18 2026 +1100

    fix(workers): MCP http handshake, paged CLI logs, Stop in ask bar (Codex r13 P2s)

diff --git a/components/workers/AskBar.tsx b/components/workers/AskBar.tsx
index 1f860ff..3fcf0be 100644
--- a/components/workers/AskBar.tsx
+++ b/components/workers/AskBar.tsx
@@ -1,7 +1,7 @@
 "use client";
 
 import { useEffect, useRef, useState } from "react";
-import { Send, Volume2, VolumeX } from "lucide-react";
+import { Send, Square, Volume2, VolumeX } from "lucide-react";
 import { Button } from "@/components/ui/button";
 import { Textarea } from "@/components/ui/textarea";
 import { VoiceInput } from "@/components/ui/voice-input";
@@ -159,6 +159,15 @@ export function AskBar({
         >
           <Send className="h-4 w-4" />
         </Button>
+        {active && (
+          <Button
+            variant="outline"
+            onClick={() => void submit("stop", "adhoc")}
+            aria-label="Stop the run"
+          >
+            <Square className="h-4 w-4" />
+          </Button>
+        )}
         <Button
           variant="outline"
           onClick={toggleSpeak}
diff --git a/lib/workers/mcp.ts b/lib/workers/mcp.ts
index d71e030..dd90d50 100644
--- a/lib/workers/mcp.ts
+++ b/lib/workers/mcp.ts
@@ -350,6 +350,11 @@ async function listViaHttp(
       clientInfo: { name: "daax-workers", version: "1" },
     },
   });
+  // Servers that enforce the handshake reject tools/list until this is sent.
+  await post(
+    { jsonrpc: "2.0", method: "notifications/initialized" },
+    init.sessionId,
+  );
   const list = await post(
     { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
     init.sessionId,
diff --git a/scripts/workers-cli.ts b/scripts/workers-cli.ts
index 1ebb750..75b0d60 100644
--- a/scripts/workers-cli.ts
+++ b/scripts/workers-cli.ts
@@ -395,9 +395,22 @@ async function execute(p: ParsedArgs, c: Client, d: Deps): Promise<number> {
     case "logs": {
       need(args, 1, "logs <run-id> [--follow]");
       if (flags.follow !== true) {
-        return show<RunEvents>(runPath(args[0]), (r) =>
-          r.events.map(formatEvent).join("\n"),
-        );
+        // Drain every page: a single response is capped (hasMore).
+        const events: RunEvents["events"] = [];
+        let after = -1;
+        for (;;) {
+          const page = await c.request<RunEvents>(
+            "GET",
+            `${runPath(args[0])}?after=${after}`,
+          );
+          events.push(...page.events);
+          if (!page.hasMore || page.events.length === 0) {
+            return emit({ ...page, events }, (r) =>
+              r.events.map(formatEvent).join("\n"),
+            );
+          }
+          after = page.events[page.events.length - 1].seq;
+        }
       }
       const final = await followRun(c, args[0], {
         sleep: d.sleep,
diff --git a/tests/components/workers/ask-bar.test.tsx b/tests/components/workers/ask-bar.test.tsx
index 69c175c..e00c84d 100644
--- a/tests/components/workers/ask-bar.test.tsx
+++ b/tests/components/workers/ask-bar.test.tsx
@@ -116,4 +116,17 @@ describe("AskBar", () => {
     expect(await screen.findByText(/All on track/)).toBeInTheDocument();
     expect(api.startRun).not.toHaveBeenCalled();
   });
+
+  it("keeps a Stop button reachable while a run is active", async () => {
+    api.startRun.mockResolvedValue({ run: { ...run, status: "running" } });
+    api.run.mockResolvedValue({
+      run: { ...run, status: "running" },
+      events: [],
+    });
+    api.cancelRun.mockResolvedValue({ cancelled: true });
+    render(<AskBar {...props} />);
+    fireEvent.click(screen.getByText("say question"));
+    fireEvent.click(await screen.findByLabelText("Stop the run"));
+    await waitFor(() => expect(api.cancelRun).toHaveBeenCalledWith(run.id));
+  });
 });
diff --git a/tests/lib/workers/mcp.test.ts b/tests/lib/workers/mcp.test.ts
index e44fd48..04c9cec 100644
--- a/tests/lib/workers/mcp.test.ts
+++ b/tests/lib/workers/mcp.test.ts
@@ -1,4 +1,12 @@
-import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
+import {
+  describe,
+  it,
+  expect,
+  vi,
+  beforeEach,
+  afterAll,
+  afterEach,
+} from "vitest";
 import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
 import { tmpdir } from "node:os";
 import { join } from "node:path";
@@ -332,3 +340,48 @@ rl.on("line", (l) => {
     ).rejects.toThrow(/failed to start|exited/);
   });
 });
+
+describe("listServerTools (http)", () => {
+  afterEach(() => vi.unstubAllGlobals());
+
+  it("completes the handshake (notifications/initialized) before tools/list", async () => {
+    const methods: string[] = [];
+    let initialized = false;
+    vi.stubGlobal(
+      "fetch",
+      vi.fn(async (_url: string, init: { body: string }) => {
+        const msg = JSON.parse(init.body);
+        methods.push(msg.method);
+        const headers = { "mcp-session-id": "s1" };
+        if (msg.method === "notifications/initialized") {
+          initialized = true;
+          return new Response(null, { status: 202, headers });
+        }
+        if (msg.method === "tools/list" && !initialized) {
+          return Response.json(
+            { jsonrpc: "2.0", id: msg.id, error: { code: -32002 } },
+            { headers },
+          );
+        }
+        const result =
+          msg.method === "tools/list" ? { tools: [{ name: "task_list" }] } : {};
+        return Response.json(
+          { jsonrpc: "2.0", id: msg.id, result },
+          { headers },
+        );
+      }),
+    );
+    const tools = await listServerTools({
+      id: "remote",
+      type: "http",
+      url: "https://r.example/mcp",
+      env: {},
+    });
+    expect(methods).toEqual([
+      "initialize",
+      "notifications/initialized",
+      "tools/list",
+    ]);
+    expect(tools).toEqual([{ name: "task_list", readOnly: true }]);
+  });
+});
diff --git a/tests/scripts/workers-cli.test.ts b/tests/scripts/workers-cli.test.ts
index ba8ba9e..f77c7c1 100644
--- a/tests/scripts/workers-cli.test.ts
+++ b/tests/scripts/workers-cli.test.ts
@@ -349,6 +349,24 @@ describe("logs --follow", () => {
     expect(h.deps.sleep).not.toHaveBeenCalled();
   });
 
+  it("logs without --follow drains every page (hasMore)", async () => {
+    const pages = [
+      {
+        run: run("succeeded"),
+        events: [event(0, "a"), event(1, "b")],
+        hasMore: true,
+      },
+      { run: run("succeeded"), events: [event(2, "c")], hasMore: false },
+    ];
+    let i = 0;
+    const h = harness(() => ({ body: pages[i++] }));
+    expect(await runCli(["logs", RUN_ID], h.deps)).toBe(0);
+    const afters = h.calls.map((c) => new URL(c.url).searchParams.get("after"));
+    expect(afters).toEqual(["-1", "1"]);
+    expect(h.out.join("\n")).toContain("c");
+    expect(h.out.join("\n").split("\n")).toHaveLength(3);
+  });
+
   it("followRun returns the terminal run and exits 1 for cancelled", async () => {
     const h = harness(() => ({ body: { run: run("cancelled"), events: [] } }));
     const client = new Client(DEFAULT_URL, null, h.deps.fetch);

hook: PostToolUse
hook: PostToolUse Completed
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Completed
exec
/bin/zsh -lc "cat tests/components/workers/ask-bar.test.tsx; sed -n '250,470p' scripts/workers-cli.ts; sed -n '1,170p' tests/scripts/workers-cli.test.ts; rg -n 'hasMore|after|cancelRun|function.*submit|stop' app/api/workers lib/workers hooks/use-worker* components/workers tests/lib/workers/mcp.test.ts" in /Users/jasonpoley/prj/dx/src/daax-web
 exited 1 in 0ms:
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const api = vi.hoisted(() => ({
  startRun: vi.fn(),
  update: vi.fn(),
  cancelRun: vi.fn(),
  run: vi.fn(),
}));

vi.mock("@/components/workers/api", () => ({ workersApi: api }));
// The real VoiceInput needs the Web Speech API; expose a button that
// "hears" a fixed phrase so the voice path is exercised end to end.
vi.mock("@/components/ui/voice-input", () => ({
  VoiceInput: ({ onTranscript }: { onTranscript: (t: string) => void }) => (
    <>
      <button type="button" onClick={() => onTranscript("pause")}>
        say pause
      </button>
      <button
        type="button"
        onClick={() => onTranscript("what is blocking release?")}
      >
        say question
      </button>
    </>
  ),
}));

import { AskBar } from "@/components/workers/AskBar";

const run = {
  id: "11111111-1111-1111-1111-111111111111",
  workerId: "w1",
  trigger: "voice",
  input: "what is blocking release?",
  status: "succeeded",
  engine: "claude-cli",
  queuedAt: "2026-09-26T10:00:00Z",
  startedAt: "2026-09-26T10:00:01Z",
  finishedAt: "2026-09-26T10:01:00Z",
  summary: "## Summary\nCI is red on PR 12.",
  error: null,
  usage: {},
  requestedBy: null,
};

describe("AskBar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    api.startRun.mockResolvedValue({
      run: { ...run, status: "queued", summary: null },
    });
    api.run.mockResolvedValue({ run, events: [] });
    api.update.mockResolvedValue({ worker: {} });
  });

  const props = {
    workerId: "w1",
    workerName: "TPM",
    enabled: true,
    brief: null,
    onChanged: vi.fn(),
  };

  it("handles a spoken control phrase without starting a run", async () => {
    render(<AskBar {...props} />);
    fireEvent.click(screen.getByText("say pause"));
    await waitFor(() =>
      expect(api.update).toHaveBeenCalledWith("w1", { enabled: false }),
    );
    expect(api.startRun).not.toHaveBeenCalled();
    expect(await screen.findByText("TPM is paused.")).toBeInTheDocument();
  });

  it("routes a spoken question to a voice-triggered run and shows the answer", async () => {
    render(<AskBar {...props} />);
    fireEvent.click(screen.getByText("say question"));
    await waitFor(() =>
      expect(api.startRun).toHaveBeenCalledWith(
        "w1",
        "what is blocking release?",
        "voice",
      ),
    );
    expect(await screen.findByText("CI is red on PR 12.")).toBeInTheDocument();
  });

  it("sends typed questions on Enter as ad hoc runs", async () => {
    render(<AskBar {...props} />);
    const box = screen.getByLabelText("Ask the worker");
    fireEvent.change(box, { target: { value: "summarise yesterday" } });
    fireEvent.keyDown(box, { key: "Enter" });
    await waitFor(() =>
      expect(api.startRun).toHaveBeenCalledWith(
        "w1",
        "summarise yesterday",
        "adhoc",
      ),
    );
  });

  it("answers 'status' from the latest brief without a run", async () => {
    render(
      <AskBar
        {...props}
        brief={
          { ...run, summary: "## Summary\nAll on track.\n## Goals\nx" } as never
        }
      />,
    );
    const box = screen.getByLabelText("Ask the worker");
    fireEvent.change(box, { target: { value: "status" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(await screen.findByText(/All on track/)).toBeInTheDocument();
    expect(api.startRun).not.toHaveBeenCalled();
  });

  it("keeps a Stop button reachable while a run is active", async () => {
    api.startRun.mockResolvedValue({ run: { ...run, status: "running" } });
    api.run.mockResolvedValue({
      run: { ...run, status: "running" },
      events: [],
    });
    api.cancelRun.mockResolvedValue({ cancelled: true });
    render(<AskBar {...props} />);
    fireEvent.click(screen.getByText("say question"));
    fireEvent.click(await screen.findByLabelText("Stop the run"));
    await waitFor(() => expect(api.cancelRun).toHaveBeenCalledWith(run.id));
  });
});
}

/** Poll a run with ?after=<last seq> until it is terminal and fully read. */
export async function followRun(
  client: Client,
  runId: string,
  opts: FollowOptions,
): Promise<WorkerRun> {
  let after = -1;
  for (;;) {
    const path = `/api/workers/runs/${enc(runId)}?after=${after}`;
    const res = await client.request<RunEvents>("GET", path);
    for (const e of res.events) {
      if (e.seq > after) after = e.seq;
      opts.onEvent?.(e);
    }
    // Drain every page before stopping, even once the run is terminal.
    if (res.hasMore) continue;
    if (TERMINAL_RUN_STATUSES.includes(res.run.status)) return res.run;
    await opts.sleep(opts.intervalMs ?? FOLLOW_INTERVAL_MS);
  }
}

export interface Deps {
  out: (s: string) => void;
  err: (s: string) => void;
  env: Record<string, string | undefined>;
  fetch: FetchFn;
  sleep: (ms: number) => Promise<void>;
}

function need(args: string[], n: number, usage: string): void {
  if (args.length < n) throw new UsageError(`Usage: workers ${usage}`);
  if (args.length > n) throw new UsageError(`Unexpected arg: ${args[n]}`);
}

function finish(run: WorkerRun, io: Deps): number {
  if (run.status === "succeeded") {
    io.out(run.summary?.trim() || "(run succeeded with no summary)");
    return 0;
  }
  io.err(`Run ${run.id} ${run.status}${run.error ? `: ${run.error}` : ""}`);
  if (run.summary) io.out(run.summary.trim());
  return 1;
}

type Show = {
  worker: WorkerSummary;
  goals: WorkerGoal[];
  brief: WorkerRun | null;
};
type RunRes = { run: WorkerRun };
type WorkerRes = { worker: WorkerSummary };
type GoalRes = { goal: WorkerGoal };

function showText({ worker: x, goals, brief: b }: Show): string {
  return [
    formatWorkers([x]),
    `\nID: ${x.id}\nAutonomy: ${x.autonomy}  Executor: ${x.executor}`,
    x.cron ? `Schedule: ${x.cron}` : "",
    x.pausedReason ? `Paused: ${x.pausedReason}` : "",
    `\nGoals:\n${formatGoals(goals)}`,
    b
      ? `\nLatest brief (${formatTime(b.finishedAt ?? b.queuedAt)}):\n${b.summary?.trim() || "(empty)"}`
      : "\nNo brief yet.",
  ]
    .filter(Boolean)
    .join("\n");
}

function parseLimit(raw: string | boolean | undefined): string {
  if (raw === undefined) return "";
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 100) {
    throw new UsageError("--limit must be an integer 1-100");
  }
  return `?limit=${n}`;
}

async function execute(p: ParsedArgs, c: Client, d: Deps): Promise<number> {
  const { args, flags } = p;
  const json = flags.json === true;
  const w = (s: string) => `/api/workers/${enc(s)}`;
  const runPath = (id: string) => `/api/workers/runs/${enc(id)}`;
  const emit = <T>(res: T, human: (r: T) => string): number => {
    d.out(json ? JSON.stringify(res, null, 2) : human(res));
    return 0;
  };
  const show = async <T>(path: string, human: (r: T) => string) =>
    emit(await c.request<T>("GET", path), human);
  const exitFor = (r: WorkerRun) => (r.status === "succeeded" ? 0 : 1);

  switch (p.command) {
    case "ls":
      need(args, 0, "ls [--json]");
      return show<{ workers: WorkerSummary[] }>("/api/workers", (r) =>
        formatWorkers(r.workers),
      );
    case "show":
      need(args, 1, "show <worker> [--json]");
      return show<Show>(w(args[0]), showText);
    case "create": {
      need(args, 0, "create --template <id>");
      if (typeof flags.template !== "string") {
        throw new UsageError("Usage: workers create --template tpm");
      }
      const body = { template: flags.template };
      const res = await c.request<WorkerRes>("POST", "/api/workers", body);
      return emit(res, (r) => `Created ${r.worker.slug} ${r.worker.id}`);
    }
    case "run":
    case "ask": {
      const ask = p.command === "ask";
      const usage = ask ? 'ask <worker> "question"' : "run <worker> [--wait]";
      need(args, ask ? 2 : 1, usage);
      if (ask && !args[1].trim()) throw new UsageError("Question is empty");
      const body = { trigger: "cli", ...(ask ? { input: args[1] } : {}) };
      const path = `${w(args[0])}/runs`;
      const { run } = await c.request<RunRes>("POST", path, body);
      if (!ask && flags.wait !== true) {
        return emit({ run }, (r) => `Queued run ${r.run.id}`);
      }
      if (!ask) d.err(`Run ${run.id} queued; following...`);
      const final = await followRun(c, run.id, {
        sleep: d.sleep,
        onEvent: ask ? undefined : (e) => d.err(formatEvent(e)),
      });
      if (json) return emit({ run: final }, () => "") + exitFor(final);
      return finish(final, d);
    }
    case "pause":
    case "resume": {
      need(args, 1, `${p.command} <worker>`);
      const body = { enabled: p.command === "resume" };
      const res = await c.request<WorkerRes>("PATCH", w(args[0]), body);
      return emit(
        res,
        (r) => `${r.worker.slug}: ${r.worker.enabled ? "resumed" : "paused"}`,
      );
    }
    case "runs": {
      need(args, 1, "runs <worker> [--limit N] [--json]");
      const path = `${w(args[0])}/runs${parseLimit(flags.limit)}`;
      return show<{ runs: WorkerRun[] }>(path, (r) => formatRuns(r.runs));
    }
    case "logs": {
      need(args, 1, "logs <run-id> [--follow]");
      if (flags.follow !== true) {
        // Drain every page: a single response is capped (hasMore).
        const events: RunEvents["events"] = [];
        let after = -1;
        for (;;) {
          const page = await c.request<RunEvents>(
            "GET",
            `${runPath(args[0])}?after=${after}`,
          );
          events.push(...page.events);
          if (!page.hasMore || page.events.length === 0) {
            return emit({ ...page, events }, (r) =>
              r.events.map(formatEvent).join("\n"),
            );
          }
          after = page.events[page.events.length - 1].seq;
        }
      }
      const final = await followRun(c, args[0], {
        sleep: d.sleep,
        onEvent: (e) => d.out(json ? JSON.stringify(e) : formatEvent(e)),
      });
      d.err(`Run ${final.id} ${final.status}`);
      return exitFor(final);
    }
    case "cancel": {
      need(args, 1, "cancel <run-id> [--force]");
      if (flags.force === true) {
        // Operator force-release of a run recovery keeps locked.
        await c.request("DELETE", `${runPath(args[0])}?force=1`);
        d.out(`Force-released ${args[0]}`);
        return 0;
      }
      await c.request("DELETE", runPath(args[0]));
      d.out(`Cancelled ${args[0]}`);
      return 0;
    }
    case "goals": {
      const [worker, sub, arg, ...rest] = args;
      if (!worker || rest.length) {
        throw new UsageError("Usage: workers goals <worker> [add|done]");
      }
      const goals = `${w(worker)}/goals`;
      if (sub === undefined) {
        return show<{ goals: WorkerGoal[] }>(goals, (r) =>
          formatGoals(r.goals),
        );
      }
      if (sub === "add") {
        if (!arg?.trim())
          throw new UsageError('Usage: workers goals <worker> add "title"');
        const body: Record<string, string> = { title: arg };
        if (typeof flags.project === "string") body.projectRef = flags.project;
        if (typeof flags.criteria === "string")
          body.successCriteria = flags.criteria;
        const res = await c.request<GoalRes>("POST", goals, body);
        return emit(res, (r) => `Added goal ${r.goal.id}: ${r.goal.title}`);
      }
      if (sub === "done") {
        if (!arg)
          throw new UsageError("Usage: workers goals <worker> done <goal-id>");
        const path = `${goals}/${enc(arg)}`;
        const res = await c.request<GoalRes>("PATCH", path, { status: "done" });
        return emit(res, (r) => `Goal ${r.goal.id} done`);
      }
      throw new UsageError(`Unknown goals subcommand: ${sub}`);
    }
    default:
      throw new UsageError(`Unknown command: ${p.command}\n\n${HELP}`);
  }
}

/** Run the CLI; returns the process exit code. */
export async function runCli(argv: string[], deps: Deps): Promise<number> {
import { describe, it, expect, vi } from "vitest";
import {
  Client,
  DEFAULT_URL,
  UsageError,
  followRun,
  formatWorkers,
  parseArgs,
  parseAuthHeader,
  resolveBaseUrl,
  runCli,
  type Deps,
} from "@/scripts/workers-cli";
import type { WorkerRun, WorkerRunEvent, WorkerSummary } from "@/types/workers";

const RUN_ID = "11111111-2222-3333-4444-555555555555";

function run(
  status: WorkerRun["status"],
  extra: Partial<WorkerRun> = {},
): WorkerRun {
  return {
    id: RUN_ID,
    workerId: "w1",
    trigger: "cli",
    input: "",
    status,
    engine: "claude-cli",
    queuedAt: "2026-09-26T10:00:00.000Z",
    startedAt: null,
    finishedAt: null,
    summary: null,
    error: null,
    usage: {},
    requestedBy: null,
    cancelRequested: false,
    ...extra,
  };
}

function event(seq: number, text: string): WorkerRunEvent {
  return {
    id: seq,
    runId: RUN_ID,
    seq,
    at: "2026-09-26T10:00:01.000Z",
    type: "message",
    text,
  };
}

function worker(extra: Partial<WorkerSummary> = {}): WorkerSummary {
  return {
    id: "w1",
    slug: "tpm",
    name: "TPM",
    role: "tpm",
    description: "",
    instructions: "",
    engine: "claude-cli",
    model: null,
    runMode: "schedule",
    cron: "0 8 * * *",
    cooldownSeconds: 0,
    maxRunsPerDay: 10,
    timeoutSeconds: 600,
    autonomy: "observe",
    executor: "auto",
    workingDir: null,
    mcpServers: [],
    enabled: true,
    pausedReason: null,
    createdBy: null,
    createdAt: "2026-09-26T09:00:00.000Z",
    updatedAt: "2026-09-26T09:00:00.000Z",
    state: "idle",
    lastRun: null,
    nextRunAt: null,
    activeGoals: 0,
    ...extra,
  };
}

type Handler = (
  url: string,
  init?: RequestInit,
) => { status?: number; body: unknown };

function harness(
  handler: Handler,
  env: Record<string, string | undefined> = {},
) {
  const out: string[] = [];
  const err: string[] = [];
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchFn = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const r = handler(url, init);
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
  });
  const deps: Deps = {
    env,
    fetch: fetchFn,
    sleep: vi.fn(async () => {}),
    out: (s) => out.push(s),
    err: (s) => err.push(s),
  };
  return { deps, out, err, calls, fetchFn };
}

describe("parseArgs", () => {
  it("splits command, positionals and flags", () => {
    expect(parseArgs(["runs", "tpm", "--limit", "5", "--json"])).toEqual({
      command: "runs",
      args: ["tpm"],
      flags: { limit: "5", json: true },
    });
    expect(
      parseArgs(["goals", "tpm", "add", "Ship", "--project=/p"]).flags,
    ).toEqual({
      project: "/p",
    });
  });

  it("defaults to help", () => {
    expect(parseArgs([]).command).toBe("help");
    expect(parseArgs(["ls", "--help"]).command).toBe("help");
  });

  it("rejects unknown options and missing values", () => {
    expect(() => parseArgs(["ls", "--bogus"])).toThrow(UsageError);
    expect(() => parseArgs(["runs", "tpm", "--limit"])).toThrow(UsageError);
    expect(() => parseArgs(["ls", "--json=1"])).toThrow(UsageError);
  });
});

describe("usage errors exit 2", () => {
  it.each([
    [["bogus"]],
    [["show"]],
    [["ask", "tpm"]],
    [["ask", "tpm", "   "]],
    [["create"]],
    [["runs", "tpm", "--limit", "0"]],
    [["goals", "tpm", "frob"]],
    [["ls", "extra"]],
  ])("%j", async (argv) => {
    const h = harness(() => ({ body: {} }));
    expect(await runCli(argv, h.deps)).toBe(2);
    expect(h.fetchFn).not.toHaveBeenCalled();
    expect(h.err.join("\n")).not.toBe("");
  });

  it("help exits 0 and documents DAAX_AUTH_HEADER", async () => {
    const h = harness(() => ({ body: {} }));
    expect(await runCli(["help"], h.deps)).toBe(0);
    expect(h.out[0]).toContain("DAAX_AUTH_HEADER");
  });
});

describe("environment", () => {
  it("resolves DAAX_URL with default and trailing slash tolerance", () => {
    expect(resolveBaseUrl(undefined)).toBe(DEFAULT_URL);
    expect(resolveBaseUrl("")).toBe(DEFAULT_URL);
    expect(resolveBaseUrl("https://daax.example.com/")).toBe(
      "https://daax.example.com",
    );
  });

  it("rejects non-http(s) or malformed DAAX_URL with exit 2", async () => {
zsh:1: no matches found: hooks/use-worker*

exec
/bin/zsh -lc "cat package.json; cat vitest.config.ts; sed -n '1,240p' components/workers/AskBar.tsx; sed -n '270,400p' lib/workers/mcp.ts; sed -n '1,250p' scripts/workers-cli.ts" in /Users/jasonpoley/prj/dx/src/daax-web
 succeeded in 0ms:
{
  "name": "daax",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "concurrently --kill-others-on-fail -n next,terminal -c cyan,magenta \"next dev -p 4200 -H 127.0.0.1\" \"tsx server/terminal-server.ts\"",
    "dev:tailscale": "concurrently --kill-others-on-fail -n next,terminal -c cyan,magenta \"HOST=0.0.0.0 next dev -p 4200 -H 0.0.0.0\" \"TERMINAL_HOST=0.0.0.0 tsx server/terminal-server.ts\"",
    "dev:next": "next dev -p 4200 -H 127.0.0.1",
    "dev:terminal": "tsx server/terminal-server.ts",
    "parse:safe-mcp": "tsx scripts/parse-safe-mcp.ts",
    "sbom:generate": "./scripts/generate-sbom.sh",
    "prebuild": "node -e \"const fs=require('fs'); if (fs.existsSync('3rd-party/safe-mcp')) { require('child_process').execSync('bun run parse:safe-mcp', { stdio: 'inherit' }); } else { console.log('Skipping SAFE-MCP parse (3rd-party/safe-mcp not found)'); }\"",
    "build": "next build",
    "start": "next start",
    "start:prod": "concurrently --kill-others-on-fail -n next,terminal -c cyan,magenta \"HOST=0.0.0.0 next start -p 4200 -H 0.0.0.0\" \"TERMINAL_HOST=0.0.0.0 tsx server/terminal-server.ts\"",
    "start:web": "HOST=0.0.0.0 next start -p 4200 -H 0.0.0.0",
    "start:terminal": "TERMINAL_HOST=0.0.0.0 tsx server/terminal-server.ts",
    "lint": "eslint",
    "lint:fix": "eslint --fix",
    "audit:auth": "bun run scripts/audit-auth-routes.ts",
    "typecheck": "tsc --noEmit",
    "format:write": "prettier --write \"**/*.{ts,tsx,js,jsx,mdx}\" --cache",
    "format:check": "prettier --check \"**/*.{ts,tsx,js,jsx,mdx}\" --cache",
    "docker:build": "docker build --target runner --build-arg VERSION=\"$(git describe --tags --match 'v*' --dirty 2>/dev/null || echo dev)\" --build-arg GIT_SHA=\"$(git rev-parse HEAD)\" --build-arg BUILD_TIME=\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\" -t daax .",
    "docker:run": "docker run -p 4200:4200 -p 4201:4201 -p 18080:18080 --group-add \"$(stat -c %g /var/run/docker.sock 2>/dev/null || stat -f %g /var/run/docker.sock 2>/dev/null || echo 999)\" --security-opt no-new-privileges:true --cap-drop ALL -v /var/run/docker.sock:/var/run/docker.sock -v ${DAAX_WORKSPACE:-~/prj}:/workspace -e HOST_WORKSPACE_PATH=${DAAX_WORKSPACE:-$HOME/prj} -e DAAX_REQUIRE_AUTH=${DAAX_REQUIRE_AUTH:-} -e DAAX_WS_TOKEN_SECRET=${DAAX_WS_TOKEN_SECRET:-} daax",
    "docker:up": "docker compose up -d",
    "docker:up:build": "docker compose up -d --build",
    "docker:down": "docker compose down",
    "docker:logs": "docker compose logs -f",
    "release:build": "docker buildx build --platform linux/amd64 --target runner --build-arg VERSION=\"$(git describe --tags --match 'v*' --dirty 2>/dev/null || echo dev)\" --build-arg GIT_SHA=\"$(git rev-parse HEAD)\" --build-arg BUILD_TIME=\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\" --load -t ghcr.io/daax-dev/daax-web:latest .",
    "release:push": "docker push ghcr.io/daax-dev/daax-web:latest",
    "release:tag": "docker tag ghcr.io/daax-dev/daax-web:latest ghcr.io/daax-dev/daax-web:$(node -p \"require('./package.json').version\") && docker push ghcr.io/daax-dev/daax-web:$(node -p \"require('./package.json').version\")",
    "release": "bun run release:build && bun run release:push",
    "deploy": "bash scripts/deploy.sh",
    "deploy:list": "bash scripts/deploy.sh --list",
    "deploy:kinsale": "ssh ${DEPLOY_HOST_KINSALE:-kinsale} 'cd /opt/daax && source ~/.secrets 2>/dev/null; bash scripts/deploy.sh kinsale'",
    "deploy:muckross": "ssh ${DEPLOY_HOST_MUCKROSS:-muckross} 'cd /opt/daax && source ~/.secrets 2>/dev/null; bash scripts/deploy.sh muckross'",
    "db:migrate": "tsx scripts/db-migrate.ts up",
    "db:migrate:down": "tsx scripts/db-migrate.ts down",
    "db:migrate:create": "node-pg-migrate create -m migrations -j js",
    "db:export": "tsx scripts/export-sqlite-to-postgres.ts",
    "test": "vitest run",
    "test:integration": "./scripts/with-test-postgres.sh node_modules/.bin/vitest run -c vitest.integration.config.ts",
    "test:watch": "vitest",
    "test:ui": "vitest --ui",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:e2e:debug": "playwright test --debug",
    "test:e2e:report": "playwright show-report",
    "test:e2e:ci-local": "./scripts/ci-local-e2e.sh",
    "test:verify": "./scripts/agent-tests/quick-verify.sh",
    "test:agent": "./scripts/agent-tests/run-ui-tests.sh",
    "test:all": "vitest run && playwright test && ./scripts/agent-tests/quick-verify.sh",
    "rebuild-test": "./rebuild-test.sh",
    "rebuild-test:full": "./rebuild-test.sh --full",
    "rebuild-test:all": "./rebuild-test.sh --all",
    "sync:issue-templates": "tsx scripts/sync-issue-templates.ts",
    "workers": "tsx scripts/workers-cli.ts"
  },
  "packageManager": "bun@1.3.9",
  "dependencies": {
    "@anthropic-ai/claude-agent-sdk": "0.3.283",
    "@radix-ui/react-accordion": "^1.2.12",
    "@radix-ui/react-alert-dialog": "^1.1.15",
    "@radix-ui/react-avatar": "^1.1.11",
    "@radix-ui/react-checkbox": "^1.3.3",
    "@radix-ui/react-collapsible": "^1.1.12",
    "@radix-ui/react-dialog": "^1.1.15",
    "@radix-ui/react-dropdown-menu": "^2.1.16",
    "@radix-ui/react-label": "^2.1.8",
    "@radix-ui/react-popover": "^1.1.15",
    "@radix-ui/react-progress": "^1.1.8",
    "@radix-ui/react-radio-group": "^1.3.8",
    "@radix-ui/react-scroll-area": "^1.2.10",
    "@radix-ui/react-select": "^2.2.6",
    "@radix-ui/react-separator": "^1.1.8",
    "@radix-ui/react-slider": "^1.3.6",
    "@radix-ui/react-slot": "^1.2.4",
    "@radix-ui/react-switch": "^1.2.6",
    "@radix-ui/react-tabs": "^1.1.13",
    "@radix-ui/react-toggle": "^1.1.10",
    "@radix-ui/react-toggle-group": "^1.1.11",
    "@radix-ui/react-tooltip": "^1.2.8",
    "@rrweb/types": "^2.0.0-alpha.20",
    "@types/js-yaml": "^4.0.9",
    "@xterm/addon-fit": "^0.10.0",
    "@xterm/addon-web-links": "^0.11.0",
    "@xterm/xterm": "^5.5.0",
    "@xyflow/react": "^12.10.1",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "croner": "10.0.1",
    "dockerode": "^4.0.9",
    "ghostty-web": "0.4.0-next.20.g1858a59",
    "glob": "^13.0.6",
    "gray-matter": "^4.0.3",
    "jose": "^6.1.3",
    "js-yaml": "^4.1.1",
    "lucide-react": "^0.575.0",
    "mermaid": "^11.12.3",
    "motion": "^12.34.3",
    "next": "16.3.4",
    "next-themes": "^0.4.6",
    "node-pg-migrate": "8.0.4",
    "pg": "8.21.0",
    "react": "^19.2.4",
    "react-dom": "^19.2.4",
    "react-resizable-panels": "^4.6.5",
    "recharts": "^3.7.0",
    "rrweb": "^2.0.0-alpha.4",
    "rrweb-player": "^1.0.0-alpha.4",
    "server-only": "^0.0.1",
    "smol-toml": "^1.6.0",
    "sonner": "^2.0.7",
    "tailwind-merge": "^3.5.0",
    "uuid": "^13.0.0",
    "ws": "^8.19.0"
  },
  "optionalDependencies": {
    "node-pty": "^1.1.0"
  },
  "devDependencies": {
    "@playwright/test": "^1.58.2",
    "@tailwindcss/postcss": "^4.2.0",
    "@testing-library/jest-dom": "^6.9.1",
    "@testing-library/react": "^16.3.2",
    "@types/better-sqlite3": "^7.6.13",
    "@types/dockerode": "^3.3.47",
    "@types/glob": "^9.0.0",
    "@types/node": "^20.19.33",
    "@types/pg": "8.20.0",
    "@types/react": "^19.2.14",
    "@types/react-dom": "^19.2.3",
    "@types/uuid": "^11.0.0",
    "@types/ws": "^8.18.1",
    "@vitejs/plugin-react": "^5.1.4",
    "better-sqlite3": "^12.6.2",
    "bun-types": "^1.3.9",
    "concurrently": "^9.2.1",
    "eslint": "^9.39.3",
    "eslint-config-next": "16.3.4",
    "jsdom": "^27.4.0",
    "prettier": "^3.8.1",
    "tailwindcss": "^4.2.0",
    "tsx": "^4.21.0",
    "typescript": "^5.9.3",
    "vitest": "^4.0.18",
    "yaml": "^2.8.2"
  },
  "overrides": {
    "shell-quote": "^1.8.4"
  }
}
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "tests/testcontainers/**",
      "tests/integration/**",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
});
"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Square, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { VoiceInput } from "@/components/ui/voice-input";
import { TERMINAL_RUN_STATUSES, type WorkerRun } from "@/types/workers";
import { workersApi } from "./api";
import { useRunFollower } from "./RunTimeline";
import { Markdown } from "./Markdown";
import { RunStatusBadge } from "./format";
import { firstSection, parseVoiceIntent, speakable } from "./voice";

const SPEAK_KEY = "daax.workers.speak";

function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(new SpeechSynthesisUtterance(speakable(text)));
}

function stopSpeaking() {
  if (typeof window !== "undefined" && "speechSynthesis" in window)
    window.speechSynthesis.cancel();
}

interface AskBarProps {
  workerId: string;
  workerName: string;
  enabled: boolean;
  brief: WorkerRun | null;
  onChanged: () => void;
}

/**
 * Ask a worker a question by typing or by voice. Control phrases ("run now",
 * "pause", "resume", "status", "stop") act directly; anything else becomes
 * an ad hoc run whose answer streams in and can be read aloud.
 */
export function AskBar({
  workerId,
  workerName,
  enabled,
  brief,
  onChanged,
}: AskBarProps) {
  const [text, setText] = useState("");
  const [runId, setRunId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [speakOn, setSpeakOn] = useState(false);
  const { run, events } = useRunFollower(runId);
  const spokenFor = useRef<string | null>(null);

  useEffect(() => {
    setSpeakOn(localStorage.getItem(SPEAK_KEY) === "1");
  }, []);

  useEffect(() => {
    if (
      !run ||
      !TERMINAL_RUN_STATUSES.includes(run.status) ||
      spokenFor.current === run.id
    )
      return;
    spokenFor.current = run.id;
    onChanged();
    if (!speakOn) return;
    if (run.summary) speak(run.summary);
    else if (run.error) speak(`The run ${run.status}. ${run.error}`);
  }, [run, speakOn, onChanged]);

  const toggleSpeak = () => {
    const next = !speakOn;
    setSpeakOn(next);
    localStorage.setItem(SPEAK_KEY, next ? "1" : "0");
    if (!next) stopSpeaking();
  };

  const say = (message: string) => {
    setNotice(message);
    if (speakOn) speak(message);
  };

  const submit = async (raw: string, via: "adhoc" | "voice") => {
    const intent = parseVoiceIntent(raw);
    setError(null);
    setNotice(null);
    try {
      switch (intent.kind) {
        case "stop":
          stopSpeaking();
          if (run && !TERMINAL_RUN_STATUSES.includes(run.status)) {
            await workersApi.cancelRun(run.id);
            say("Cancelled the run.");
          }
          return;
        case "pause":
          await workersApi.update(workerId, { enabled: false });
          onChanged();
          return say(`${workerName} is paused.`);
        case "resume":
          await workersApi.update(workerId, { enabled: true });
          onChanged();
          return say(`${workerName} is running on its schedule again.`);
        case "status":
          return say(
            brief?.summary
              ? speakable(firstSection(brief.summary))
              : "There is no report yet.",
          );
        case "run":
        case "ask": {
          const input = intent.kind === "ask" ? intent.text : "";
          const res = await workersApi.startRun(workerId, input, via);
          setRunId(res.run.id);
          setText("");
          onChanged();
          return;
        }
      }
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const active = run && !TERMINAL_RUN_STATUSES.includes(run.status);
  const lastMessage = [...events]
    .reverse()
    .find((e) => e.type === "message")?.text;

  return (
    <div className="space-y-3 rounded-lg border p-4" data-testid="ask-bar">
      <div className="flex items-start gap-2">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && text.trim()) {
              e.preventDefault();
              void submit(text, "adhoc");
            }
          }}
          placeholder={`Ask ${workerName} — e.g. "what's blocking the Postgres work?" — or say "run now", "pause", "status"`}
          className="min-h-[44px] flex-1 resize-none"
          rows={1}
          aria-label="Ask the worker"
          disabled={Boolean(active)}
        />
        <VoiceInput
          onTranscript={(t) => void submit(t, "voice")}
          disabled={Boolean(active)}
        />
        <Button
          onClick={() => void submit(text, "adhoc")}
          disabled={!text.trim() || Boolean(active)}
          aria-label="Send"
        >
          <Send className="h-4 w-4" />
        </Button>
        {active && (
          <Button
            variant="outline"
            onClick={() => void submit("stop", "adhoc")}
            aria-label="Stop the run"
          >
            <Square className="h-4 w-4" />
          </Button>
        )}
        <Button
          variant="outline"
          onClick={toggleSpeak}
          aria-label={
            speakOn ? "Stop reading answers aloud" : "Read answers aloud"
          }
          aria-pressed={speakOn}
          title={speakOn ? "Answers are read aloud" : "Answers are silent"}
        >
          {speakOn ? (
            <Volume2 className="h-4 w-4" />
          ) : (
            <VolumeX className="h-4 w-4" />
          )}
        </Button>
      </div>
      {!enabled && (
        <p className="text-xs text-muted-foreground">
          Automatic runs are paused; questions and &ldquo;run now&rdquo; still
          work.
        </p>
      )}
      {notice && <p className="text-sm">{notice}</p>}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {run && (
        <div className="space-y-2" data-testid="ask-answer">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <RunStatusBadge status={run.status} />
            {active && <span>{events.length} steps so far…</span>}
          </div>
          {active && lastMessage && (
            <p className="text-sm text-muted-foreground">{lastMessage}</p>
          )}
          {run.summary && <Markdown text={run.summary} />}
          {run.error && <p className="text-sm text-destructive">{run.error}</p>}
        </div>
      )}
    </div>
  );
}
          msg = JSON.parse(line);
        } catch {
          continue;
        }
        if (msg.id === 1) {
          if (msg.error)
            return done(new Error(msg.error.message ?? "initialize failed"));
          send({ jsonrpc: "2.0", method: "notifications/initialized" });
          send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
        } else if (msg.id === 2) {
          if (msg.error)
            return done(new Error(msg.error.message ?? "tools/list failed"));
          return done(null, msg.result?.tools ?? []);
        }
      }
    });
    proc.stderr.on("data", (c: Buffer) => {
      stderrTail.push(c.toString());
    });
    proc.on("error", (e) => done(new Error(`failed to start: ${e.message}`)));
    proc.on("close", (code) =>
      done(
        new Error(
          `exited (${code ?? "signal"}) before listing tools${stderrTail.toString() ? `: ${stderrTail.toString().trim()}` : ""}`,
        ),
      ),
    );
    send({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "daax-workers", version: "1" },
      },
    });
  });
}

async function listViaHttp(
  server: ResolvedMcpServer,
  signal: AbortSignal | undefined,
): Promise<RawTool[]> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  };
  const post = async (body: object, sessionId?: string) => {
    const res = await fetch(server.url!, {
      method: "POST",
      headers: sessionId
        ? { ...headers, "mcp-session-id": sessionId }
        : headers,
      body: JSON.stringify(body),
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(LIST_TIMEOUT_MS)])
        : AbortSignal.timeout(LIST_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    // Streamable HTTP may answer with an SSE frame; take the first data line.
    const json = text.trimStart().startsWith("{")
      ? text
      : (text
          .split("\n")
          .find((l) => l.startsWith("data:"))
          ?.slice(5) ?? "{}");
    return {
      json: JSON.parse(json),
      sessionId: res.headers.get("mcp-session-id") ?? sessionId,
    };
  };
  const init = await post({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "daax-workers", version: "1" },
    },
  });
  // Servers that enforce the handshake reject tools/list until this is sent.
  await post(
    { jsonrpc: "2.0", method: "notifications/initialized" },
    init.sessionId,
  );
  const list = await post(
    { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
    init.sessionId,
  );
  return (list.json?.result?.tools as RawTool[]) ?? [];
}

/** List and classify a server's tools. Errors propagate to the caller. */
export async function listServerTools(
  server: ResolvedMcpServer,
  opts: { cwd?: string; signal?: AbortSignal } = {},
): Promise<McpToolInfo[]> {
  const raw =
    server.type === "http"
      ? await listViaHttp(server, opts.signal)
      : await listViaStdio(server, opts.cwd, opts.signal);
  return raw
    .filter((t) => typeof t?.name === "string")
    .map((t) => ({ name: t.name, readOnly: isReadOnlyTool(t) }));
}
#!/usr/bin/env tsx
// Digital Workers CLI: a thin client over /api/workers
// (docs/plans/digital-workers.md §7.2). Run with: bun run workers <cmd>

import { realpathSync } from "fs";
import { fileURLToPath } from "url";
import {
  TERMINAL_RUN_STATUSES,
  type WorkerGoal,
  type WorkerRun,
  type WorkerRunEvent,
  type WorkerSummary,
} from "../types/workers";

export const DEFAULT_URL = "http://127.0.0.1:4200";
export const FOLLOW_INTERVAL_MS = 2000;

export const HELP = `Usage: bun run workers <command> [options]

Commands:
  ls [--json]                                List workers
  show <worker> [--json]                     Worker detail, goals and latest brief
  create --template tpm                      Create a worker from a template
  run <worker> [--wait]                      Trigger a run (--wait: follow to completion)
  ask <worker> "question"                    Ask the worker; waits and prints the answer
  pause <worker> | resume <worker>           Disable / enable a worker
  runs <worker> [--limit N] [--json]         Recent runs
  logs <run-id> [--follow]                   Run events (--follow polls every 2s)
  cancel <run-id> [--force]                  Cancel a run; --force releases one recovery keeps locked
  goals <worker> [--json]                    List goals
  goals <worker> add "title" [--project <path>] [--criteria "..."]
  goals <worker> done <goal-id>              Mark a goal done
  help                                       Show this help

<worker> is a worker id or slug.

Environment:
  DAAX_URL           Base URL of daax (default ${DEFAULT_URL})
  DAAX_AUTH_HEADER   Optional extra request header "Name: value" for proxied
                     deployments (e.g. a forward-auth token). Never printed.

Exit codes: 0 success, 1 run failed or API error, 2 usage or auth error.`;

export class UsageError extends Error {}
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const VALUE_FLAGS = new Set(["limit", "project", "criteria", "template"]);
const BOOL_FLAGS = new Set(["json", "wait", "follow", "force", "help"]);

export interface ParsedArgs {
  command: string;
  args: string[];
  flags: Record<string, string | boolean>;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const args: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h") {
      flags.help = true;
    } else if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      const name = eq === -1 ? a.slice(2) : a.slice(2, eq);
      if (BOOL_FLAGS.has(name)) {
        if (eq !== -1) throw new UsageError(`--${name} takes no value`);
        flags[name] = true;
      } else if (VALUE_FLAGS.has(name)) {
        const value = eq === -1 ? argv[++i] : a.slice(eq + 1);
        if (value === undefined || value === "") {
          throw new UsageError(`--${name} requires a value`);
        }
        flags[name] = value;
      } else {
        throw new UsageError(`Unknown option: --${name}`);
      }
    } else {
      args.push(a);
    }
  }
  const command = flags.help ? "help" : (args.shift() ?? "help");
  return { command, args, flags };
}

export function resolveBaseUrl(raw: string | undefined): string {
  const value = (raw ?? "").trim() || DEFAULT_URL;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new UsageError(`DAAX_URL is not a valid URL: ${value}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UsageError(`DAAX_URL must be http(s), got ${url.protocol}`);
  }
  return value.replace(/\/+$/, "");
}

/** Parse DAAX_AUTH_HEADER ("Name: value"). Error messages never include the value. */
export function parseAuthHeader(
  raw: string | undefined,
): [string, string] | null {
  if (raw === undefined || raw.trim() === "") return null;
  const idx = raw.indexOf(":");
  const name = idx === -1 ? "" : raw.slice(0, idx).trim();
  const value = idx === -1 ? "" : raw.slice(idx + 1).trim();
  if (!/^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/.test(name) || !value) {
    throw new UsageError('DAAX_AUTH_HEADER must look like "Name: value"');
  }
  if (/[\r\n]/.test(value)) {
    throw new UsageError("DAAX_AUTH_HEADER value must not contain newlines");
  }
  return [name, value];
}

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export class Client {
  constructor(
    private readonly baseUrl: string,
    private readonly authHeader: [string, string] | null,
    private readonly fetchFn: FetchFn,
  ) {}

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { accept: "application/json" };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (this.authHeader) headers[this.authHeader[0]] = this.authHeader[1];
    let res: Response;
    try {
      res = await this.fetchFn(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (err) {
      throw new ApiError(0, `Cannot reach ${this.baseUrl}: ${errText(err)}`);
    }
    const text = await res.text();
    const data: unknown = safeJson(text);
    if (!res.ok) {
      const d = (data ?? {}) as { error?: string; message?: string };
      const msg = [d.error, d.message].filter(Boolean).join(": ");
      throw new ApiError(res.status, msg || `HTTP ${res.status}`);
    }
    return data as T;
  }
}

function safeJson(text: string): unknown {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const enc = encodeURIComponent;

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleString();
}

const t = (iso: string | null | undefined) => formatTime(iso);

/** Align rows under a "A|B|C" header; the last column is not padded. */
export function formatTable<T>(
  header: string,
  items: T[],
  row: (x: T) => string[],
): string {
  const rows = [header.split("|"), ...items.map(row)];
  const widths = rows[0].map((_, i) =>
    Math.max(...rows.map((r) => r[i].length)),
  );
  const pad = (c: string, i: number, r: string[]) =>
    i === r.length - 1 ? c : c.padEnd(widths[i]);
  return rows.map((r) => r.map(pad).join("  ").trimEnd()).join("\n");
}

export const formatWorkers = (ws: WorkerSummary[]) =>
  ws.length === 0
    ? "No workers."
    : formatTable("NAME/SLUG|STATE|MODE|ENGINE|NEXT RUN|LAST RUN", ws, (w) => {
        const r = w.lastRun;
        const last = r ? `${r.status} ${t(r.finishedAt ?? r.queuedAt)}` : "-";
        return [
          `${w.name} (${w.slug})`,
          w.state,
          w.runMode,
          w.engine,
          t(w.nextRunAt),
          last,
        ];
      });

export const formatRuns = (runs: WorkerRun[]) =>
  runs.length === 0
    ? "No runs."
    : formatTable("RUN ID|STATUS|TRIGGER|QUEUED|FINISHED", runs, (r) => [
        r.id,
        r.status,
        r.trigger,
        t(r.queuedAt),
        t(r.finishedAt),
      ]);

export const formatGoals = (goals: WorkerGoal[]) =>
  goals.length === 0
    ? "No goals."
    : formatTable("GOAL ID|STATUS|PRI|TITLE|PROJECT", goals, (g) => [
        g.id,
        g.status,
        String(g.priority),
        g.title,
        g.projectRef ?? "-",
      ]);

export function formatEvent(e: WorkerRunEvent): string {
  const text = (e.text ?? "").replace(/\s+/g, " ").trim();
  return [formatTime(e.at), e.type, e.tool ?? "", text]
    .filter((p) => p !== "")
    .join("  ");
}

type RunEvents = {
  run: WorkerRun;
  events: WorkerRunEvent[];
  hasMore?: boolean;
};

export interface FollowOptions {
  sleep: (ms: number) => Promise<void>;
  onEvent?: (e: WorkerRunEvent) => void;
  intervalMs?: number;
}

hook: PostToolUse
hook: PostToolUse
hook: PostToolUse Completed
hook: PostToolUse Completed
mcp: backlog/get_workflow_overview started
mcp: backlog/get_workflow_overview (failed)
MCP tool call requires approval, but approval policy is never
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Completed
hook: PreToolUse Completed
exec
/bin/zsh -lc "sed -n '1,180p' tests/lib/workers/mcp.test.ts; cat tests/setup.ts; git diff HEAD -- lib/workers/mcp.ts components/workers/AskBar.tsx scripts/workers-cli.ts tests/lib/workers/mcp.test.ts tests/components/workers/ask-bar.test.tsx tests/scripts/workers-cli.test.ts; rg --files -g '*AGENTS.md' -g '*workflow*' .claude backlog | head -30" in /Users/jasonpoley/prj/dx/src/daax-web
exec
/bin/zsh -lc 'bun run test tests/lib/workers/mcp.test.ts tests/components/workers/ask-bar.test.tsx tests/scripts/workers-cli.test.ts --no-cache' in /Users/jasonpoley/prj/dx/src/daax-web
exec
/bin/zsh -lc "sed -n '1,210p' components/workers/RunTimeline.tsx; cat 'app/api/workers/runs/[runId]/route.ts'; rg -n 'hasMore|after|cancelRun' app/api/workers lib/workers components/workers/api.ts; rg -n 'stop' components/workers/voice.ts; command -v backlog" in /Users/jasonpoley/prj/dx/src/daax-web
 succeeded in 2ms:
/Users/jasonpoley/.nvm/versions/node/v24.8.0/bin/backlog

hook: PostToolUse
 succeeded in 34ms:
.claude/workflow.md

hook: PostToolUse
hook: PostToolUse Completed
hook: PostToolUse Completed
 succeeded in 901ms:

 RUN  v4.1.6 /Users/jasonpoley/prj/dx/src/daax-web


 Test Files  3 passed (3)
      Tests  98 passed (98)
   Start at  11:22:39
   Duration  678ms (transform 179ms, setup 149ms, import 272ms, tests 323ms, environment 741ms)


hook: PostToolUse
hook: PostToolUse Completed
codex
All three added regression tests pass; the three affected suites report 98 passing tests. The code sends the MCP notification before `tools/list`, exposes Stop during an active run, and advances the CLI log cursor across pages. Adjacent cancellation and pagination behavior is being checked for regressions.
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Completed
hook: PreToolUse Completed
hook: PreToolUse Completed
exec
/bin/zsh -lc 'bun x prettier --check components/workers/AskBar.tsx lib/workers/mcp.ts scripts/workers-cli.ts tests/components/workers/ask-bar.test.tsx tests/lib/workers/mcp.test.ts tests/scripts/workers-cli.test.ts; bun x eslint components/workers/AskBar.tsx lib/workers/mcp.ts scripts/workers-cli.ts tests/components/workers/ask-bar.test.tsx tests/lib/workers/mcp.test.ts tests/scripts/workers-cli.test.ts' in /Users/jasonpoley/prj/dx/src/daax-web
exec
/bin/zsh -lc 'bun run typecheck --incremental false' in /Users/jasonpoley/prj/dx/src/daax-web
exec
/bin/zsh -lc 'bun run test tests/lib/workers tests/components/workers tests/scripts/workers-cli.test.ts tests/app/api/workers --no-cache' in /Users/jasonpoley/prj/dx/src/daax-web
exec
/bin/zsh -lc "backlog --help; sed -n '610,630p' lib/workers/store.ts; nl -ba tests/lib/workers/mcp.test.ts | tail -50; nl -ba tests/components/workers/ask-bar.test.tsx | tail -22; nl -ba tests/scripts/workers-cli.test.ts | sed -n '345,378p'; rg --files tests | rg 'workers.*(route|api)|workers' | tail -30" in /Users/jasonpoley/prj/dx/src/daax-web
 succeeded in 366ms:
Usage: backlog [options] [command]

Backlog.md - Project management CLI

Options:
  -v, --version                  display version number
  -h, --help                     display help for command

Commands:
  init [options] [projectName]   initialize backlog project in the current
                                 repository
  task|tasks [options] [taskId]
  search [options] [query]       search tasks, documents, and decisions using
                                 the shared index
  draft [options] [taskId]
  board [options]                display tasks in a Kanban board
  doc
  decision
  agents [options]               manage agent instruction files
  config                         manage backlog configuration
  sequence                       list and inspect execution sequences computed
                                 from task dependencies
  cleanup                        move completed tasks to completed folder based
                                 on age
  browser [options]              open browser interface for task management
                                 (press Ctrl+C or Cmd+C to stop)
  overview                       display project statistics and metrics
  completion                     manage shell completion scripts
  mcp
  help [command]                 display help for command
      event.data === undefined ? null : JSON.stringify(event.data),
    ],
  );
}

export async function listRunEvents(
  runId: string,
  afterSeq = -1,
  limit = 500,
): Promise<WorkerRunEvent[]> {
  const res = await query(
    `SELECT * FROM worker_run_events WHERE run_id = $1 AND seq > $2
      ORDER BY seq LIMIT $3`,
    [runId, afterSeq, limit],
  );
  return res.rows.map(toEvent);
}
   338	        env: {},
   339	      }),
   340	    ).rejects.toThrow(/failed to start|exited/);
   341	  });
   342	});
   343	
   344	describe("listServerTools (http)", () => {
   345	  afterEach(() => vi.unstubAllGlobals());
   346	
   347	  it("completes the handshake (notifications/initialized) before tools/list", async () => {
   348	    const methods: string[] = [];
   349	    let initialized = false;
   350	    vi.stubGlobal(
   351	      "fetch",
   352	      vi.fn(async (_url: string, init: { body: string }) => {
   353	        const msg = JSON.parse(init.body);
   354	        methods.push(msg.method);
   355	        const headers = { "mcp-session-id": "s1" };
   356	        if (msg.method === "notifications/initialized") {
   357	          initialized = true;
   358	          return new Response(null, { status: 202, headers });
   359	        }
   360	        if (msg.method === "tools/list" && !initialized) {
   361	          return Response.json(
   362	            { jsonrpc: "2.0", id: msg.id, error: { code: -32002 } },
   363	            { headers },
   364	          );
   365	        }
   366	        const result =
   367	          msg.method === "tools/list" ? { tools: [{ name: "task_list" }] } : {};
   368	        return Response.json(
   369	          { jsonrpc: "2.0", id: msg.id, result },
   370	          { headers },
   371	        );
   372	      }),
   373	    );
   374	    const tools = await listServerTools({
   375	      id: "remote",
   376	      type: "http",
   377	      url: "https://r.example/mcp",
   378	      env: {},
   379	    });
   380	    expect(methods).toEqual([
   381	      "initialize",
   382	      "notifications/initialized",
   383	      "tools/list",
   384	    ]);
   385	    expect(tools).toEqual([{ name: "task_list", readOnly: true }]);
   386	  });
   387	});
   111	      />,
   112	    );
   113	    const box = screen.getByLabelText("Ask the worker");
   114	    fireEvent.change(box, { target: { value: "status" } });
   115	    fireEvent.keyDown(box, { key: "Enter" });
   116	    expect(await screen.findByText(/All on track/)).toBeInTheDocument();
   117	    expect(api.startRun).not.toHaveBeenCalled();
   118	  });
   119	
   120	  it("keeps a Stop button reachable while a run is active", async () => {
   121	    api.startRun.mockResolvedValue({ run: { ...run, status: "running" } });
   122	    api.run.mockResolvedValue({
   123	      run: { ...run, status: "running" },
   124	      events: [],
   125	    });
   126	    api.cancelRun.mockResolvedValue({ cancelled: true });
   127	    render(<AskBar {...props} />);
   128	    fireEvent.click(screen.getByText("say question"));
   129	    fireEvent.click(await screen.findByLabelText("Stop the run"));
   130	    await waitFor(() => expect(api.cancelRun).toHaveBeenCalledWith(run.id));
   131	  });
   132	});
   345	    const afters = h.calls.map((c) => new URL(c.url).searchParams.get("after"));
   346	    expect(afters).toEqual(["-1", "1"]);
   347	    expect(h.out).toHaveLength(3);
   348	    // A full page is fetched immediately, without the poll delay.
   349	    expect(h.deps.sleep).not.toHaveBeenCalled();
   350	  });
   351	
   352	  it("logs without --follow drains every page (hasMore)", async () => {
   353	    const pages = [
   354	      {
   355	        run: run("succeeded"),
   356	        events: [event(0, "a"), event(1, "b")],
   357	        hasMore: true,
   358	      },
   359	      { run: run("succeeded"), events: [event(2, "c")], hasMore: false },
   360	    ];
   361	    let i = 0;
   362	    const h = harness(() => ({ body: pages[i++] }));
   363	    expect(await runCli(["logs", RUN_ID], h.deps)).toBe(0);
   364	    const afters = h.calls.map((c) => new URL(c.url).searchParams.get("after"));
   365	    expect(afters).toEqual(["-1", "1"]);
   366	    expect(h.out.join("\n")).toContain("c");
   367	    expect(h.out.join("\n").split("\n")).toHaveLength(3);
   368	  });
   369	
   370	  it("followRun returns the terminal run and exits 1 for cancelled", async () => {
   371	    const h = harness(() => ({ body: { run: run("cancelled"), events: [] } }));
   372	    const client = new Client(DEFAULT_URL, null, h.deps.fetch);
   373	    const final = await followRun(client, RUN_ID, { sleep: h.deps.sleep });
   374	    expect(final.status).toBe("cancelled");
   375	    expect(await runCli(["logs", RUN_ID, "--follow"], h.deps)).toBe(1);
   376	  });
   377	});
   378	
tests/e2e/workers.spec.ts
tests/integration/workers-pg.test.ts
tests/api/workers-runs-route.test.ts
tests/api/workers-route.test.ts
tests/api/workers-fixtures.ts
tests/scripts/workers-cli.test.ts
tests/lib/workers/cli-runner-process.test.ts
tests/lib/workers/validation.test.ts
tests/lib/workers/cli-runner.test.ts
tests/lib/workers/signals.test.ts
tests/lib/workers/runner.test.ts
tests/lib/workers/plan.test.ts
tests/lib/workers/sdk-runner.test.ts
tests/lib/workers/host-ref.test.ts
tests/lib/workers/runner-redaction.test.ts
tests/lib/workers/service.test.ts
tests/lib/workers/events.test.ts
tests/lib/workers/mcp.test.ts
tests/lib/workers/scheduler.test.ts
tests/components/workers/schedule.test.ts
tests/components/workers/voice.test.ts
tests/components/workers/ask-bar.test.tsx
tests/components/workers/markdown.test.tsx

hook: PostToolUse
hook: PostToolUse Completed
 succeeded in 2451ms:
Checking formatting...
All matched files use Prettier code style!

 exited 1 in 2961ms:

 RUN  v4.1.6 /Users/jasonpoley/prj/dx/src/daax-web

 ❯ tests/lib/workers/host-ref.test.ts (32 tests | 2 failed) 630ms
     × reads this process's real start time 116ms
     × finds a detached claude process by its nonce and stops its group 392ms
 ❯ tests/lib/workers/sdk-runner.test.ts (3 tests | 1 failed) 441ms
     × records host:pending before spawning, passes the execution nonce as sessionId, spawns in its own group and verifies cleanup 438ms
 ❯ tests/lib/workers/cli-runner-process.test.ts (4 tests | 1 failed) 945ms
     × records host:pending#<nonce> before spawning, then the real ref; a hung post-spawn write never blocks completion 137ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 4 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  tests/lib/workers/cli-runner-process.test.ts > runCliEngine lifecycle (real processes) > records host:pending#<nonce> before spawning, then the real ref; a hung post-spawn write never blocks completion
AssertionError: expected 'host:73194#11111111-2222-4333-8444-55…' to match /^host:\d+\|.+#11111111-2222-4333-8444…/

- Expected:
/^host:\d+\|.+#11111111-2222-4333-8444-555555555555$/

+ Received:
"host:73194#11111111-2222-4333-8444-555555555555"

 ❯ tests/lib/workers/cli-runner-process.test.ts:64:21
     62|     expect(res.final).toMatchObject({ ok: true, summary: "pong" });
     63|     expect(refs[0]).toBe(`host:pending#${NONCE}`);
     64|     expect(refs[1]).toMatch(new RegExp(`^host:\\d+\\|.+#${NONCE}$`));
       |                     ^
     65|   }, 15_000);
     66|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/4]⎯

 FAIL  tests/lib/workers/host-ref.test.ts > host executor refs > reads this process's real start time
AssertionError: expected null to be truthy

- Expected:
true

+ Received:
null

 ❯ tests/lib/workers/host-ref.test.ts:49:43
     47|
     48|   it("reads this process's real start time", () => {
     49|     expect(processStartTime(process.pid)).toBeTruthy();
       |                                           ^
     50|   });
     51| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/4]⎯

 FAIL  tests/lib/workers/host-ref.test.ts > marker lookup against real processes > finds a detached claude process by its nonce and stops its group
Error: cannot read the process table
 ❯ findMarkedProcesses lib/workers/cli-runner.ts:397:31
    395| ): { pid: number; pgid: number }[] {
    396|   const res = ps();
    397|   if (res.status !== 0) throw new Error("cannot read the process table…
       |                               ^
    398|   const out: { pid: number; pgid: number }[] = [];
    399|   for (const line of (res.stdout ?? "").split("\n")) {
 ❯ tests/lib/workers/host-ref.test.ts:217:12

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/4]⎯

 FAIL  tests/lib/workers/sdk-runner.test.ts > runSdkEngine > records host:pending before spawning, passes the execution nonce as sessionId, spawns in its own group and verifies cleanup
AssertionError: expected 'host:73312#11111111-2222-4333-8444-66…' to match /^host:73312\|.+#11111111-2222-4333-84…/

- Expected:
/^host:73312\|.+#11111111-2222-4333-8444-66666666d00d$/

+ Received:
"host:73312#11111111-2222-4333-8444-66666666d00d"

 ❯ tests/lib/workers/sdk-runner.test.ts:81:21
     79|     expect(options.sessionId).toBe(NONCE);
     80|     expect(refs[0]).toBe(`host:pending#${NONCE}`);
     81|     expect(refs[1]).toMatch(new RegExp(`^host:${childPid}\\|.+#${NONCE…
       |                     ^
     82|     expect(res.final).toMatchObject({ ok: true, summary: "done" });
     83|     // The whole group (including the backgrounded sleep) is gone.

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/4]⎯


 Test Files  3 failed | 15 passed (18)
      Tests  4 failed | 338 passed (342)
   Start at  11:22:49
   Duration  2.73s (transform 2.04s, setup 1.39s, import 3.39s, tests 3.51s, environment 9.90s)

error: script "test" exited with code 1

hook: PostToolUse
hook: PostToolUse
hook: PreToolUse
hook: PostToolUse Completed
hook: PostToolUse Completed
hook: PreToolUse Completed
exec
/bin/zsh -lc 'bun run test tests/api/workers-runs-route.test.ts tests/api/workers-route.test.ts --no-cache; git status --short' in /Users/jasonpoley/prj/dx/src/daax-web
 succeeded in 860ms:
$ vitest run tests/api/workers-runs-route.test.ts tests/api/workers-route.test.ts --no-cache

 RUN  v4.1.6 /Users/jasonpoley/prj/dx/src/daax-web


 Test Files  2 passed (2)
      Tests  51 passed (51)
   Start at  11:22:56
   Duration  529ms (transform 221ms, setup 96ms, import 261ms, tests 25ms, environment 497ms)

 M AGENTS.md
?? .logs/reviews/codex-digital-workers-r13.md
?? .logs/reviews/codex-digital-workers-r14.md
?? .worktrees/
?? "backlog/tasks/task-002 - daax-web-native-OIDC-login-against-the-hosts-Pocket-ID-remove-oauth2-proxy-from-daax.md"

hook: PostToolUse
hook: PostToolUse Completed
 succeeded in 9549ms:
hook: PostToolUse
hook: PostToolUse Completed
codex
The broader worker tests passed 338 tests and failed four process-lifecycle tests because process-table/start-time lookup was unavailable. Those failures are in code unchanged by this commit. The 51 worker API tests, typecheck, and changed-file lint and formatting checks passed.
hook: PreToolUse
hook: PreToolUse Completed
exec
/bin/zsh -lc 'ps -p $$ -o lstart=; git diff HEAD''^ HEAD -- lib/workers/cli-runner.ts lib/workers/sdk-runner.ts tests/lib/workers/host-ref.test.ts tests/lib/workers/cli-runner-process.test.ts tests/lib/workers/sdk-runner.test.ts; sed -n '"'330,405p' lib/workers/cli-runner.ts; sed -n '1,95p' tests/lib/workers/sdk-runner.test.ts; git rev-parse --short HEAD" in /Users/jasonpoley/prj/dx/src/daax-web
 succeeded in 84ms:
zsh:1: operation not permitted: ps
  const [body, nonce = null] = ref.slice("host:".length).split("#");
  if (body === "pending") return { pgid: null, start: null, nonce };
  const [pid, ...rest] = body.split("|");
  const pgid = Number(pid);
  if (!Number.isInteger(pgid) || pgid <= 1) return null;
  return { pgid, start: rest.length ? rest.join("|") : null, nonce };
}

export function hostRef(
  pid: number | null,
  start: string | null,
  nonce: string,
): string {
  const body = pid ? `${pid}${start ? `|${start}` : ""}` : "pending";
  return `host:${body}#${nonce}`;
}

/** Marker placed in every engine command line (in its prompt). */
export function runMarker(nonce: string): string {
  return `daax-run:${nonce}`;
}

// Engine executables: native/shim `claude` / `codex`, or the npm packages'
// entry points as run by node (`.../@anthropic-ai/claude-code/cli.js`,
// `.../@openai/codex/bin/codex.js`).
const ENGINE_EXE =
  /(^|\/)(claude|codex)(\.js)?$|\/@anthropic-ai\/claude-code\/cli\.m?js$|\/@openai\/codex\/bin\/codex\.js$/;
// Programs that run an engine script given as their first argument.
const INTERPRETER = /(^|\/)(node|nodejs|bun|sh|bash|zsh)$/;

/**
 * Is this command line an engine process carrying this execution's nonce?
 *  - The executable is a claude/codex CLI: the first token, or the second
 *    only behind a real interpreter (`node .../codex.js`, `sh .../claude`).
 *  - The nonce appears as `(daax-run:<nonce>)` or as the `--session-id`
 *    token. The nonce is a random UUID that exists only in the executor
 *    reference, so no operator command or prompt can contain it by chance.
 */
export function isEngineCommandFor(command: string, nonce: string): boolean {
  const tokens = command.trim().split(/\s+/);
  const exeOk =
    ENGINE_EXE.test(tokens[0] ?? "") ||
    (INTERPRETER.test(tokens[0] ?? "") && ENGINE_EXE.test(tokens[1] ?? ""));
  if (!exeOk) return false;
  if (command.includes(`(${runMarker(nonce)})`)) return true;
  return tokens.some(
    (t, i) =>
      t === `--session-id=${nonce}` ||
      (t === "--session-id" && tokens[i + 1] === nonce),
  );
}

/** Thrown when an execution may still be alive but cannot be proven ours. */
export class AmbiguousExecutionError extends Error {}

/**
 * Engine processes carrying this execution's nonce. Throws if the process
 * table cannot be read, so recovery stays unverified.
 */
export function findMarkedProcesses(
  nonce: string,
  ps: () => { status: number | null; stdout: string } = () =>
    spawnSync("ps", ["-A", "-ww", "-o", "pid=,pgid=,command="], {
      encoding: "utf8",
    }) as { status: number | null; stdout: string },
): { pid: number; pgid: number }[] {
  const res = ps();
  if (res.status !== 0) throw new Error("cannot read the process table");
  const out: { pid: number; pgid: number }[] = [];
  for (const line of (res.stdout ?? "").split("\n")) {
    const m = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line);
    if (m && isEngineCommandFor(m[3], nonce)) {
      out.push({ pid: Number(m[1]), pgid: Number(m[2]) });
    }
  }
  return out;
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The agent-sdk engine with a mocked query(): the mock calls the engine's own
 * spawnClaudeCodeProcess (a real detached child) and yields a result, so the
 * lifecycle guarantees are exercised with real processes.
 */
const sdk = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@anthropic-ai/claude-agent-sdk", () => sdk);

import { runSdkEngine } from "@/lib/workers/sdk-runner";

const RUN = "5f0c1d7e-0000-4000-8000-00000000d00d";
const NONCE = "11111111-2222-4333-8444-66666666d00d";
const base = () => ({
  runId: RUN,
  nonce: NONCE,
  model: null,
  workingDir: process.cwd(),
  prompts: { system: "s", user: "u" },
  policy: { allowed: [], denied: [], mcpEnabled: {} },
  servers: [],
  timeoutMs: 20_000,
  signal: new AbortController().signal,
  onEvent: async () => undefined,
});

type SpawnFn = (o: {
  command: string;
  args: string[];
  cwd?: string;
  env: Record<string, string | undefined>;
}) => { pid?: number };

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = "sk-test-key-for-unit-tests";
});
afterEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
  sdk.query.mockReset();
});

describe("runSdkEngine", () => {
  it("refuses to run without ANTHROPIC_API_KEY", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const res = await runSdkEngine(base());
    expect(res.final.ok).toBe(false);
    expect(res.final.error).toMatch(/ANTHROPIC_API_KEY/);
    expect(sdk.query).not.toHaveBeenCalled();
  });

  it("records host:pending before spawning, passes the execution nonce as sessionId, spawns in its own group and verifies cleanup", async () => {
    let options: { sessionId?: string; spawnClaudeCodeProcess?: SpawnFn } = {};
    let childPid: number | undefined;
    sdk.query.mockImplementation(({ options: o }) => {
      options = o;
      return (async function* () {
        const child = o.spawnClaudeCodeProcess({
          command: "sh",
          args: ["-c", `sleep 30 & sleep 30; : ${RUN}`],
          cwd: process.cwd(),
          env: { PATH: process.env.PATH },
        });
        childPid = child.pid;
        yield {
          type: "result",
          subtype: "success",
          is_error: false,
          result: "done",
          num_turns: 1,
        };
      })();
    });
    const refs: string[] = [];
    const res = await runSdkEngine({
      ...base(),
      onExecutor: async (r: string) => void refs.push(r),
    });
    expect(options.sessionId).toBe(NONCE);
    expect(refs[0]).toBe(`host:pending#${NONCE}`);
    expect(refs[1]).toMatch(new RegExp(`^host:${childPid}\\|.+#${NONCE}$`));
    expect(res.final).toMatchObject({ ok: true, summary: "done" });
    // The whole group (including the backgrounded sleep) is gone.
    expect(() => process.kill(-(childPid as number), 0)).toThrow();
  }, 30_000);

  it("does not start the SDK if the pre-spawn reference cannot be recorded", async () => {
    await expect(
      runSdkEngine({
        ...base(),
        onExecutor: () => Promise.reject(new Error("db down")),
      }),
    ).rejects.toThrow(/db down/);
    expect(sdk.query).not.toHaveBeenCalled();
  });
7ba34bd

hook: PostToolUse
hook: PostToolUse Completed
codex
Reviewed `git show HEAD` at `7ba34bd`. **All three r13 P2s are fixed:**

- MCP HTTP discovery awaits `notifications/initialized` before `tools/list`, preserving the session ID. Regression test covers ordering and an empty HTTP 202 response.
- AskBar exposes an enabled Stop button during active runs. Regression test verifies clicking it calls `cancelRun(run.id)`.
- CLI `logs` without `--follow` drains pages using `hasMore` and the last event sequence. Regression test verifies cursor advancement and complete output.

**No new P0–P3 defects found in this commit.**

Validation: all 98 tests in the affected suites passed; 51 worker API tests passed. Typecheck and changed-file lint/format checks passed. Broader worker testing passed 338 tests; four unchanged process-lifecycle tests failed because the sandbox blocks `ps` (`operation not permitted`).

No files changed. E2E and deployment builds were not run.
hook: Stop
hook: Stop Completed
tokens used
38,968
Reviewed `git show HEAD` at `7ba34bd`. **All three r13 P2s are fixed:**

- MCP HTTP discovery awaits `notifications/initialized` before `tools/list`, preserving the session ID. Regression test covers ordering and an empty HTTP 202 response.
- AskBar exposes an enabled Stop button during active runs. Regression test verifies clicking it calls `cancelRun(run.id)`.
- CLI `logs` without `--follow` drains pages using `hasMore` and the last event sequence. Regression test verifies cursor advancement and complete output.

**No new P0–P3 defects found in this commit.**

Validation: all 98 tests in the affected suites passed; 51 worker API tests passed. Typecheck and changed-file lint/format checks passed. Broader worker testing passed 338 tests; four unchanged process-lifecycle tests failed because the sandbox blocks `ps` (`operation not permitted`).

No files changed. E2E and deployment builds were not run.
