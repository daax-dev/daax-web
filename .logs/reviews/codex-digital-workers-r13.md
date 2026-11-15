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
session id: 01a10447-9d35-7793-b097-25557fc811e8
--------
user
Final pre-PR validation of the digital workers feature. Inspect with: git diff origin/main...HEAD -- lib/workers app/api/workers app/workers components/workers migrations/1781568000400_digital-workers.js scripts/workers-cli.ts. Round 12 (.logs/reviews/codex-digital-workers-r12.md) reported all prior findings FIXED; since then only origin/main was merged and two turbopackIgnore annotations added in lib/workers/cli-runner.ts. Read-only: do not edit files. Report only P0-P3 defects in that diff, and state explicitly if there are no new findings.
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
The validation will check the scoped diff, the round 12 review, and repository review instructions. No files will be changed.
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Completed
hook: PreToolUse Completed
exec
/bin/zsh -lc 'cat .logs/reviews/codex-digital-workers-r12.md' in /Users/jasonpoley/prj/dx/src/daax-web
 succeeded in 0ms:
Round-11 P1 is **FIXED**. No new P0–P3 findings.

| Round-11 item | Status | Evidence |
|---|---|---|
| `usage.engineVersion` disclosure | **FIXED** | Entire final usage object passes through recursive redaction at [runner.ts:329](/Users/jasonpoley/prj/dx/src/daax-web/lib/workers/runner.ts:329). Regression coverage includes version and usage at [runner-redaction.test.ts:91](/Users/jasonpoley/prj/dx/src/daax-web/tests/lib/workers/runner-redaction.test.ts:91). |
| Nonce disclosure through stored engine output | **FIXED** | Event fields, nested keys/values, summary, error and usage are redacted before persistence at [runner.ts:148](/Users/jasonpoley/prj/dx/src/daax-web/lib/workers/runner.ts:148) and [runner.ts:324](/Users/jasonpoley/prj/dx/src/daax-web/lib/workers/runner.ts:324). |
| Prompt text mistaken for execution ownership | **FIXED for the reported disclosure route** | The exposed nonce can no longer be copied from these payloads. Matching still accepts markers anywhere in engine command lines and relies on nonce secrecy: [cli-runner.ts:368](/Users/jasonpoley/prj/dx/src/daax-web/lib/workers/cli-runner.ts:368). |

Earlier dispositions remain:

| Item | Status | Evidence |
|---|---|---|
| Tool-field masking | **FIXED** | [runner.ts:154](/Users/jasonpoley/prj/dx/src/daax-web/lib/workers/runner.ts:154) |
| ANSI/OSC literal bypass | **FIXED** | [runner.ts:119](/Users/jasonpoley/prj/dx/src/daax-web/lib/workers/runner.ts:119) |
| Object-key masking | **FIXED** | [runner.ts:137](/Users/jasonpoley/prj/dx/src/daax-web/lib/workers/runner.ts:137) |
| Executor reference excluded from API runs | **FIXED** | [store.ts:87](/Users/jasonpoley/prj/dx/src/daax-web/lib/workers/store.ts:87) |
| Arbitrary executable wrappers | **FIXED** | [cli-runner.ts:372](/Users/jasonpoley/prj/dx/src/daax-web/lib/workers/cli-runner.ts:372) |
| Unresolved `host:pending` | **FIXED** | Ambiguity throws at [cli-runner.ts:452](/Users/jasonpoley/prj/dx/src/daax-web/lib/workers/cli-runner.ts:452); exclusion remains at [scheduler.ts:202](/Users/jasonpoley/prj/dx/src/daax-web/lib/workers/scheduler.ts:202). |
| SDK lifecycle | **FIXED** | Persistence before spawn, detached execution and verified cleanup remain at [sdk-runner.ts:114](/Users/jasonpoley/prj/dx/src/daax-web/lib/workers/sdk-runner.ts:114), lines 182 and 219. |
| Signalling after verified cleanup | **FIXED** | Settlement guard remains at [cli-runner.ts:504](/Users/jasonpoley/prj/dx/src/daax-web/lib/workers/cli-runner.ts:504). |
| MCP trust boundary | **ACCEPTED-RESIDUAL** | Credential boundary remains documented at [digital-workers.md:292](/Users/jasonpoley/prj/dx/src/daax-web/docs/plans/digital-workers.md:292). |

Nine in-memory cases passed across all three engine dispatches, using real mappers/redaction with mocked engines and storage. Event and completion payloads contained no nonce; numeric usage remained intact. Wrapper rejection, pending-reference ambiguity and the settlement guard also passed.

Typecheck and patch-scoped formatting passed. ESLint reported zero errors and one unchanged-line warning. Five targeted Vitest suites executed no tests because the read-only sandbox denied temporary-directory creation. Builds and live recovery remain unvalidated under those constraints. No files were modified.

APPROVE
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
hook: PostToolUse
exec
/bin/zsh -lc 'git status --short && git diff --stat origin/main...HEAD -- lib/workers app/api/workers app/workers components/workers migrations/1781568000400_digital-workers.js scripts/workers-cli.ts' in /Users/jasonpoley/prj/dx/src/daax-web
 succeeded in 0ms:
 M AGENTS.md
?? .logs/reviews/codex-digital-workers-r13.md
?? .worktrees/
?? "backlog/tasks/task-002 - daax-web-native-OIDC-login-against-the-hosts-Pocket-ID-remove-oauth2-proxy-from-daax.md"
 app/api/workers/[id]/goals/[goalId]/route.ts |  55 ++
 app/api/workers/[id]/goals/route.ts          |  58 ++
 app/api/workers/[id]/route.ts                |  94 +++
 app/api/workers/[id]/runs/route.ts           |  71 +++
 app/api/workers/route.ts                     |  78 +++
 app/api/workers/runs/[runId]/route.ts        |  86 +++
 app/workers/[slug]/page.tsx                  |  16 +
 app/workers/page.tsx                         |  29 +
 components/workers/AskBar.tsx                | 205 +++++++
 components/workers/GoalsTab.tsx              | 163 +++++
 components/workers/Markdown.tsx              | 175 ++++++
 components/workers/RunTimeline.tsx           | 139 +++++
 components/workers/ScheduleTab.tsx           | 181 ++++++
 components/workers/ToolsTab.tsx              | 233 ++++++++
 components/workers/WorkerDetail.tsx          | 231 +++++++
 components/workers/WorkersList.tsx           | 166 +++++
 components/workers/api.ts                    | 109 ++++
 components/workers/format.tsx                |  69 +++
 components/workers/voice.ts                  |  55 ++
 lib/workers/cli-runner.ts                    | 865 +++++++++++++++++++++++++++
 lib/workers/events.ts                        | 302 ++++++++++
 lib/workers/http.ts                          |  92 +++
 lib/workers/mcp.ts                           | 372 ++++++++++++
 lib/workers/plan.ts                          | 301 ++++++++++
 lib/workers/runner.ts                        | 349 +++++++++++
 lib/workers/scheduler.ts                     | 374 ++++++++++++
 lib/workers/sdk-runner.ts                    | 235 ++++++++
 lib/workers/service.ts                       |  70 +++
 lib/workers/signals.ts                       | 105 ++++
 lib/workers/store.ts                         | 626 +++++++++++++++++++
 lib/workers/templates.ts                     |  55 ++
 lib/workers/validation.ts                    | 380 ++++++++++++
 lib/workers/workspace.ts                     |  16 +
 migrations/1781568000400_digital-workers.js  | 175 ++++++
 scripts/workers-cli.ts                       | 509 ++++++++++++++++
 35 files changed, 7039 insertions(+)

hook: PostToolUse
hook: PostToolUse Completed
hook: PostToolUse Completed
hook: PostToolUse Completed
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Completed
exec
/bin/zsh -lc 'git log -8 --oneline && git diff origin/main...HEAD -- lib/workers/cli-runner.ts lib/workers/runner.ts lib/workers/sdk-runner.ts' in /Users/jasonpoley/prj/dx/src/daax-web
 succeeded in 0ms:
b07b075 fix(workers): keep Turbopack from tracing the Codex last-message temp path
8fba44f Merge origin/main into feat/digital-workers
ccab6ec feat(workers): digital workers module with Technical Project Manager template
90c0a01 Merge pull request #521 from daax-dev/fix/no-auth-poley-dev-defaults
3623908 Merge pull request #520 from daax-dev/fix/host-resume-absolute-binary
5221379 Merge pull request #519 from daax-dev/fix/daax-host-node-pty
9c748f1 test: drop the guard test that asserted its own filter
301f335 fix(deploy): preflight refuses the shared auth.poley.dev as a host's IdP
diff --git a/lib/workers/cli-runner.ts b/lib/workers/cli-runner.ts
new file mode 100644
index 0000000..974184a
--- /dev/null
+++ b/lib/workers/cli-runner.ts
@@ -0,0 +1,865 @@
+/**
+ * Runs the CLI engines (`claude -p`, `codex exec`) as child processes, on the
+ * host (host dev) or in the daax agent image (container mode), and streams
+ * their JSON-lines output through the engine-neutral mappers.
+ *
+ * - Child env is minimal and explicit: app secrets (DATABASE_URL,
+ *   DAAX_WS_TOKEN_SECRET, ...) are never passed to an agent. MCP server
+ *   credentials go only into that server's config (mode 0600, deleted after
+ *   the run), never into the agent's own environment.
+ * - Host runs get their own process group so cancel/timeout stops the agent
+ *   and everything it started; container runs are labelled with the run id so
+ *   a new scheduler leader can remove orphans.
+ */
+
+import { spawn, spawnSync } from "node:child_process";
+import { randomBytes } from "node:crypto";
+import {
+  chmodSync,
+  copyFileSync,
+  existsSync,
+  mkdirSync,
+  mkdtempSync,
+  readFileSync,
+  rmSync,
+  statSync,
+  symlinkSync,
+  writeFileSync,
+} from "node:fs";
+import { homedir, tmpdir } from "node:os";
+import { join } from "node:path";
+import {
+  CONTAINER_WORKSPACE_PATH,
+  DEFAULT_CONTAINER_IMAGE,
+  DOCKER_NETWORK,
+  HOST_WORKSPACE_PATH,
+} from "@/server/config/constants";
+import { getClaudeAuthHostPath } from "@/server/docker/auth-paths";
+import {
+  CodexAccumulator,
+  LineTail,
+  mapClaudeMessage,
+  mapCodexMessage,
+  type ParsedLine,
+} from "./events";
+import type { ResolvedMcpServer } from "./mcp";
+import {
+  claudeCommand,
+  claudeMcpConfig,
+  codexCommand,
+  codexConfigToml,
+  type RunPrompts,
+  type ToolPolicy,
+} from "./plan";
+import type { RunEvent, WorkerEngine, WorkerExecutor } from "@/types/workers";
+
+export type Final = NonNullable<ParsedLine["final"]>;
+
+export interface CliRunInput {
+  runId: string;
+  engine: Exclude<WorkerEngine, "agent-sdk">;
+  executor: WorkerExecutor;
+  model: string | null;
+  workingDir: string;
+  prompts: RunPrompts;
+  policy: ToolPolicy;
+  servers: ResolvedMcpServer[];
+  timeoutMs: number;
+  signal: AbortSignal;
+  onEvent: (e: RunEvent) => Promise<void>;
+  /** Records where the run executes ("container:<name>" / host ref). */
+  onExecutor?: (ref: string) => Promise<void>;
+  /** Fresh random UUID for this execution: the recovery marker. */
+  nonce: string;
+}
+
+export interface CliRunResult {
+  final: Final;
+  timedOut: boolean;
+  cancelled: boolean;
+}
+
+/**
+ * The engine exited but its execution could not be verified as stopped
+ * (e.g. Docker could not remove the container). The run must stay active so
+ * the leader's reconciliation keeps retrying the cleanup.
+ */
+/** An executor reference without its secret nonce, safe to show or store. */
+export function publicRef(ref: string): string {
+  return ref.split("#")[0];
+}
+
+export class ExecutionCleanupError extends Error {
+  constructor(
+    public readonly ref: string,
+    cause: string,
+  ) {
+    super(
+      `execution ${publicRef(ref)} could not be verified as stopped: ${cause}`,
+    );
+    this.name = "ExecutionCleanupError";
+  }
+}
+
+/** Container label carrying the run id (orphan cleanup). */
+export const RUN_LABEL = "daax.worker.run";
+
+/** Env vars a CLI needs to find itself and its login. Nothing else is inherited. */
+const BASE_ENV_KEYS = [
+  "PATH",
+  "HOME",
+  "USER",
+  "LOGNAME",
+  "LANG",
+  "LC_ALL",
+  "SHELL",
+  "TMPDIR",
+  "TERM",
+];
+
+export function baseChildEnv(
+  env: NodeJS.ProcessEnv = process.env,
+): Record<string, string> {
+  const out: Record<string, string> = {};
+  for (const k of BASE_ENV_KEYS) {
+    const v = env[k];
+    if (typeof v === "string") out[k] = v;
+  }
+  return out;
+}
+
+/**
+ * Host-mode CLI path. WORKERS_CLAUDE_BIN / WORKERS_CODEX_BIN (absolute paths)
+ * override PATH lookup, for hosts where PATH resolves to a wrapper that needs
+ * environment the runner deliberately does not pass.
+ */
+export function hostBinary(
+  command: string,
+  env: NodeJS.ProcessEnv = process.env,
+): string {
+  const override =
+    command === "claude"
+      ? env.WORKERS_CLAUDE_BIN
+      : command === "codex"
+        ? env.WORKERS_CODEX_BIN
+        : undefined;
+  return override && override.startsWith("/") ? override : command;
+}
+
+/** Container mode = daax itself runs in a container with the workspace mounted. */
+export function resolveExecutor(
+  executor: WorkerExecutor,
+): "host" | "container" {
+  if (executor !== "auto") return executor;
+  return HOST_WORKSPACE_PATH ? "container" : "host";
+}
+
+/** Workspace path as seen by the web process → path on the Docker host. */
+function toHostPath(localPath: string): string {
+  if (localPath === CONTAINER_WORKSPACE_PATH) return HOST_WORKSPACE_PATH;
+  if (localPath.startsWith(`${CONTAINER_WORKSPACE_PATH}/`)) {
+    return (
+      HOST_WORKSPACE_PATH + localPath.slice(CONTAINER_WORKSPACE_PATH.length)
+    );
+  }
+  throw new Error(`path ${localPath} is outside the mounted workspace`);
+}
+
+const IN_CONTAINER_RUN_DIR = "/run/daax-worker";
+
+interface RunDir {
+  local: string;
+  /** How the engine process sees the directory. */
+  engineView: string;
+  /** Host path to bind-mount (container executor only). */
+  host?: string;
+}
+
+function makeRunDir(runId: string, mode: "host" | "container"): RunDir {
+  if (mode === "host") {
+    const local = mkdtempSync(
+      join(tmpdir(), `daax-worker-${runId.slice(0, 8)}-`),
+    );
+    chmodSync(local, 0o700);
+    return { local, engineView: local };
+  }
+  // Must be on the mounted workspace so the Docker host can bind-mount it.
+  const local = join(CONTAINER_WORKSPACE_PATH, ".daax", "workers", runId);
+  mkdirSync(local, { recursive: true, mode: 0o700 });
+  return { local, engineView: IN_CONTAINER_RUN_DIR, host: toHostPath(local) };
+}
+
+function writeSecret(path: string, content: string): void {
+  writeFileSync(path, content, { mode: 0o600 });
+}
+
+/** Where codex's login lives for each executor. */
+function codexAuthSource(mode: "host" | "container"): string {
+  return mode === "host"
+    ? join(process.env.CODEX_HOME || join(homedir(), ".codex"), "auth.json")
+    : join(CONTAINER_WORKSPACE_PATH, ".daax", "codex", "auth.json");
+}
+
+interface Prepared {
+  command: string;
+  args: string[];
+  /** Engine env on top of the base env (never MCP credentials). */
+  env: Record<string, string>;
+  lastMessagePath?: string;
+  afterRun: () => void;
+}
+
+function prepare(
+  input: CliRunInput,
+  mode: "host" | "container",
+  dir: RunDir,
+): Prepared {
+  if (input.engine === "claude-cli") {
+    writeSecret(
+      join(dir.local, "mcp.json"),
+      JSON.stringify(claudeMcpConfig(input.servers)),
+    );
+    const cmd = claudeCommand({
+      nonce: input.nonce,
+      prompts: input.prompts,
+      mcpConfigPath: join(dir.engineView, "mcp.json"),
+      policy: input.policy,
+      model: input.model,
+    });
+    return { ...cmd, env: {}, afterRun: () => undefined };
+  }
+
+  // codex: an isolated CODEX_HOME holding only this worker's MCP servers.
+  const codexHome = join(dir.local, "codex-home");
+  mkdirSync(codexHome, { mode: 0o700 });
+  writeSecret(
+    join(codexHome, "config.toml"),
+    codexConfigToml(input.servers, input.policy.mcpEnabled, input.model),
+  );
+  const authSrc = codexAuthSource(mode);
+  if (!existsSync(authSrc)) {
+    throw new Error(
+      mode === "host"
+        ? `codex is not logged in (${authSrc} missing): run \`codex login\``
+        : `codex login for workers not found at <workspace>/.daax/codex/auth.json`,
+    );
+  }
+  const authDst = join(codexHome, "auth.json");
+  let afterRun = () => undefined as void;
+  if (mode === "host") {
+    // Symlink so a token refresh by codex writes through to the real login.
+    symlinkSync(authSrc, authDst);
+  } else {
+    copyFileSync(authSrc, authDst);
+    const before = statSync(authDst).mtimeMs;
+    afterRun = () => {
+      if (existsSync(authDst) && statSync(authDst).mtimeMs !== before) {
+        copyFileSync(authDst, authSrc);
+      }
+    };
+  }
+  const cmd = codexCommand({
+    prompts: input.prompts,
+    workingDir: input.workingDir,
+    lastMessagePath: join(dir.engineView, "last-message.txt"),
+  });
+  return {
+    ...cmd,
+    env: { CODEX_HOME: join(dir.engineView, "codex-home") },
+    lastMessagePath: join(dir.local, "last-message.txt"),
+    afterRun,
+  };
+}
+
+function dockerArgs(
+  runId: string,
+  containerName: string,
+  dir: RunDir,
+  workingDir: string,
+  prepared: Prepared,
+): string[] {
+  const args = [
+    "run",
+    "--rm",
+    "-i",
+    "--name",
+    containerName,
+    "--label",
+    `${RUN_LABEL}=${runId}`,
+    "--network",
+    DOCKER_NETWORK,
+    "-u",
+    "vscode",
+    "-v",
+    `${HOST_WORKSPACE_PATH}:${CONTAINER_WORKSPACE_PATH}`,
+    "-v",
+    `${getClaudeAuthHostPath()}:/home/vscode/.claude`,
+    "-v",
+    `${dir.host}:${IN_CONTAINER_RUN_DIR}`,
+    "-e",
+    "CLAUDE_CONFIG_DIR=/home/vscode/.claude",
+    "-e",
+    "HOME=/home/vscode",
+    "-w",
+    workingDir,
+  ];
+  // Values stay in the docker client's env; only names appear in argv.
+  for (const name of Object.keys(prepared.env)) args.push("-e", name);
+  args.push(DEFAULT_CONTAINER_IMAGE, prepared.command, ...prepared.args);
+  return args;
+}
+
+/** A process's start time as `ps` reports it, or null when unavailable. */
+export function processStartTime(pid: number): string | null {
+  const ps = spawnSync("ps", ["-o", "lstart=", "-p", String(pid)], {
+    encoding: "utf8",
+  });
+  const out = (ps.stdout ?? "").trim();
+  return ps.status === 0 && out ? out : null;
+}
+
+/**
+ * Host executor refs: `host:pending#<nonce>` (recorded before spawn) and
+ * `host:<pgid>|<start time>#<nonce>` (after spawn). The nonce is a fresh
+ * random UUID per execution, stored only here, and is the recovery marker.
+ */
+export function parseHostRef(
+  ref: string,
+): { pgid: number | null; start: string | null; nonce: string | null } | null {
+  if (!ref.startsWith("host:")) return null;
+  const [body, nonce = null] = ref.slice("host:".length).split("#");
+  if (body === "pending") return { pgid: null, start: null, nonce };
+  const [pid, ...rest] = body.split("|");
+  const pgid = Number(pid);
+  if (!Number.isInteger(pgid) || pgid <= 1) return null;
+  return { pgid, start: rest.length ? rest.join("|") : null, nonce };
+}
+
+export function hostRef(
+  pid: number | null,
+  start: string | null,
+  nonce: string,
+): string {
+  const body = pid ? `${pid}${start ? `|${start}` : ""}` : "pending";
+  return `host:${body}#${nonce}`;
+}
+
+/** Marker placed in every engine command line (in its prompt). */
+export function runMarker(nonce: string): string {
+  return `daax-run:${nonce}`;
+}
+
+// Engine executables: native/shim `claude` / `codex`, or the npm packages'
+// entry points as run by node (`.../@anthropic-ai/claude-code/cli.js`,
+// `.../@openai/codex/bin/codex.js`).
+const ENGINE_EXE =
+  /(^|\/)(claude|codex)(\.js)?$|\/@anthropic-ai\/claude-code\/cli\.m?js$|\/@openai\/codex\/bin\/codex\.js$/;
+// Programs that run an engine script given as their first argument.
+const INTERPRETER = /(^|\/)(node|nodejs|bun|sh|bash|zsh)$/;
+
+/**
+ * Is this command line an engine process carrying this execution's nonce?
+ *  - The executable is a claude/codex CLI: the first token, or the second
+ *    only behind a real interpreter (`node .../codex.js`, `sh .../claude`).
+ *  - The nonce appears as `(daax-run:<nonce>)` or as the `--session-id`
+ *    token. The nonce is a random UUID that exists only in the executor
+ *    reference, so no operator command or prompt can contain it by chance.
+ */
+export function isEngineCommandFor(command: string, nonce: string): boolean {
+  const tokens = command.trim().split(/\s+/);
+  const exeOk =
+    ENGINE_EXE.test(tokens[0] ?? "") ||
+    (INTERPRETER.test(tokens[0] ?? "") && ENGINE_EXE.test(tokens[1] ?? ""));
+  if (!exeOk) return false;
+  if (command.includes(`(${runMarker(nonce)})`)) return true;
+  return tokens.some(
+    (t, i) =>
+      t === `--session-id=${nonce}` ||
+      (t === "--session-id" && tokens[i + 1] === nonce),
+  );
+}
+
+/** Thrown when an execution may still be alive but cannot be proven ours. */
+export class AmbiguousExecutionError extends Error {}
+
+/**
+ * Engine processes carrying this execution's nonce. Throws if the process
+ * table cannot be read, so recovery stays unverified.
+ */
+export function findMarkedProcesses(
+  nonce: string,
+  ps: () => { status: number | null; stdout: string } = () =>
+    spawnSync("ps", ["-A", "-ww", "-o", "pid=,pgid=,command="], {
+      encoding: "utf8",
+    }) as { status: number | null; stdout: string },
+): { pid: number; pgid: number }[] {
+  const res = ps();
+  if (res.status !== 0) throw new Error("cannot read the process table");
+  const out: { pid: number; pgid: number }[] = [];
+  for (const line of (res.stdout ?? "").split("\n")) {
+    const m = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line);
+    if (m && isEngineCommandFor(m[3], nonce)) {
+      out.push({ pid: Number(m[1]), pgid: Number(m[2]) });
+    }
+  }
+  return out;
+}
+
+/**
+ * Recovery for a host run left by a dead leader. The agent is found by its
+ * command-line marker (not by a pid that may have been reused), its process
+ * groups are stopped and verified gone. If no marked process exists but the
+ * recorded group id is still alive, ownership cannot be proven either way:
+ * nothing is signalled and the run stays locked (AmbiguousExecutionError)
+ * until an operator force-releases it.
+ */
+export async function stopHostRunAndWait(
+  runId: string,
+  ref: string,
+  deps: {
+    find?: (nonce: string) => { pid: number; pgid: number }[];
+    alive?: (pgid: number) => boolean;
+    kill?: (pgid: number, sig: NodeJS.Signals) => void;
+    sleep?: (ms: number) => Promise<void>;
+  } = {},
+): Promise<void> {
+  const find = deps.find ?? ((n) => findMarkedProcesses(n));
+  const alive = deps.alive ?? groupAlive;
+  const kill =
+    deps.kill ??
+    ((pgid, sig) => {
+      try {
+        process.kill(-pgid, sig);
+      } catch {
+        // already gone
+      }
+    });
+  const sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
+
+  const parsed = parseHostRef(ref);
+  if (!parsed?.nonce) {
+    // Without its nonce the execution cannot be identified: never signal.
+    throw new AmbiguousExecutionError(
+      `run ${runId} has no execution marker recorded; force-release once confirmed stopped`,
+    );
+  }
+  const nonce = parsed.nonce;
+  const marked = find(nonce);
+  if (marked.length === 0) {
+    if (!parsed.pgid) {
+      // Recorded before spawn: the agent may have started and exited,
+      // leaving unmarked descendants in a group whose id was never recorded.
+      throw new AmbiguousExecutionError(
+        `run ${runId} was starting when daax stopped and its process group is unknown; force-release once confirmed stopped`,
+      );
+    }
+    if (alive(parsed.pgid)) {
+      throw new AmbiguousExecutionError(
+        `process group ${parsed.pgid} is alive but carries no marker for run ${runId}; not signalled — force-release the run once it is confirmed stopped`,
+      );
+    }
+    return;
+  }
+  const groups = [...new Set(marked.map((p) => p.pgid))].filter((g) => g > 1);
+  for (const g of groups) kill(g, "SIGTERM");
+  for (let waited = 0; waited < 15_000; waited += 250) {
+    if (find(nonce).length === 0 && groups.every((g) => !alive(g))) return;
+    if (waited === 10_000) for (const g of groups) kill(g, "SIGKILL");
+    await sleep(250);
+  }
+  throw new Error(`run ${runId} processes did not exit`);
+}
+
+/**
+ * Send one signal to a run's execution: remove its container, or signal its
+ * host process group. Escalation and verification are the caller's job, so
+ * no timer can outlive a verified cleanup and hit a reused group.
+ */
+export function signalExecution(ref: string, sig: NodeJS.Signals): void {
+  if (ref.startsWith("container:")) {
+    spawnSync("docker", ["rm", "-f", ref.slice("container:".length)], {
+      stdio: "ignore",
+    });
+    return;
+  }
+  const pgid = parseHostRef(ref)?.pgid;
+  if (!pgid) return;
+  try {
+    process.kill(-pgid, sig);
+  } catch {
+    // already gone
+  }
+}
+
+/**
+ * In-run stop control: SIGTERM now, SIGKILL after 10 s unless the run's
+ * cleanup has been verified first. After `settle()` nothing is signalled
+ * again, so a late callback or timer can never reach a reused group.
+ */
+export function stopController(getRef: () => string | null, kill: () => void) {
+  let settled = false;
+  let escalation: NodeJS.Timeout | undefined;
+  return {
+    stop() {
+      if (settled) return;
+      const ref = getRef();
+      if (ref) signalExecution(ref, "SIGTERM");
+      kill();
+      escalation ??= setTimeout(() => {
+        const r = getRef();
+        if (!settled && r) signalExecution(r, "SIGKILL");
+      }, 10_000);
+      escalation.unref();
+    },
+    settle() {
+      settled = true;
+      if (escalation) clearTimeout(escalation);
+    },
+    get settled() {
+      return settled;
+    },
+  };
+}
+
+/**
+ * Remove every container carrying the worker-run label (leader recovery).
+ * Throws if Docker cannot list or remove them, so recovery fails and the
+ * interrupted runs stay locked until a later attempt succeeds.
+ */
+export function removeLabelledContainers(): number {
+  const ls = spawnSync(
+    "docker",
+    ["ps", "-aq", "--filter", `label=${RUN_LABEL}`],
+    { encoding: "utf8" },
+  );
+  if (ls.status !== 0) {
+    throw new Error(
+      `cannot list worker containers: ${(ls.stderr || ls.error?.message || "docker ps failed").trim()}`,
+    );
+  }
+  const ids = (ls.stdout ?? "").split("\n").filter(Boolean);
+  if (ids.length) {
+    const rm = spawnSync("docker", ["rm", "-f", ...ids], { encoding: "utf8" });
+    if (rm.status !== 0) {
+      throw new Error(
+        `cannot remove worker containers: ${(rm.stderr || "docker rm failed").trim()}`,
+      );
+    }
+  }
+  return ids.length;
+}
+
+function groupAlive(pgid: number): boolean {
+  try {
+    process.kill(-pgid, 0);
+    return true;
+  } catch (err) {
+    return (err as NodeJS.ErrnoException).code === "EPERM";
+  }
+}
+
+/**
+ * Stop an orphaned execution and wait until it is really gone (recovery).
+ * Host groups get SIGTERM, then SIGKILL after 10 s; throws if the group is
+ * still alive after 15 s so the run is not released while it executes.
+ */
+export async function stopExecutionAndWait(
+  ref: string,
+  sleep: (ms: number) => Promise<void> = (ms) =>
+    new Promise((r) => setTimeout(r, ms)),
+): Promise<void> {
+  if (ref.startsWith("container:")) {
+    const name = ref.slice("container:".length);
+    const rm = spawnSync("docker", ["rm", "-f", name], { encoding: "utf8" });
+    if (rm.status !== 0 && !/No such container/i.test(rm.stderr ?? "")) {
+      throw new Error(
+        `cannot remove container ${name}: ${(rm.stderr ?? "").trim()}`,
+      );
+    }
+    return;
+  }
+  const pgid = parseHostRef(ref)?.pgid;
+  if (!pgid) return;
+  const signal = (sig: NodeJS.Signals) => {
+    try {
+      process.kill(-pgid, sig);
+    } catch {
+      // already gone
+    }
+  };
+  signal("SIGTERM");
+  for (let waited = 0; waited < 15_000; waited += 250) {
+    if (!groupAlive(pgid)) return;
+    if (waited === 10_000) signal("SIGKILL");
+    await sleep(250);
+  }
+  if (groupAlive(pgid)) throw new Error(`process group ${pgid} did not exit`);
+}
+
+/** Split a byte stream into complete lines. */
+function lineSplitter(onLine: (line: string) => void) {
+  let buffer = "";
+  return {
+    push(chunk: Buffer) {
+      buffer += chunk.toString();
+      const lines = buffer.split("\n");
+      buffer = lines.pop() ?? "";
+      for (const l of lines) if (l.trim()) onLine(l);
+    },
+    flush() {
+      if (buffer.trim()) onLine(buffer);
+      buffer = "";
+    },
+  };
+}
+
+const cancelledResult = (): CliRunResult => ({
+  final: { ok: false, summary: null, error: "cancelled", usage: {} },
+  timedOut: false,
+  cancelled: true,
+});
+
+export async function runCliEngine(input: CliRunInput): Promise<CliRunResult> {
+  const mode = resolveExecutor(input.executor);
+  if (mode === "container" && !HOST_WORKSPACE_PATH) {
+    throw new Error(
+      "the container executor needs daax running in container mode (HOST_WORKSPACE_PATH is not set); use executor auto or host",
+    );
+  }
+  if (input.signal.aborted) return cancelledResult();
+
+  const dir = makeRunDir(input.runId, mode);
+  const containerName = `daax-w-${randomBytes(4).toString("hex")}`;
+  let prepared: Prepared | null = null;
+
+  try {
+    prepared = prepare(input, mode, dir);
+    const env = { ...baseChildEnv(), ...prepared.env };
+    const command = mode === "host" ? hostBinary(prepared.command) : "docker";
+    const args =
+      mode === "host"
+        ? prepared.args
+        : dockerArgs(
+            input.runId,
+            containerName,
+            dir,
+            input.workingDir,
+            prepared,
+          );
+
+    await input.onEvent({
+      type: "system",
+      text: `starting ${input.engine} (${mode})`,
+      data: {
+        executor: mode,
+        workingDir: input.workingDir,
+        container: mode === "container" ? containerName : undefined,
+      },
+    });
+    if (input.signal.aborted) return cancelledResult();
+
+    // Where the run will execute is recorded BEFORE spawning, so a crash at
+    // any point afterwards leaves a reference recovery can act on. If it
+    // cannot be recorded, nothing is started.
+    if (input.onExecutor) {
+      // Bounded by the run's cancel/deadline signal: a write that never
+      // completes cannot hold the run past its deadline.
+      const aborted = new Promise<"aborted">((resolve) => {
+        if (input.signal.aborted) resolve("aborted");
+        input.signal.addEventListener("abort", () => resolve("aborted"), {
+          once: true,
+        });
+      });
+      const recorded = await Promise.race([
+        input
+          .onExecutor(
+            mode === "container"
+              ? `container:${containerName}`
+              : hostRef(null, null, input.nonce),
+          )
+          .then(() => "recorded" as const),
+        aborted,
+      ]);
+      if (recorded === "aborted") return cancelledResult();
+    }
+    if (input.signal.aborted) return cancelledResult();
+
+    const child = spawn(command, args, {
+      cwd: mode === "host" ? input.workingDir : undefined,
+      env: env as NodeJS.ProcessEnv,
+      stdio: ["ignore", "pipe", "pipe"],
+      // Own process group on the host, so stop() reaches every descendant.
+      detached: mode === "host",
+    });
+
+    // Everything below up to the first await is synchronous, so no exit,
+    // output, cancel or timeout can be missed while something else awaits.
+    const stderrTail = new LineTail(16_000);
+    // Resolve on process exit plus a short grace for buffered output, so a
+    // descendant holding the pipes open cannot keep the run alive.
+    const exited = new Promise<number | null>((resolve) => {
+      let done = false;
+      const finish = (code: number | null) => {
+        if (done) return;
+        done = true;
+        resolve(code);
+      };
+      child.on("error", (err) => {
+        stderrTail.push(`\n${err.message}\n`);
+        finish(-1);
+      });
+      child.on("close", (code) => finish(code));
+      child.on("exit", (code) => {
+        setTimeout(() => finish(code), 2_000).unref();
+      });
+    });
+
+    // Host refs carry the process start time so recovery can tell this
+    // process group from a later one that reuses the pid.
+    const startTime =
+      mode === "host" && child.pid ? processStartTime(child.pid) : null;
+    const ref =
+      mode === "container"
+        ? `container:${containerName}`
+        : hostRef(child.pid ?? null, startTime, input.nonce);
+
+    const codexAcc = new CodexAccumulator();
+    let claudeFinal: Final | undefined;
+    // Events are persisted in order; a chain keeps writes sequential.
+    let chain = Promise.resolve();
+    const emit = (e: RunEvent) => {
+      chain = chain.then(() => input.onEvent(e)).catch(() => undefined);
+    };
+
+    let lineCount = 0;
+    const splitter = lineSplitter((line) => {
+      lineCount++;
+      let json: unknown;
+      try {
+        json = JSON.parse(line);
+      } catch {
+        return;
+      }
+      const parsed =
+        input.engine === "claude-cli"
+          ? mapClaudeMessage(json)
+          : mapCodexMessage(json);
+      if (input.engine === "codex-cli") codexAcc.add(parsed);
+      if (parsed.final) claudeFinal = parsed.final;
+      parsed.events.forEach(emit);
+    });
+    child.stdout.on("data", (c: Buffer) => splitter.push(c));
+    child.stderr.on("data", (c: Buffer) => {
+      stderrTail.push(c.toString());
+    });
+
+    let timedOut = false;
+    let cancelled = false;
+    const control = stopController(
+      () => ref,
+      () => child.kill("SIGTERM"),
+    );
+    const stop = () => control.stop();
+    const timer = setTimeout(
+      () => {
+        timedOut = true;
+        stop();
+      },
+      Math.max(1, input.timeoutMs),
+    );
+    const onAbort = () => {
+      cancelled = true;
+      stop();
+    };
+    input.signal.addEventListener("abort", onAbort, { once: true });
+    if (input.signal.aborted) onAbort();
+
+    // Recording where the run executes must never block its lifecycle. If it
+    // cannot be recorded, recovery could not find the execution later, so it
+    // is stopped now.
+    let unrecorded = false;
+    if (mode === "host" && child.pid && input.onExecutor) {
+      input.onExecutor(ref).catch(() => {
+        // Ignored once cleanup is verified: never signal a group that may
+        // since have been reused.
+        if (control.settled) return;
+        unrecorded = true;
+        stop();
+      });
+    }
+
+    const exitCode = await exited;
+    const stderr = stderrTail.toString();
+    clearTimeout(timer);
+    input.signal.removeEventListener("abort", onAbort);
+    // Anything the agent left running goes with it — verified, so a run is
+    // never released while its execution may still be alive.
+    try {
+      await stopExecutionAndWait(ref);
+    } catch (err) {
+      throw new ExecutionCleanupError(ref, (err as Error).message);
+    }
+    control.settle();
+    splitter.flush();
+    await chain;
+    await input.onEvent({
+      type: "system",
+      text: `${input.engine} exited (${exitCode ?? "signal"}), ${lineCount} output line(s)`,
+      data: {
+        exitCode,
+        lines: lineCount,
+        // Redacted (then clipped) by the runner before it is stored.
+        stderr: stderr.trim() || undefined,
+      },
+    });
+
+    let final: Final;
+    if (input.engine === "claude-cli") {
+      final = claudeFinal ?? {
+        ok: false,
+        summary: null,
+        error: `claude exited (${exitCode}) without a result${stderr ? `: ${stderr.trim()}` : ""}`,
+        usage: {},
+      };
+    } else {
+      final = codexAcc.final();
+      const last = prepared.lastMessagePath;
+      // `last` is a runtime temp file, not a bundled asset: keep Turbopack from tracing the project.
+      if (last && existsSync(/*turbopackIgnore: true*/ last)) {
+        const text = readFileSync(
+          /*turbopackIgnore: true*/ last,
+          "utf8",
+        ).trim();
+        if (text) final = { ...final, summary: text };
+      }
+      if (exitCode !== 0 || !final.ok) {
+        const detail = stderr
+          .replace(/^Reading additional input from stdin\.\.\.\s*/m, "")
+          .trim();
+        final = {
+          ...final,
+          ok: false,
+          error: `${final.error ?? `codex exited (${exitCode})`}${exitCode !== 0 ? ` [exit ${exitCode}]` : ""}${detail ? `: ${detail}` : ""}`,
+        };
+      }
+    }
+    if (unrecorded && !timedOut) {
+      final = {
+        ...final,
+        ok: false,
+        error: "stopped: where the run executes could not be recorded",
+      };
+    }
+    return { final, timedOut, cancelled: cancelled && !unrecorded };
+  } finally {
+    try {
+      prepared?.afterRun();
+    } catch (err) {
+      console.error(
+        "[workers] codex auth write-back failed:",
+        (err as Error).message,
+      );
+    }
+    rmSync(dir.local, { recursive: true, force: true });
+  }
+}
diff --git a/lib/workers/runner.ts b/lib/workers/runner.ts
new file mode 100644
index 0000000..3f6517b
--- /dev/null
+++ b/lib/workers/runner.ts
@@ -0,0 +1,349 @@
+/**
+ * Executes one queued run end to end: resolve tools, build the tool policy
+ * and prompts, collect project signals, run the worker's engine, persist the
+ * (redacted) event stream, record the outcome, and auto-pause a worker after
+ * repeated automatic failures.
+ *
+ * One deadline covers the whole run — tool discovery, signal collection and
+ * the engine — starting when the run is claimed.
+ */
+
+import { randomUUID } from "node:crypto";
+import { realpathSync, statSync } from "node:fs";
+import { isAbsolute, relative, resolve, sep } from "node:path";
+import { maskSecrets } from "@/lib/redaction/mask";
+import { clip } from "./events";
+import {
+  ExecutionCleanupError,
+  baseChildEnv,
+  runCliEngine,
+  runMarker,
+  type CliRunResult,
+} from "./cli-runner";
+import {
+  listServerTools,
+  resolveMcpServers,
+  type McpToolInfo,
+  type ResolvedMcpServer,
+} from "./mcp";
+import { buildPrompts, buildToolPolicy } from "./plan";
+import { runSdkEngine } from "./sdk-runner";
+import { collectSignals } from "./signals";
+import {
+  appendRunEvent,
+  finishRun,
+  getRun,
+  getWorker,
+  listGoals,
+  markRunStarted,
+  recentFinishedStatuses,
+  setExecutorRef,
+  updateWorker,
+} from "./store";
+import { resolveWorkspaceRoot } from "./workspace";
+import type { RunEvent, RunStatus, Worker, WorkerRun } from "@/types/workers";
+
+/** Consecutive failed automatic runs before a worker is paused. */
+export const FAILURE_PAUSE_THRESHOLD = 3;
+
+export class WorkingDirError extends Error {}
+
+/**
+ * The worker's working directory: absolute or relative to the workspace root,
+ * resolved through symlinks, and required to be an existing directory inside
+ * the (also resolved) workspace root.
+ */
+export function resolveWorkingDir(
+  worker: Pick<Worker, "workingDir">,
+  root: string,
+): string {
+  let realRoot: string;
+  try {
+    realRoot = realpathSync(root);
+  } catch {
+    throw new WorkingDirError(`workspace root ${root} does not exist`);
+  }
+  if (!worker.workingDir) return realRoot;
+  const target = isAbsolute(worker.workingDir)
+    ? worker.workingDir
+    : resolve(realRoot, worker.workingDir);
+  let real: string;
+  try {
+    real = realpathSync(target);
+  } catch {
+    throw new WorkingDirError(`workingDir ${worker.workingDir} does not exist`);
+  }
+  const rel = relative(realRoot, real);
+  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
+    throw new WorkingDirError("workingDir is outside the workspace");
+  }
+  if (!statSync(real).isDirectory()) {
+    throw new WorkingDirError(
+      `workingDir ${worker.workingDir} is not a directory`,
+    );
+  }
+  return real;
+}
+
+export function outcomeStatus(result: CliRunResult): RunStatus {
+  if (result.cancelled) return "cancelled";
+  if (result.timedOut) return "timeout";
+  return result.final.ok ? "succeeded" : "failed";
+}
+
+/** Secret values that must never be stored in run history. */
+export function knownSecretValues(
+  servers: ResolvedMcpServer[],
+  env: NodeJS.ProcessEnv = process.env,
+): string[] {
+  const values = servers.flatMap((s) => Object.values(s.env));
+  for (const [k, v] of Object.entries(env)) {
+    if (
+      v &&
+      /(TOKEN|SECRET|PASSWORD|API_KEY|DATABASE_URL|PRIVATE|CREDENTIAL)/.test(k)
+    ) {
+      values.push(v);
+    }
+  }
+  // maskSecrets ignores values shorter than 4 characters.
+  return values.filter((v) => v.length >= 4);
+}
+
+/** Redact secrets from any string inside an event (text and data). */
+/**
+ * Redact one stored string: first remove every known secret literal from the
+ * RAW string (so values inside ANSI/OSC escape payloads, which the
+ * presentation masker preserves, are gone too), then apply the pattern
+ * masker for secrets of known shapes.
+ */
+export function redactString(s: string, knownValues: string[]): string {
+  let out = s;
+  for (const v of knownValues) {
+    if (v.length >= 4 && out.includes(v)) out = out.split(v).join("[redacted]");
+  }
+  return maskSecrets(out, { knownValues });
+}
+
+/** Redact every string in a JSON-like value, keys included. */
+export function redactValue<T>(value: T, knownValues: string[]): T {
+  const mask = (s: string) => redactString(s, knownValues);
+  const walk = (v: unknown): unknown => {
+    if (typeof v === "string") return mask(v);
+    if (Array.isArray(v)) return v.map(walk);
+    if (v && typeof v === "object") {
+      return Object.fromEntries(
+        Object.entries(v as Record<string, unknown>).map(([k, x]) => [
+          // Keys are redacted too: tool-call arguments are structured.
+          mask(k),
+          walk(x),
+        ]),
+      );
+    }
+    return v;
+  };
+  return walk(value) as T;
+}
+
+/** Redact every string an event carries: text, tool, data keys and values. */
+export function redactEvent(e: RunEvent, knownValues: string[]): RunEvent {
+  const mask = (s: string) => redactString(s, knownValues);
+  const walk = (v: unknown) => redactValue(v, knownValues);
+  return {
+    ...e,
+    text: e.text === undefined ? undefined : clip(mask(e.text)),
+    tool: e.tool === undefined ? undefined : mask(e.tool),
+    data: e.data === undefined ? undefined : walk(e.data),
+  };
+}
+
+/** Pause an automatic worker whose last N runs all failed. */
+export async function applyFailurePolicy(worker: Worker): Promise<boolean> {
+  if (worker.runMode === "adhoc" || !worker.enabled) return false;
+  const recent = await recentFinishedStatuses(
+    worker.id,
+    FAILURE_PAUSE_THRESHOLD,
+  );
+  const failing =
+    recent.length === FAILURE_PAUSE_THRESHOLD &&
+    recent.every((s) => s === "failed" || s === "timeout");
+  if (!failing) return false;
+  await updateWorker(worker.id, {
+    enabled: false,
+    pausedReason: `paused after ${FAILURE_PAUSE_THRESHOLD} consecutive failed runs`,
+  });
+  return true;
+}
+
+export async function executeRun(
+  runId: string,
+  signal: AbortSignal,
+): Promise<WorkerRun | null> {
+  const run = await getRun(runId);
+  if (!run || run.status !== "queued") return run;
+  const worker = await getWorker(run.workerId);
+  if (!worker) {
+    return finishRun(runId, {
+      status: "failed",
+      error: "worker no longer exists",
+    });
+  }
+
+  if (!(await markRunStarted(runId))) return getRun(runId);
+  const timeoutMs = worker.timeoutSeconds * 1000;
+  const startedAt = Date.now();
+  const deadline = AbortSignal.timeout(timeoutMs);
+  const runSignal = AbortSignal.any([signal, deadline]);
+  const remainingMs = () => Math.max(1, timeoutMs - (Date.now() - startedAt));
+
+  let secrets = knownSecretValues([]);
+  const redact = (s: string | null | undefined) =>
+    s == null ? s : redactString(s, secrets);
+  let seq = 0;
+  let engineVersion: string | undefined;
+  const onEvent = async (e: RunEvent) => {
+    const data = e.data as { version?: string } | undefined;
+    if (e.type === "system" && typeof data?.version === "string")
+      engineVersion = data.version;
+    try {
+      await appendRunEvent(runId, seq++, redactEvent(e, secrets));
+    } catch (err) {
+      console.error(
+        "[workers] failed to store run event:",
+        (err as Error).message,
+      );
+    }
+  };
+  const interrupted = (): RunStatus | null =>
+    signal.aborted ? "cancelled" : deadline.aborted ? "timeout" : null;
+
+  let status: RunStatus = "failed";
+  try {
+    const root = resolveWorkspaceRoot();
+    const workingDir = resolveWorkingDir(worker, root);
+    const goals = await listGoals(worker.id, "active");
+
+    const { resolved, missing } = resolveMcpServers(
+      worker.mcpServers,
+      workingDir,
+    );
+    secrets = knownSecretValues(resolved);
+    const serverTools: Record<string, McpToolInfo[]> = {};
+    const usable: ResolvedMcpServer[] = [];
+    for (const server of resolved) {
+      if (runSignal.aborted) break;
+      try {
+        serverTools[server.id] = await listServerTools(server, {
+          cwd: workingDir,
+          signal: runSignal,
+        });
+        usable.push(server);
+      } catch (err) {
+        // Fail closed: a server whose tools cannot be listed cannot be
+        // classified, so it is not given to the engine at all.
+        missing.push(`${server.id} (${(err as Error).message})`);
+      }
+    }
+    for (const m of missing)
+      await onEvent({ type: "system", text: `MCP server unavailable: ${m}` });
+
+    const policy = buildToolPolicy(worker.autonomy, serverTools);
+    await onEvent({
+      type: "system",
+      text: `tool policy: ${policy.allowed.length} allowed, ${policy.denied.length} denied (${worker.autonomy})`,
+      data: { mcpEnabled: policy.mcpEnabled },
+    });
+
+    const signals = runSignal.aborted
+      ? ""
+      : await collectSignals(workingDir, baseChildEnv(), runSignal);
+    const early = interrupted();
+    if (early) {
+      status = early;
+      return await finishRun(runId, {
+        status,
+        error:
+          early === "timeout"
+            ? `timed out after ${worker.timeoutSeconds}s`
+            : "cancelled by operator",
+      });
+    }
+
+    const prompts = buildPrompts(
+      worker,
+      goals,
+      run.trigger,
+      run.input,
+      new Date(),
+      missing,
+      signals,
+    );
+    // A fresh random nonce per execution is the marker recovery uses to find
+    // this run's agent by its command line (lib/workers/cli-runner.ts). It
+    // exists only in the executor reference, so nothing else can match it.
+    const nonce = randomUUID();
+    // The nonce must never be stored or shown (it is what makes the marker
+    // unforgeable): redact it everywhere from here on.
+    secrets = [...secrets, nonce];
+    prompts.system += `\n\n(${runMarker(nonce)})`;
+    const common = {
+      model: worker.model,
+      workingDir,
+      prompts,
+      policy,
+      servers: usable,
+      timeoutMs: remainingMs(),
+      // The combined signal, so the run's single deadline also covers engine
+      // start-up; the runner decides timeout vs cancel below.
+      signal: runSignal,
+      onEvent,
+    };
+    const result =
+      worker.engine === "agent-sdk"
+        ? await runSdkEngine({
+            ...common,
+            runId,
+            nonce,
+            onExecutor: (ref) => setExecutorRef(runId, ref),
+          })
+        : await runCliEngine({
+            ...common,
+            runId,
+            engine: worker.engine,
+            executor: worker.executor,
+            nonce,
+            onExecutor: (ref) => setExecutorRef(runId, ref),
+          });
+
+    status = interrupted() ?? outcomeStatus(result);
+    const error =
+      status === "timeout"
+        ? `timed out after ${worker.timeoutSeconds}s`
+        : status === "cancelled"
+          ? "cancelled by operator"
+          : result.final.error;
+    return await finishRun(runId, {
+      status,
+      summary: redact(result.final.summary),
+      error: status === "succeeded" ? null : redact(error),
+      // Every stored value is redacted, engine-reported metadata included.
+      usage: redactValue({ ...result.final.usage, engineVersion }, secrets),
+    });
+  } catch (err) {
+    const message = redact(
+      err instanceof Error ? err.message : String(err),
+    ) as string;
+    await onEvent({ type: "error", text: message });
+    if (err instanceof ExecutionCleanupError) {
+      // Keep the run active (one-run-per-worker exclusion holds) until the
+      // leader's reconciliation verifies the execution stopped.
+      status = "running";
+      return getRun(runId);
+    }
+    return finishRun(runId, { status: "failed", error: message });
+  } finally {
+    if (status === "failed" || status === "timeout") {
+      const fresh = await getWorker(worker.id).catch(() => null);
+      if (fresh) await applyFailurePolicy(fresh).catch(() => false);
+    }
+  }
+}
diff --git a/lib/workers/sdk-runner.ts b/lib/workers/sdk-runner.ts
new file mode 100644
index 0000000..e89252e
--- /dev/null
+++ b/lib/workers/sdk-runner.ts
@@ -0,0 +1,235 @@
+/**
+ * The `agent-sdk` engine: Claude Agent SDK `query()` driven from the web
+ * process.
+ *
+ * Requires ANTHROPIC_API_KEY (metered API billing). Without it the engine
+ * refuses to run rather than silently falling back to another login.
+ * Message shapes are the same as `claude -p --output-format stream-json`,
+ * so the Claude mapper is reused.
+ *
+ * The SDK runs Claude Code as a child process. daax spawns that child itself
+ * (`spawnClaudeCodeProcess`) so it gets the same lifecycle guarantees as the
+ * CLI engines: its own process group, the run id on its command line
+ * (`--session-id`), the executor reference recorded before spawn, and
+ * verified cleanup at the end.
+ */
+
+import { spawn } from "node:child_process";
+import { mapClaudeMessage } from "./events";
+import { claudeMcpConfig, type RunPrompts, type ToolPolicy } from "./plan";
+import {
+  ExecutionCleanupError,
+  baseChildEnv,
+  hostRef,
+  processStartTime,
+  stopController,
+  stopExecutionAndWait,
+  type CliRunResult,
+  type Final,
+} from "./cli-runner";
+import type { ResolvedMcpServer } from "./mcp";
+import type { RunEvent } from "@/types/workers";
+
+export interface SdkRunInput {
+  runId: string;
+  /** Fresh random UUID for this execution: the recovery marker. */
+  nonce: string;
+  model: string | null;
+  workingDir: string;
+  prompts: RunPrompts;
+  policy: ToolPolicy;
+  servers: ResolvedMcpServer[];
+  timeoutMs: number;
+  signal: AbortSignal;
+  onEvent: (e: RunEvent) => Promise<void>;
+  onExecutor?: (ref: string) => Promise<void>;
+}
+
+export function agentSdkAvailable(
+  env: NodeJS.ProcessEnv = process.env,
+): boolean {
+  return (
+    typeof env.ANTHROPIC_API_KEY === "string" &&
+    env.ANTHROPIC_API_KEY.length > 0
+  );
+}
+
+const result = (
+  final: Final,
+  flags: { timedOut?: boolean; cancelled?: boolean } = {},
+): CliRunResult => ({
+  final,
+  timedOut: flags.timedOut ?? false,
+  cancelled: flags.cancelled ?? false,
+});
+
+export async function runSdkEngine(input: SdkRunInput): Promise<CliRunResult> {
+  if (!agentSdkAvailable()) {
+    return result({
+      ok: false,
+      summary: null,
+      error:
+        "the agent-sdk engine requires ANTHROPIC_API_KEY in the daax environment",
+      usage: {},
+    });
+  }
+
+  const controller = new AbortController();
+  let timedOut = false;
+  let cancelled = false;
+  const timer = setTimeout(() => {
+    timedOut = true;
+    controller.abort();
+  }, input.timeoutMs);
+  const onAbort = () => {
+    cancelled = true;
+    controller.abort();
+  };
+  // Subscribed before any await, so a cancel during the import is not lost.
+  input.signal.addEventListener("abort", onAbort, { once: true });
+  if (input.signal.aborted) onAbort();
+  const cleanup = () => {
+    clearTimeout(timer);
+    input.signal.removeEventListener("abort", onAbort);
+  };
+  const interruptedResult = () =>
+    result(
+      {
+        ok: false,
+        summary: null,
+        error: cancelled ? "cancelled" : "timed out",
+        usage: {},
+      },
+      { timedOut, cancelled },
+    );
+
+  const { query } = await import("@anthropic-ai/claude-agent-sdk");
+  if (controller.signal.aborted) {
+    cleanup();
+    return interruptedResult();
+  }
+
+  // Recorded before anything is spawned (bounded by cancel/deadline); if it
+  // cannot be recorded, nothing starts.
+  if (input.onExecutor) {
+    const recorded = await Promise.race([
+      input
+        .onExecutor(hostRef(null, null, input.nonce))
+        .then(() => "recorded" as const),
+      new Promise<"aborted">((resolve) => {
+        if (controller.signal.aborted) resolve("aborted");
+        controller.signal.addEventListener("abort", () => resolve("aborted"), {
+          once: true,
+        });
+      }),
+    ]).catch((err) => {
+      cleanup();
+      throw err;
+    });
+    if (recorded === "aborted") {
+      cleanup();
+      return interruptedResult();
+    }
+  }
+
+  const env: Record<string, string> = {
+    ...baseChildEnv(),
+    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY!,
+  };
+  // MCP server credentials are passed per server via mcpServers, never here.
+
+  await input.onEvent({ type: "system", text: "starting agent-sdk" });
+
+  let ref: string | null = null;
+  let pid: number | undefined;
+  let killChild: () => void = () => undefined;
+  const control = stopController(
+    () => ref,
+    () => killChild(),
+  );
+  controller.signal.addEventListener("abort", () => control.stop(), {
+    once: true,
+  });
+
+  let final: Final | undefined;
+  try {
+    const stream = query({
+      prompt: input.prompts.user,
+      options: {
+        cwd: input.workingDir,
+        abortController: controller,
+        // The execution nonce on the child's command line
+        // (--session-id=<nonce>) is the recovery marker.
+        sessionId: input.nonce,
+        systemPrompt: {
+          type: "preset",
+          preset: "claude_code",
+          append: input.prompts.system,
+        },
+        settingSources: [],
+        mcpServers: claudeMcpConfig(input.servers).mcpServers as never,
+        allowedTools: input.policy.allowed,
+        disallowedTools: input.policy.denied,
+        permissionMode: "dontAsk",
+        ...(input.model ? { model: input.model } : {}),
+        env,
+        spawnClaudeCodeProcess: (o) => {
+          const child = spawn(o.command, o.args, {
+            cwd: o.cwd,
+            env: o.env as NodeJS.ProcessEnv,
+            stdio: ["pipe", "pipe", "ignore"],
+            // Own process group, like the CLI engines.
+            detached: true,
+          });
+          pid = child.pid;
+          killChild = () => child.kill("SIGTERM");
+          if (pid) {
+            const start = processStartTime(pid);
+            ref = hostRef(pid, start, input.nonce);
+            input.onExecutor?.(ref).catch(() => {
+              if (!control.settled) control.stop();
+            });
+          }
+          return child;
+        },
+      },
+    });
+    for await (const message of stream) {
+      const parsed = mapClaudeMessage(message);
+      for (const e of parsed.events) await input.onEvent(e);
+      if (parsed.final) final = parsed.final;
+    }
+  } catch (err) {
+    if (!timedOut && !cancelled) {
+      final = {
+        ok: false,
+        summary: null,
+        error: `agent-sdk failed: ${err instanceof Error ? err.message : String(err)}`,
+        usage: {},
+      };
+    }
+  } finally {
+    cleanup();
+  }
+
+  // Verified cleanup of the SDK's child group before the run is released.
+  if (pid) {
+    const finalRef = `host:${pid}`;
+    try {
+      await stopExecutionAndWait(finalRef);
+    } catch (err) {
+      throw new ExecutionCleanupError(finalRef, (err as Error).message);
+    }
+  }
+  control.settle();
+
+  return result(
+    final ?? {
+      ok: false,
+      summary: null,
+      error: "agent-sdk ended without a result",
+      usage: {},
+    },
+    { timedOut, cancelled },
+  );
+}

hook: PostToolUse
exec
/bin/zsh -lc 'rg --files -g AGENTS.md -g CLAUDE.md lib app components scripts migrations .claude; cat package.json; rg --files tests/lib/workers tests | rg workers' in /Users/jasonpoley/prj/dx/src/daax-web
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
tests/e2e/workers.spec.ts
tests/api/workers-route.test.ts
tests/api/workers-fixtures.ts
tests/scripts/workers-cli.test.ts
tests/api/workers-runs-route.test.ts
tests/integration/workers-pg.test.ts
tests/components/workers/markdown.test.tsx
tests/components/workers/schedule.test.ts
tests/components/workers/ask-bar.test.tsx
tests/components/workers/voice.test.ts
tests/lib/workers/mcp.test.ts
tests/lib/workers/scheduler.test.ts
tests/lib/workers/events.test.ts
tests/lib/workers/service.test.ts
tests/lib/workers/plan.test.ts
tests/lib/workers/host-ref.test.ts
tests/lib/workers/sdk-runner.test.ts
tests/lib/workers/runner-redaction.test.ts
tests/lib/workers/cli-runner.test.ts
tests/lib/workers/runner.test.ts
tests/lib/workers/cli-runner-process.test.ts
tests/lib/workers/signals.test.ts
tests/lib/workers/validation.test.ts

hook: PostToolUse
hook: PostToolUse Completed
hook: PostToolUse Completed
mcp: backlog/get_workflow_overview started
mcp: backlog/get_workflow_overview (failed)
MCP tool call requires approval, but approval policy is never
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Completed
exec
/bin/zsh -lc 'git diff origin/main...HEAD -- lib/workers/store.ts lib/workers/validation.ts migrations/1781568000400_digital-workers.js' in /Users/jasonpoley/prj/dx/src/daax-web
 succeeded in 0ms:
diff --git a/lib/workers/store.ts b/lib/workers/store.ts
new file mode 100644
index 0000000..d788e95
--- /dev/null
+++ b/lib/workers/store.ts
@@ -0,0 +1,626 @@
+/**
+ * Digital Workers — Postgres store (docs/plans/digital-workers.md §5).
+ *
+ * Plain async functions over the shared `pg` pool, following `lib/catalog/db.ts`:
+ * jsonb columns are written with JSON.stringify and read back parsed;
+ * timestamptz values are normalised to ISO-8601 strings.
+ */
+
+import { randomUUID } from "node:crypto";
+import { getClient, query } from "@/lib/db/pg";
+import { UUID_RE } from "@/types/workers";
+import type {
+  GoalStatus,
+  RunEvent,
+  RunStatus,
+  RunTrigger,
+  RunUsage,
+  Worker,
+  WorkerEngine,
+  WorkerGoal,
+  WorkerMcpServer,
+  WorkerRun,
+  WorkerRunEvent,
+} from "@/types/workers";
+
+type Row = Record<string, unknown>;
+
+/** Thrown when a worker already has a queued or running run. */
+export class RunConflictError extends Error {
+  constructor(public readonly workerId: string) {
+    super("Worker already has a run in progress");
+    this.name = "RunConflictError";
+  }
+}
+
+function iso(v: unknown): string {
+  if (v instanceof Date) return v.toISOString();
+  return new Date(v as string).toISOString();
+}
+
+function isoOrNull(v: unknown): string | null {
+  return v == null ? null : iso(v);
+}
+
+function toWorker(r: Row): Worker {
+  return {
+    id: r.id as string,
+    slug: r.slug as string,
+    name: r.name as string,
+    role: r.role as Worker["role"],
+    description: r.description as string,
+    instructions: r.instructions as string,
+    engine: r.engine as Worker["engine"],
+    model: (r.model as string | null) ?? null,
+    runMode: r.run_mode as Worker["runMode"],
+    cron: (r.cron as string | null) ?? null,
+    cooldownSeconds: r.cooldown_seconds as number,
+    maxRunsPerDay: r.max_runs_per_day as number,
+    timeoutSeconds: r.timeout_seconds as number,
+    autonomy: r.autonomy as Worker["autonomy"],
+    executor: r.executor as Worker["executor"],
+    workingDir: (r.working_dir as string | null) ?? null,
+    mcpServers: (r.mcp_servers as WorkerMcpServer[] | null) ?? [],
+    enabled: r.enabled as boolean,
+    pausedReason: (r.paused_reason as string | null) ?? null,
+    createdBy: (r.created_by as string | null) ?? null,
+    createdAt: iso(r.created_at),
+    updatedAt: iso(r.updated_at),
+  };
+}
+
+function toGoal(r: Row): WorkerGoal {
+  return {
+    id: r.id as string,
+    workerId: r.worker_id as string,
+    title: r.title as string,
+    description: r.description as string,
+    projectRef: (r.project_ref as string | null) ?? null,
+    successCriteria: r.success_criteria as string,
+    status: r.status as GoalStatus,
+    priority: r.priority as number,
+    createdAt: iso(r.created_at),
+    updatedAt: iso(r.updated_at),
+  };
+}
+
+function toRun(r: Row): WorkerRun {
+  return {
+    id: r.id as string,
+    workerId: r.worker_id as string,
+    trigger: r.trigger as RunTrigger,
+    input: r.input as string,
+    status: r.status as RunStatus,
+    engine: r.engine as WorkerEngine,
+    queuedAt: iso(r.queued_at),
+    startedAt: isoOrNull(r.started_at),
+    finishedAt: isoOrNull(r.finished_at),
+    summary: (r.summary as string | null) ?? null,
+    error: (r.error as string | null) ?? null,
+    usage: (r.usage as RunUsage | null) ?? {},
+    requestedBy: (r.requested_by as string | null) ?? null,
+    cancelRequested: r.cancel_requested === true,
+  };
+}
+
+function toEvent(r: Row): WorkerRunEvent {
+  return {
+    id: Number(r.id),
+    runId: r.run_id as string,
+    seq: r.seq as number,
+    at: iso(r.at),
+    type: r.type as WorkerRunEvent["type"],
+    text: (r.text as string | null) ?? undefined,
+    tool: (r.tool as string | null) ?? undefined,
+    data: r.data ?? undefined,
+  };
+}
+
+// ============================================================================
+// Workers
+// ============================================================================
+
+/** Column name for each writable Worker field. */
+const WORKER_COLUMNS = {
+  slug: "slug",
+  name: "name",
+  role: "role",
+  description: "description",
+  instructions: "instructions",
+  engine: "engine",
+  model: "model",
+  runMode: "run_mode",
+  cron: "cron",
+  cooldownSeconds: "cooldown_seconds",
+  maxRunsPerDay: "max_runs_per_day",
+  timeoutSeconds: "timeout_seconds",
+  autonomy: "autonomy",
+  executor: "executor",
+  workingDir: "working_dir",
+  mcpServers: "mcp_servers",
+  enabled: "enabled",
+  pausedReason: "paused_reason",
+} as const satisfies Partial<Record<keyof Worker, string>>;
+
+export type WorkerInput = Partial<Pick<Worker, keyof typeof WORKER_COLUMNS>> & {
+  name: string;
+  slug: string;
+};
+
+export type WorkerPatch = Partial<Pick<Worker, keyof typeof WORKER_COLUMNS>>;
+
+function columnValue(key: keyof typeof WORKER_COLUMNS, value: unknown) {
+  return key === "mcpServers" ? JSON.stringify(value ?? []) : value;
+}
+
+export async function listWorkers(): Promise<Worker[]> {
+  const res = await query("SELECT * FROM workers ORDER BY name");
+  return res.rows.map(toWorker);
+}
+
+/** Look a worker up by id (uuid) or slug. */
+export async function getWorker(idOrSlug: string): Promise<Worker | null> {
+  const isUuid = UUID_RE.test(idOrSlug);
+  const res = await query(
+    isUuid
+      ? "SELECT * FROM workers WHERE id = $1"
+      : "SELECT * FROM workers WHERE slug = $1",
+    [idOrSlug],
+  );
+  return res.rows[0] ? toWorker(res.rows[0]) : null;
+}
+
+export async function createWorker(
+  input: WorkerInput,
+  createdBy: string | null,
+): Promise<Worker> {
+  const cols = ["id", "created_by"];
+  const vals: unknown[] = [randomUUID(), createdBy];
+  for (const [key, col] of Object.entries(WORKER_COLUMNS)) {
+    const v = input[key as keyof WorkerInput];
+    if (v !== undefined) {
+      cols.push(col);
+      vals.push(columnValue(key as keyof typeof WORKER_COLUMNS, v));
+    }
+  }
+  const placeholders = vals.map((_, i) => `$${i + 1}`).join(", ");
+  const res = await query(
+    `INSERT INTO workers (${cols.join(", ")}) VALUES (${placeholders}) RETURNING *`,
+    vals,
+  );
+  return toWorker(res.rows[0]);
+}
+
+export async function updateWorker(
+  id: string,
+  patch: WorkerPatch,
+): Promise<Worker | null> {
+  const sets: string[] = [];
+  const vals: unknown[] = [];
+  for (const [key, col] of Object.entries(WORKER_COLUMNS)) {
+    const v = patch[key as keyof WorkerPatch];
+    if (v !== undefined) {
+      vals.push(columnValue(key as keyof typeof WORKER_COLUMNS, v));
+      sets.push(`${col} = $${vals.length}`);
+    }
+  }
+  if (sets.length === 0) return getWorker(id);
+  vals.push(id);
+  const res = await query(
+    `UPDATE workers SET ${sets.join(", ")}, updated_at = now() WHERE id = $${vals.length} RETURNING *`,
+    vals,
+  );
+  return res.rows[0] ? toWorker(res.rows[0]) : null;
+}
+
+/**
+ * Delete a worker only if it has no queued/running run, atomically. The row
+ * lock (FOR UPDATE) conflicts with the key-share lock a concurrent run INSERT
+ * takes through the worker_runs foreign key, so deletion and enqueue are
+ * serialized: a run created first is seen here; one created after fails.
+ */
+export async function deleteWorkerIfIdle(
+  id: string,
+): Promise<"deleted" | "active" | "missing"> {
+  const client = await getClient();
+  try {
+    await client.query("BEGIN");
+    const found = await client.query(
+      "SELECT id FROM workers WHERE id = $1 FOR UPDATE",
+      [id],
+    );
+    if (found.rowCount === 0) {
+      await client.query("ROLLBACK");
+      return "missing";
+    }
+    const active = await client.query(
+      "SELECT 1 FROM worker_runs WHERE worker_id = $1 AND status IN ('queued','running') LIMIT 1",
+      [id],
+    );
+    if ((active.rowCount ?? 0) > 0) {
+      await client.query("ROLLBACK");
+      return "active";
+    }
+    await client.query("DELETE FROM workers WHERE id = $1", [id]);
+    await client.query("COMMIT");
+    return "deleted";
+  } catch (err) {
+    await client.query("ROLLBACK").catch(() => undefined);
+    throw err;
+  } finally {
+    client.release();
+  }
+}
+
+export async function deleteWorker(id: string): Promise<boolean> {
+  const res = await query("DELETE FROM workers WHERE id = $1", [id]);
+  return (res.rowCount ?? 0) > 0;
+}
+
+// ============================================================================
+// Goals
+// ============================================================================
+
+export type GoalInput = Pick<WorkerGoal, "title"> &
+  Partial<
+    Pick<
+      WorkerGoal,
+      "description" | "projectRef" | "successCriteria" | "status" | "priority"
+    >
+  >;
+
+const GOAL_COLUMNS = {
+  title: "title",
+  description: "description",
+  projectRef: "project_ref",
+  successCriteria: "success_criteria",
+  status: "status",
+  priority: "priority",
+} as const;
+
+export async function listGoals(
+  workerId: string,
+  status?: GoalStatus,
+): Promise<WorkerGoal[]> {
+  const res = status
+    ? await query(
+        "SELECT * FROM worker_goals WHERE worker_id = $1 AND status = $2 ORDER BY priority DESC, created_at",
+        [workerId, status],
+      )
+    : await query(
+        "SELECT * FROM worker_goals WHERE worker_id = $1 ORDER BY priority DESC, created_at",
+        [workerId],
+      );
+  return res.rows.map(toGoal);
+}
+
+export async function createGoal(
+  workerId: string,
+  input: GoalInput,
+): Promise<WorkerGoal> {
+  const cols = ["id", "worker_id"];
+  const vals: unknown[] = [randomUUID(), workerId];
+  for (const [key, col] of Object.entries(GOAL_COLUMNS)) {
+    const v = input[key as keyof GoalInput];
+    if (v !== undefined) {
+      cols.push(col);
+      vals.push(v);
+    }
+  }
+  const placeholders = vals.map((_, i) => `$${i + 1}`).join(", ");
+  const res = await query(
+    `INSERT INTO worker_goals (${cols.join(", ")}) VALUES (${placeholders}) RETURNING *`,
+    vals,
+  );
+  return toGoal(res.rows[0]);
+}
+
+export async function updateGoal(
+  workerId: string,
+  goalId: string,
+  patch: Partial<GoalInput>,
+): Promise<WorkerGoal | null> {
+  const sets: string[] = [];
+  const vals: unknown[] = [];
+  for (const [key, col] of Object.entries(GOAL_COLUMNS)) {
+    const v = patch[key as keyof GoalInput];
+    if (v !== undefined) {
+      vals.push(v);
+      sets.push(`${col} = $${vals.length}`);
+    }
+  }
+  if (sets.length === 0) {
+    const res = await query(
+      "SELECT * FROM worker_goals WHERE id = $1 AND worker_id = $2",
+      [goalId, workerId],
+    );
+    return res.rows[0] ? toGoal(res.rows[0]) : null;
+  }
+  vals.push(goalId, workerId);
+  const res = await query(
+    `UPDATE worker_goals SET ${sets.join(", ")}, updated_at = now()
+       WHERE id = $${vals.length - 1} AND worker_id = $${vals.length} RETURNING *`,
+    vals,
+  );
+  return res.rows[0] ? toGoal(res.rows[0]) : null;
+}
+
+export async function deleteGoal(
+  workerId: string,
+  goalId: string,
+): Promise<boolean> {
+  const res = await query(
+    "DELETE FROM worker_goals WHERE id = $1 AND worker_id = $2",
+    [goalId, workerId],
+  );
+  return (res.rowCount ?? 0) > 0;
+}
+
+// ============================================================================
+// Runs
+// ============================================================================
+
+/**
+ * Queue a run. The partial unique index `worker_runs_one_active_idx` makes
+ * "one queued/running run per worker" a database guarantee; a violation is
+ * surfaced as RunConflictError.
+ */
+export async function createRun(
+  worker: Pick<Worker, "id" | "engine">,
+  trigger: RunTrigger,
+  input: string,
+  requestedBy: string | null,
+): Promise<WorkerRun> {
+  try {
+    const res = await query(
+      `INSERT INTO worker_runs (id, worker_id, trigger, input, engine, requested_by)
+         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
+      [randomUUID(), worker.id, trigger, input, worker.engine, requestedBy],
+    );
+    return toRun(res.rows[0]);
+  } catch (err) {
+    if ((err as { code?: string }).code === "23505") {
+      throw new RunConflictError(worker.id);
+    }
+    throw err;
+  }
+}
+
+/** queued → running. Returns false if the run is no longer queued (e.g. cancelled). */
+export async function markRunStarted(runId: string): Promise<boolean> {
+  const res = await query(
+    "UPDATE worker_runs SET status = 'running', started_at = now() WHERE id = $1 AND status = 'queued'",
+    [runId],
+  );
+  return (res.rowCount ?? 0) > 0;
+}
+
+/**
+ * running → terminal. Only a run still `running` is updated, so a completion
+ * from a deposed leader (whose run the new leader already failed) is ignored.
+ */
+export async function finishRun(
+  runId: string,
+  result: {
+    status: RunStatus;
+    summary?: string | null;
+    error?: string | null;
+    usage?: RunUsage;
+  },
+): Promise<WorkerRun | null> {
+  const res = await query(
+    `UPDATE worker_runs
+        SET status = $2, summary = $3, error = $4, usage = $5, finished_at = now()
+      WHERE id = $1 AND status IN ('queued','running') RETURNING *`,
+    [
+      runId,
+      result.status,
+      result.summary ?? null,
+      result.error ?? null,
+      JSON.stringify(result.usage ?? {}),
+    ],
+  );
+  return res.rows[0] ? toRun(res.rows[0]) : null;
+}
+
+/** Record where a run executes (container name / host process group). */
+export async function setExecutorRef(
+  runId: string,
+  ref: string,
+): Promise<void> {
+  await query("UPDATE worker_runs SET executor_ref = $2 WHERE id = $1", [
+    runId,
+    ref,
+  ]);
+}
+
+/** Ask the executing leader to cancel a running run (any instance may call). */
+export async function requestCancel(runId: string): Promise<boolean> {
+  const res = await query(
+    "UPDATE worker_runs SET cancel_requested = true WHERE id = $1 AND status = 'running'",
+    [runId],
+  );
+  return (res.rowCount ?? 0) > 0;
+}
+
+/** Of the given run ids, those with a pending cancel request. */
+export async function cancelRequestedAmong(
+  runIds: string[],
+): Promise<string[]> {
+  if (runIds.length === 0) return [];
+  const res = await query<{ id: string }>(
+    "SELECT id FROM worker_runs WHERE id = ANY($1::uuid[]) AND cancel_requested",
+    [runIds],
+  );
+  return res.rows.map((r) => r.id);
+}
+
+/** Runs still marked running (with where they execute), for leader recovery. */
+export async function listRunningRuns(): Promise<
+  { id: string; executorRef: string | null }[]
+> {
+  const res = await query<{ id: string; executor_ref: string | null }>(
+    "SELECT id, executor_ref FROM worker_runs WHERE status = 'running'",
+  );
+  return res.rows.map((r) => ({ id: r.id, executorRef: r.executor_ref }));
+}
+
+/** Is any run of this worker queued or running? */
+export async function hasActiveRun(workerId: string): Promise<boolean> {
+  const res = await query(
+    "SELECT 1 FROM worker_runs WHERE worker_id = $1 AND status IN ('queued','running') LIMIT 1",
+    [workerId],
+  );
+  return (res.rowCount ?? 0) > 0;
+}
+
+export async function getRun(runId: string): Promise<WorkerRun | null> {
+  const res = await query("SELECT * FROM worker_runs WHERE id = $1", [runId]);
+  return res.rows[0] ? toRun(res.rows[0]) : null;
+}
+
+export async function listRuns(
+  workerId: string,
+  limit = 20,
+): Promise<WorkerRun[]> {
+  const res = await query(
+    "SELECT * FROM worker_runs WHERE worker_id = $1 ORDER BY queued_at DESC LIMIT $2",
+    [workerId, limit],
+  );
+  return res.rows.map(toRun);
+}
+
+/** Latest run per worker, keyed by worker id. */
+export async function lastRunsByWorker(): Promise<Map<string, WorkerRun>> {
+  const res = await query(
+    `SELECT DISTINCT ON (worker_id) * FROM worker_runs
+      ORDER BY worker_id, queued_at DESC`,
+  );
+  return new Map(res.rows.map((r) => [r.worker_id as string, toRun(r)]));
+}
+
+/**
+ * The worker's "brief": the most recent successful full report (a run with
+ * no question), falling back to the most recent answer when none exists.
+ */
+export async function latestBrief(workerId: string): Promise<WorkerRun | null> {
+  const res = await query(
+    `SELECT * FROM worker_runs
+      WHERE worker_id = $1 AND status = 'succeeded' AND summary IS NOT NULL
+      ORDER BY (input = '') DESC, finished_at DESC LIMIT 1`,
+    [workerId],
+  );
+  return res.rows[0] ? toRun(res.rows[0]) : null;
+}
+
+/** Automatic (schedule/continuous) runs queued since `since`. */
+export async function countAutomaticRunsSince(
+  workerId: string,
+  since: Date,
+): Promise<number> {
+  const res = await query<{ n: string }>(
+    `SELECT count(*) AS n FROM worker_runs
+      WHERE worker_id = $1 AND trigger IN ('schedule','continuous') AND queued_at >= $2`,
+    [workerId, since.toISOString()],
+  );
+  return Number(res.rows[0]?.n ?? 0);
+}
+
+/** Statuses of the most recent finished runs, newest first. */
+export async function recentFinishedStatuses(
+  workerId: string,
+  n: number,
+): Promise<RunStatus[]> {
+  const res = await query<{ status: RunStatus }>(
+    `SELECT status FROM worker_runs
+      WHERE worker_id = $1 AND finished_at IS NOT NULL
+      ORDER BY finished_at DESC LIMIT $2`,
+    [workerId, n],
+  );
+  return res.rows.map((r) => r.status);
+}
+
+/** Fail one still-running run whose execution was verified stopped. */
+export async function failRunningRun(
+  runId: string,
+  error: string,
+): Promise<boolean> {
+  const res = await query(
+    `UPDATE worker_runs SET status = 'failed', error = $2, finished_at = now()
+      WHERE id = $1 AND status = 'running'`,
+    [runId, error],
+  );
+  return (res.rowCount ?? 0) > 0;
+}
+
+/** Oldest queued runs across all workers (the leader's work queue). */
+export async function listQueuedRuns(limit = 10): Promise<WorkerRun[]> {
+  const res = await query(
+    "SELECT * FROM worker_runs WHERE status = 'queued' ORDER BY queued_at LIMIT $1",
+    [limit],
+  );
+  return res.rows.map(toRun);
+}
+
+/** Cancel a queued run, or flag a running one; returns the updated run. */
+export async function cancelQueuedRun(
+  runId: string,
+): Promise<WorkerRun | null> {
+  const res = await query(
+    `UPDATE worker_runs SET status = 'cancelled', finished_at = now(), error = 'cancelled by operator'
+      WHERE id = $1 AND status = 'queued' RETURNING *`,
+    [runId],
+  );
+  return res.rows[0] ? toRun(res.rows[0]) : null;
+}
+
+/**
+ * Delete finished runs (and, by cascade, their events) older than `days`.
+ * Queued/running rows are never pruned: they hold the one-active-run
+ * exclusion and the recovery reference of an execution still being cleaned up.
+ */
+export async function pruneRuns(days: number): Promise<number> {
+  const res = await query(
+    `DELETE FROM worker_runs
+      WHERE status NOT IN ('queued','running')
+        AND finished_at < now() - make_interval(days => $1)`,
+    [days],
+  );
+  return res.rowCount ?? 0;
+}
+
+// ============================================================================
+// Run events
+// ============================================================================
+
+export async function appendRunEvent(
+  runId: string,
+  seq: number,
+  event: RunEvent,
+): Promise<void> {
+  await query(
+    `INSERT INTO worker_run_events (run_id, seq, type, text, tool, data)
+       VALUES ($1, $2, $3, $4, $5, $6)`,
+    [
+      runId,
+      seq,
+      event.type,
+      event.text ?? null,
+      event.tool ?? null,
+      event.data === undefined ? null : JSON.stringify(event.data),
+    ],
+  );
+}
+
+export async function listRunEvents(
+  runId: string,
+  afterSeq = -1,
+  limit = 500,
+): Promise<WorkerRunEvent[]> {
+  const res = await query(
+    `SELECT * FROM worker_run_events WHERE run_id = $1 AND seq > $2
+      ORDER BY seq LIMIT $3`,
+    [runId, afterSeq, limit],
+  );
+  return res.rows.map(toEvent);
+}
diff --git a/lib/workers/validation.ts b/lib/workers/validation.ts
new file mode 100644
index 0000000..0283c69
--- /dev/null
+++ b/lib/workers/validation.ts
@@ -0,0 +1,380 @@
+/**
+ * Digital Workers — request-body validation (system boundary).
+ *
+ * Every /api/workers route parses its body through these functions. They
+ * return a discriminated result instead of throwing so routes map failures to
+ * a 400 with a precise message.
+ */
+
+import { Cron } from "croner";
+import {
+  GOAL_STATUSES,
+  WORKER_AUTONOMY,
+  WORKER_ENGINES,
+  WORKER_EXECUTORS,
+  WORKER_ROLES,
+  WORKER_RUN_MODES,
+  UUID_RE,
+  type GoalStatus,
+  type WorkerMcpServer,
+} from "@/types/workers";
+import { isReservedEnvName } from "./mcp";
+import type { GoalInput, WorkerInput, WorkerPatch } from "./store";
+
+export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
+
+export const LIMITS = {
+  nameMax: 100,
+  descriptionMax: 2_000,
+  instructionsMax: 20_000,
+  modelMax: 100,
+  cronMax: 100,
+  pathMax: 1_024,
+  mcpServersMax: 20,
+  goalTitleMax: 200,
+  goalTextMax: 5_000,
+  askMax: 4_000,
+  cooldownMin: 300,
+  cooldownMax: 86_400,
+  runsPerDayMin: 1,
+  runsPerDayMax: 288,
+  timeoutMin: 60,
+  timeoutMax: 3_600,
+} as const;
+
+const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,48}$/;
+const MCP_ID_RE = /^[A-Za-z0-9_.-]{1,64}$/;
+const ENV_NAME_RE = /^[A-Z_][A-Z0-9_]{0,63}$/;
+
+type Body = Record<string, unknown>;
+
+function isObject(v: unknown): v is Body {
+  return typeof v === "object" && v !== null && !Array.isArray(v);
+}
+
+function str(
+  body: Body,
+  key: string,
+  max: number,
+  errors: string[],
+): string | undefined {
+  const v = body[key];
+  if (v === undefined) return undefined;
+  if (typeof v !== "string") {
+    errors.push(`${key} must be a string`);
+    return undefined;
+  }
+  if (v.length > max) errors.push(`${key} must be at most ${max} characters`);
+  return v;
+}
+
+function nullableStr(
+  body: Body,
+  key: string,
+  max: number,
+  errors: string[],
+): string | null | undefined {
+  if (body[key] === null) return null;
+  const v = str(body, key, max, errors);
+  return v === "" ? null : v;
+}
+
+function int(
+  body: Body,
+  key: string,
+  min: number,
+  max: number,
+  errors: string[],
+): number | undefined {
+  const v = body[key];
+  if (v === undefined) return undefined;
+  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) {
+    errors.push(`${key} must be an integer between ${min} and ${max}`);
+    return undefined;
+  }
+  return v;
+}
+
+function oneOf<T extends string>(
+  body: Body,
+  key: string,
+  allowed: readonly T[],
+  errors: string[],
+): T | undefined {
+  const v = body[key];
+  if (v === undefined) return undefined;
+  if (typeof v !== "string" || !allowed.includes(v as T)) {
+    errors.push(`${key} must be one of: ${allowed.join(", ")}`);
+    return undefined;
+  }
+  return v as T;
+}
+
+/** Validate a cron expression; returns an error message or null. */
+export function cronError(expr: string): string | null {
+  try {
+    new Cron(expr, { timezone: "UTC", paused: true });
+    return null;
+  } catch (err) {
+    return `cron is invalid: ${err instanceof Error ? err.message : String(err)}`;
+  }
+}
+
+function mcpServers(
+  body: Body,
+  errors: string[],
+): WorkerMcpServer[] | undefined {
+  const v = body.mcpServers;
+  if (v === undefined) return undefined;
+  if (!Array.isArray(v) || v.length > LIMITS.mcpServersMax) {
+    errors.push(
+      `mcpServers must be an array of at most ${LIMITS.mcpServersMax}`,
+    );
+    return undefined;
+  }
+  const out: WorkerMcpServer[] = [];
+  const seen = new Set<string>();
+  for (const [i, raw] of v.entries()) {
+    const at = `mcpServers[${i}]`;
+    if (
+      !isObject(raw) ||
+      typeof raw.id !== "string" ||
+      !MCP_ID_RE.test(raw.id)
+    ) {
+      errors.push(`${at}.id must match ${MCP_ID_RE}`);
+      continue;
+    }
+    if (seen.has(raw.id)) {
+      errors.push(`${at}.id "${raw.id}" is duplicated`);
+      continue;
+    }
+    seen.add(raw.id);
+    if (raw.kind === "ref") {
+      out.push({ kind: "ref", id: raw.id });
+      continue;
+    }
+    if (raw.kind !== "inline") {
+      errors.push(`${at}.kind must be "ref" or "inline"`);
+      continue;
+    }
+    if (raw.type !== "stdio" && raw.type !== "http") {
+      errors.push(`${at}.type must be "stdio" or "http"`);
+      continue;
+    }
+    if (raw.type === "stdio") {
+      if (typeof raw.command !== "string" || !raw.command.trim()) {
+        errors.push(`${at}.command is required for stdio servers`);
+        continue;
+      }
+      if (
+        raw.args !== undefined &&
+        (!Array.isArray(raw.args) ||
+          raw.args.length > 50 ||
+          !raw.args.every((a) => typeof a === "string" && a.length <= 1_000))
+      ) {
+        errors.push(`${at}.args must be an array of strings`);
+        continue;
+      }
+    } else {
+      let okUrl = false;
+      try {
+        const u = new URL(String(raw.url));
+        okUrl = u.protocol === "https:" || u.protocol === "http:";
+      } catch {
+        okUrl = false;
+      }
+      if (!okUrl) {
+        errors.push(`${at}.url must be an http(s) URL`);
+        continue;
+      }
+    }
+    const env = raw.envPassthrough;
+    if (
+      env !== undefined &&
+      (!Array.isArray(env) ||
+        env.length > 20 ||
+        !env.every((e) => typeof e === "string" && ENV_NAME_RE.test(e)))
+    ) {
+      errors.push(
+        `${at}.envPassthrough must list environment variable NAMES (values are never stored)`,
+      );
+      continue;
+    }
+    const reserved = ((env as string[] | undefined) ?? []).filter(
+      isReservedEnvName,
+    );
+    if (reserved.length) {
+      errors.push(
+        `${at}.envPassthrough cannot include daax or engine variables: ${reserved.join(", ")}`,
+      );
+      continue;
+    }
+    out.push({
+      kind: "inline",
+      id: raw.id,
+      type: raw.type,
+      command: raw.type === "stdio" ? String(raw.command) : undefined,
+      args:
+        raw.type === "stdio" ? (raw.args as string[] | undefined) : undefined,
+      url: raw.type === "http" ? String(raw.url) : undefined,
+      envPassthrough: env as string[] | undefined,
+    });
+  }
+  return out;
+}
+
+function parseWorkerFields(body: Body, errors: string[]): WorkerPatch {
+  const patch: WorkerPatch = {
+    name: str(body, "name", LIMITS.nameMax, errors),
+    role: oneOf(body, "role", WORKER_ROLES, errors),
+    description: str(body, "description", LIMITS.descriptionMax, errors),
+    instructions: str(body, "instructions", LIMITS.instructionsMax, errors),
+    engine: oneOf(body, "engine", WORKER_ENGINES, errors),
+    model: nullableStr(body, "model", LIMITS.modelMax, errors),
+    runMode: oneOf(body, "runMode", WORKER_RUN_MODES, errors),
+    cron: nullableStr(body, "cron", LIMITS.cronMax, errors),
+    cooldownSeconds: int(
+      body,
+      "cooldownSeconds",
+      LIMITS.cooldownMin,
+      LIMITS.cooldownMax,
+      errors,
+    ),
+    maxRunsPerDay: int(
+      body,
+      "maxRunsPerDay",
+      LIMITS.runsPerDayMin,
+      LIMITS.runsPerDayMax,
+      errors,
+    ),
+    timeoutSeconds: int(
+      body,
+      "timeoutSeconds",
+      LIMITS.timeoutMin,
+      LIMITS.timeoutMax,
+      errors,
+    ),
+    autonomy: oneOf(body, "autonomy", WORKER_AUTONOMY, errors),
+    executor: oneOf(body, "executor", WORKER_EXECUTORS, errors),
+    workingDir: nullableStr(body, "workingDir", LIMITS.pathMax, errors),
+    mcpServers: mcpServers(body, errors),
+  };
+  if (body.enabled !== undefined) {
+    if (typeof body.enabled !== "boolean")
+      errors.push("enabled must be a boolean");
+    else patch.enabled = body.enabled;
+  }
+  if (patch.name !== undefined && !patch.name.trim()) {
+    errors.push("name must not be empty");
+  }
+  if (patch.cron) {
+    const e = cronError(patch.cron);
+    if (e) errors.push(e);
+  }
+  // Absolute, or relative to the workspace root (portable between host and
+  // container mode). Confinement is enforced at run time on the real path.
+  if (patch.workingDir && patch.workingDir.includes("\0")) {
+    errors.push("workingDir must not contain NUL");
+  }
+  return patch;
+}
+
+function stripUndefined<T extends object>(o: T): T {
+  return Object.fromEntries(
+    Object.entries(o).filter(([, v]) => v !== undefined),
+  ) as T;
+}
+
+/** Validate a create body. `slug` and `name` are required. */
+export function parseWorkerCreate(body: unknown): Result<WorkerInput> {
+  if (!isObject(body))
+    return { ok: false, error: "body must be a JSON object" };
+  const errors: string[] = [];
+  const slug = body.slug;
+  if (typeof slug !== "string" || !SLUG_RE.test(slug)) {
+    errors.push(
+      "slug is required: lowercase letters, digits and dashes, 2-49 characters",
+    );
+  } else if (UUID_RE.test(slug)) {
+    // Workers are looked up by id or slug; a UUID-shaped slug is ambiguous.
+    errors.push("slug must not look like a UUID");
+  }
+  if (typeof body.name !== "string") errors.push("name is required");
+  const patch = parseWorkerFields(body, errors);
+  const mode = patch.runMode ?? "adhoc";
+  if (mode === "schedule" && !patch.cron) {
+    errors.push("cron is required when runMode is schedule");
+  }
+  if (errors.length) return { ok: false, error: errors.join("; ") };
+  return {
+    ok: true,
+    value: stripUndefined({
+      ...patch,
+      slug: slug as string,
+      name: patch.name!,
+    }),
+  };
+}
+
+/**
+ * Validate an update body. Cross-field rules are checked against the merged
+ * result by the caller via `checkRunPolicy`.
+ */
+export function parseWorkerPatch(body: unknown): Result<WorkerPatch> {
+  if (!isObject(body))
+    return { ok: false, error: "body must be a JSON object" };
+  if ("slug" in body) return { ok: false, error: "slug cannot be changed" };
+  const errors: string[] = [];
+  const patch = parseWorkerFields(body, errors);
+  if (errors.length) return { ok: false, error: errors.join("; ") };
+  return { ok: true, value: stripUndefined(patch) };
+}
+
+/** Cross-field run-policy rule, applied to the merged worker. */
+export function checkRunPolicy(w: {
+  runMode: string;
+  cron: string | null;
+}): string | null {
+  if (w.runMode === "schedule" && !w.cron) {
+    return "cron is required when runMode is schedule";
+  }
+  return null;
+}
+
+export function parseGoal(
+  body: unknown,
+  partial: boolean,
+): Result<Partial<GoalInput>> {
+  if (!isObject(body))
+    return { ok: false, error: "body must be a JSON object" };
+  const errors: string[] = [];
+  const title = str(body, "title", LIMITS.goalTitleMax, errors);
+  if (!partial && (!title || !title.trim())) errors.push("title is required");
+  if (partial && title !== undefined && !title.trim()) {
+    errors.push("title must not be empty");
+  }
+  const value: Partial<GoalInput> = {
+    title: title?.trim(),
+    description: str(body, "description", LIMITS.goalTextMax, errors),
+    projectRef: nullableStr(body, "projectRef", LIMITS.pathMax, errors),
+    successCriteria: str(body, "successCriteria", LIMITS.goalTextMax, errors),
+    status: oneOf<GoalStatus>(body, "status", GOAL_STATUSES, errors),
+    priority: int(body, "priority", -100, 100, errors),
+  };
+  if (errors.length) return { ok: false, error: errors.join("; ") };
+  return { ok: true, value: stripUndefined(value) };
+}
+
+/** Validate an ad hoc run / ask body. */
+export function parseRunRequest(
+  body: unknown,
+): Result<{ input: string; trigger: "adhoc" | "cli" | "voice" }> {
+  const b = body === undefined || body === null ? {} : body;
+  if (!isObject(b)) return { ok: false, error: "body must be a JSON object" };
+  const errors: string[] = [];
+  const input = str(b, "input", LIMITS.askMax, errors) ?? "";
+  const trigger =
+    oneOf(b, "trigger", ["adhoc", "cli", "voice"] as const, errors) ?? "adhoc";
+  if (errors.length) return { ok: false, error: errors.join("; ") };
+  return { ok: true, value: { input: input.trim(), trigger } };
+}
diff --git a/migrations/1781568000400_digital-workers.js b/migrations/1781568000400_digital-workers.js
new file mode 100644
index 0000000..eda8465
--- /dev/null
+++ b/migrations/1781568000400_digital-workers.js
@@ -0,0 +1,175 @@
+/**
+ * Digital Workers schema (docs/plans/digital-workers.md §5).
+ *
+ * Tables:
+ *   workers           — a named worker: role instructions, engine, run policy,
+ *                       autonomy, MCP server set. mcp_servers holds refs or
+ *                       inline definitions with env-var NAMES only — never
+ *                       secret values.
+ *   worker_goals      — goals/projects a worker pursues; optional link to a
+ *                       Backlog.md project path.
+ *   worker_runs       — one row per run (any trigger), with status, summary,
+ *                       and engine usage.
+ *   worker_run_events — append-only, engine-neutral event stream per run.
+ *
+ * Plain CommonJS so the production image runs migrations without a TS step.
+ *
+ * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
+ */
+exports.shorthands = undefined;
+
+/**
+ * @param {import('node-pg-migrate').MigrationBuilder} pgm
+ */
+exports.up = (pgm) => {
+  pgm.createTable("workers", {
+    id: { type: "uuid", primaryKey: true },
+    slug: { type: "text", notNull: true, unique: true },
+    name: { type: "text", notNull: true },
+    role: { type: "text", notNull: true, default: "custom" },
+    description: { type: "text", notNull: true, default: "" },
+    instructions: { type: "text", notNull: true, default: "" },
+    engine: { type: "text", notNull: true, default: "claude-cli" },
+    model: { type: "text" },
+    run_mode: { type: "text", notNull: true, default: "adhoc" },
+    cron: { type: "text" },
+    cooldown_seconds: { type: "integer", notNull: true, default: 900 },
+    max_runs_per_day: { type: "integer", notNull: true, default: 24 },
+    timeout_seconds: { type: "integer", notNull: true, default: 900 },
+    autonomy: { type: "text", notNull: true, default: "propose" },
+    executor: { type: "text", notNull: true, default: "auto" },
+    working_dir: { type: "text" },
+    mcp_servers: {
+      type: "jsonb",
+      notNull: true,
+      default: pgm.func("'[]'::jsonb"),
+    },
+    enabled: { type: "boolean", notNull: true, default: false },
+    paused_reason: { type: "text" },
+    created_by: { type: "text" },
+    created_at: {
+      type: "timestamptz",
+      notNull: true,
+      default: pgm.func("now()"),
+    },
+    updated_at: {
+      type: "timestamptz",
+      notNull: true,
+      default: pgm.func("now()"),
+    },
+  });
+  pgm.addConstraint("workers", "workers_engine_check", {
+    check: "engine IN ('claude-cli','codex-cli','agent-sdk')",
+  });
+  pgm.addConstraint("workers", "workers_run_mode_check", {
+    check: "run_mode IN ('schedule','adhoc','continuous')",
+  });
+  pgm.addConstraint("workers", "workers_autonomy_check", {
+    check: "autonomy IN ('observe','propose','act')",
+  });
+  pgm.addConstraint("workers", "workers_executor_check", {
+    check: "executor IN ('auto','host','container')",
+  });
+
+  pgm.createTable("worker_goals", {
+    id: { type: "uuid", primaryKey: true },
+    worker_id: {
+      type: "uuid",
+      notNull: true,
+      references: "workers(id)",
+      onDelete: "CASCADE",
+    },
+    title: { type: "text", notNull: true },
+    description: { type: "text", notNull: true, default: "" },
+    project_ref: { type: "text" },
+    success_criteria: { type: "text", notNull: true, default: "" },
+    status: { type: "text", notNull: true, default: "active" },
+    priority: { type: "integer", notNull: true, default: 0 },
+    created_at: {
+      type: "timestamptz",
+      notNull: true,
+      default: pgm.func("now()"),
+    },
+    updated_at: {
+      type: "timestamptz",
+      notNull: true,
+      default: pgm.func("now()"),
+    },
+  });
+  pgm.addConstraint("worker_goals", "worker_goals_status_check", {
+    check: "status IN ('active','done','dropped')",
+  });
+  pgm.createIndex("worker_goals", ["worker_id", "status"]);
+
+  pgm.createTable("worker_runs", {
+    id: { type: "uuid", primaryKey: true },
+    worker_id: {
+      type: "uuid",
+      notNull: true,
+      references: "workers(id)",
+      onDelete: "CASCADE",
+    },
+    trigger: { type: "text", notNull: true },
+    input: { type: "text", notNull: true, default: "" },
+    status: { type: "text", notNull: true, default: "queued" },
+    engine: { type: "text", notNull: true },
+    queued_at: {
+      type: "timestamptz",
+      notNull: true,
+      default: pgm.func("now()"),
+    },
+    started_at: { type: "timestamptz" },
+    finished_at: { type: "timestamptz" },
+    summary: { type: "text" },
+    error: { type: "text" },
+    usage: { type: "jsonb", notNull: true, default: pgm.func("'{}'::jsonb") },
+    requested_by: { type: "text" },
+    // Where the run executes: "container:<name>" or "host:<pgid>". Used to
+    // stop orphaned executions when a new scheduler leader takes over.
+    executor_ref: { type: "text" },
+    // Set by any instance; the executing leader aborts the run on its next tick.
+    cancel_requested: { type: "boolean", notNull: true, default: false },
+  });
+  pgm.addConstraint("worker_runs", "worker_runs_status_check", {
+    check:
+      "status IN ('queued','running','succeeded','failed','cancelled','timeout')",
+  });
+  pgm.addConstraint("worker_runs", "worker_runs_trigger_check", {
+    check: "trigger IN ('schedule','adhoc','continuous','cli','voice')",
+  });
+  pgm.createIndex("worker_runs", [
+    "worker_id",
+    { name: "queued_at", sort: "DESC" },
+  ]);
+  // At most one queued/running run per worker, enforced by the database.
+  pgm.sql(
+    "CREATE UNIQUE INDEX worker_runs_one_active_idx ON worker_runs (worker_id) WHERE status IN ('queued','running')",
+  );
+
+  pgm.createTable("worker_run_events", {
+    id: { type: "bigserial", primaryKey: true },
+    run_id: {
+      type: "uuid",
+      notNull: true,
+      references: "worker_runs(id)",
+      onDelete: "CASCADE",
+    },
+    seq: { type: "integer", notNull: true },
+    at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
+    type: { type: "text", notNull: true },
+    text: { type: "text" },
+    tool: { type: "text" },
+    data: { type: "jsonb" },
+  });
+  pgm.createIndex("worker_run_events", ["run_id", "seq"], { unique: true });
+};
+
+/**
+ * @param {import('node-pg-migrate').MigrationBuilder} pgm
+ */
+exports.down = (pgm) => {
+  pgm.dropTable("worker_run_events");
+  pgm.dropTable("worker_runs");
+  pgm.dropTable("worker_goals");
+  pgm.dropTable("workers");
+};

hook: PostToolUse
exec
/bin/zsh -lc 'git diff ccab6ec..HEAD -- lib/workers app/api/workers app/workers components/workers migrations/1781568000400_digital-workers.js scripts/workers-cli.ts; git diff origin/main...HEAD -- lib/workers/http.ts lib/workers/service.ts lib/workers/scheduler.ts lib/workers/signals.ts app/api/workers' in /Users/jasonpoley/prj/dx/src/daax-web
 succeeded in 0ms:
diff --git a/lib/workers/cli-runner.ts b/lib/workers/cli-runner.ts
index 82ec4c3..974184a 100644
--- a/lib/workers/cli-runner.ts
+++ b/lib/workers/cli-runner.ts
@@ -824,8 +824,12 @@ export async function runCliEngine(input: CliRunInput): Promise<CliRunResult> {
     } else {
       final = codexAcc.final();
       const last = prepared.lastMessagePath;
-      if (last && existsSync(last)) {
-        const text = readFileSync(last, "utf8").trim();
+      // `last` is a runtime temp file, not a bundled asset: keep Turbopack from tracing the project.
+      if (last && existsSync(/*turbopackIgnore: true*/ last)) {
+        const text = readFileSync(
+          /*turbopackIgnore: true*/ last,
+          "utf8",
+        ).trim();
         if (text) final = { ...final, summary: text };
       }
       if (exitCode !== 0 || !final.ok) {
diff --git a/app/api/workers/[id]/goals/[goalId]/route.ts b/app/api/workers/[id]/goals/[goalId]/route.ts
new file mode 100644
index 0000000..e52cb0e
--- /dev/null
+++ b/app/api/workers/[id]/goals/[goalId]/route.ts
@@ -0,0 +1,55 @@
+/**
+ * /api/workers/[id]/goals/[goalId] — update or delete a goal.
+ *
+ * PATCH/DELETE: requireRole("workers:manage").
+ */
+
+import { NextResponse } from "next/server";
+import { requireRole } from "@/lib/auth";
+import {
+  dbUnavailable,
+  jsonError,
+  readJson,
+  serverError,
+} from "@/lib/workers/http";
+import { deleteGoal, getWorker, updateGoal } from "@/lib/workers/store";
+import { parseGoal } from "@/lib/workers/validation";
+
+type Ctx = { params: Promise<{ id: string; goalId: string }> };
+const ROUTE = "/api/workers/[id]/goals/[goalId]";
+
+export async function PATCH(request: Request, { params }: Ctx) {
+  const auth = await requireRole("workers:manage", { route: ROUTE });
+  if (!auth.authorized) return auth.response;
+  const unavailable = dbUnavailable();
+  if (unavailable) return unavailable;
+  const { id, goalId } = await params;
+  const parsed = parseGoal(await readJson(request), true);
+  if (!parsed.ok) return jsonError(400, parsed.error);
+  try {
+    const worker = await getWorker(id);
+    if (!worker) return jsonError(404, "Worker not found");
+    const goal = await updateGoal(worker.id, goalId, parsed.value);
+    if (!goal) return jsonError(404, "Goal not found");
+    return NextResponse.json({ goal });
+  } catch (err) {
+    return serverError("update goal", err);
+  }
+}
+
+export async function DELETE(_request: Request, { params }: Ctx) {
+  const auth = await requireRole("workers:manage", { route: ROUTE });
+  if (!auth.authorized) return auth.response;
+  const unavailable = dbUnavailable();
+  if (unavailable) return unavailable;
+  const { id, goalId } = await params;
+  try {
+    const worker = await getWorker(id);
+    if (!worker) return jsonError(404, "Worker not found");
+    if (!(await deleteGoal(worker.id, goalId)))
+      return jsonError(404, "Goal not found");
+    return NextResponse.json({ deleted: true });
+  } catch (err) {
+    return serverError("delete goal", err);
+  }
+}
diff --git a/app/api/workers/[id]/goals/route.ts b/app/api/workers/[id]/goals/route.ts
new file mode 100644
index 0000000..7dff638
--- /dev/null
+++ b/app/api/workers/[id]/goals/route.ts
@@ -0,0 +1,58 @@
+/**
+ * /api/workers/[id]/goals — list and add goals.
+ *
+ * GET: requireAuth. POST: requireRole("workers:manage").
+ */
+
+import { NextResponse } from "next/server";
+import { requireAuth, requireRole } from "@/lib/auth";
+import {
+  dbUnavailable,
+  jsonError,
+  readJson,
+  serverError,
+} from "@/lib/workers/http";
+import {
+  createGoal,
+  getWorker,
+  listGoals,
+  type GoalInput,
+} from "@/lib/workers/store";
+import { parseGoal } from "@/lib/workers/validation";
+
+type Ctx = { params: Promise<{ id: string }> };
+
+export async function GET(_request: Request, { params }: Ctx) {
+  const auth = await requireAuth();
+  if (!auth.authenticated) return auth.response;
+  const unavailable = dbUnavailable();
+  if (unavailable) return unavailable;
+  const { id } = await params;
+  try {
+    const worker = await getWorker(id);
+    if (!worker) return jsonError(404, "Worker not found");
+    return NextResponse.json({ goals: await listGoals(worker.id) });
+  } catch (err) {
+    return serverError("list goals", err);
+  }
+}
+
+export async function POST(request: Request, { params }: Ctx) {
+  const auth = await requireRole("workers:manage", {
+    route: "/api/workers/[id]/goals",
+  });
+  if (!auth.authorized) return auth.response;
+  const unavailable = dbUnavailable();
+  if (unavailable) return unavailable;
+  const { id } = await params;
+  const parsed = parseGoal(await readJson(request), false);
+  if (!parsed.ok) return jsonError(400, parsed.error);
+  try {
+    const worker = await getWorker(id);
+    if (!worker) return jsonError(404, "Worker not found");
+    const goal = await createGoal(worker.id, parsed.value as GoalInput);
+    return NextResponse.json({ goal }, { status: 201 });
+  } catch (err) {
+    return serverError("create goal", err);
+  }
+}
diff --git a/app/api/workers/[id]/route.ts b/app/api/workers/[id]/route.ts
new file mode 100644
index 0000000..9c79e5b
--- /dev/null
+++ b/app/api/workers/[id]/route.ts
@@ -0,0 +1,94 @@
+/**
+ * /api/workers/[id] — worker detail (id or slug), update, delete.
+ *
+ * GET: requireAuth. PATCH/DELETE: requireRole("workers:manage").
+ */
+
+import { NextResponse } from "next/server";
+import { requireAuth, requireRole } from "@/lib/auth";
+import {
+  dbUnavailable,
+  jsonError,
+  readJson,
+  serverError,
+} from "@/lib/workers/http";
+import { getWorkerSummary } from "@/lib/workers/service";
+import {
+  deleteWorkerIfIdle,
+  getWorker,
+  latestBrief,
+  listGoals,
+  updateWorker,
+} from "@/lib/workers/store";
+import { checkRunPolicy, parseWorkerPatch } from "@/lib/workers/validation";
+
+type Ctx = { params: Promise<{ id: string }> };
+const ROUTE = "/api/workers/[id]";
+
+export async function GET(_request: Request, { params }: Ctx) {
+  const auth = await requireAuth();
+  if (!auth.authenticated) return auth.response;
+  const unavailable = dbUnavailable();
+  if (unavailable) return unavailable;
+  const { id } = await params;
+  try {
+    const worker = await getWorkerSummary(id);
+    if (!worker) return jsonError(404, "Worker not found");
+    const [goals, brief] = await Promise.all([
+      listGoals(worker.id),
+      latestBrief(worker.id),
+    ]);
+    return NextResponse.json({ worker, goals, brief });
+  } catch (err) {
+    return serverError("load worker", err);
+  }
+}
+
+export async function PATCH(request: Request, { params }: Ctx) {
+  const auth = await requireRole("workers:manage", { route: ROUTE });
+  if (!auth.authorized) return auth.response;
+  const unavailable = dbUnavailable();
+  if (unavailable) return unavailable;
+  const { id } = await params;
+
+  const parsed = parseWorkerPatch(await readJson(request));
+  if (!parsed.ok) return jsonError(400, parsed.error);
+  try {
+    const current = await getWorker(id);
+    if (!current) return jsonError(404, "Worker not found");
+    const merged = { ...current, ...parsed.value };
+    const policyError = checkRunPolicy(merged);
+    if (policyError) return jsonError(400, policyError);
+    // Re-enabling clears the auto-pause reason.
+    const patch =
+      parsed.value.enabled === true
+        ? { ...parsed.value, pausedReason: null }
+        : parsed.value;
+    const worker = await updateWorker(current.id, patch);
+    return NextResponse.json({ worker });
+  } catch (err) {
+    return serverError("update worker", err);
+  }
+}
+
+export async function DELETE(_request: Request, { params }: Ctx) {
+  const auth = await requireRole("workers:manage", { route: ROUTE });
+  if (!auth.authorized) return auth.response;
+  const unavailable = dbUnavailable();
+  if (unavailable) return unavailable;
+  const { id } = await params;
+  try {
+    const worker = await getWorker(id);
+    if (!worker) return jsonError(404, "Worker not found");
+    // Deleting would cascade away the run and its cancel handle while the
+    // agent keeps executing: cancel first, then delete. Atomic with enqueue.
+    const outcome = await deleteWorkerIfIdle(worker.id);
+    if (outcome === "active") {
+      return jsonError(409, "Worker has a run in progress; cancel it first");
+    }
+    if (outcome === "missing") return jsonError(404, "Worker not found");
+    return NextResponse.json({ deleted: true });
+  } catch (err) {
+    return serverError("delete worker", err);
+  }
+}
diff --git a/app/api/workers/[id]/runs/route.ts b/app/api/workers/[id]/runs/route.ts
new file mode 100644
index 0000000..be277bb
--- /dev/null
+++ b/app/api/workers/[id]/runs/route.ts
@@ -0,0 +1,71 @@
+/**
+ * /api/workers/[id]/runs — run history, and queue an ad hoc run / question.
+ *
+ * GET: requireAuth. POST: requireRole("workers:run").
+ * POST answers 202 with the queued run; the scheduler leader executes it.
+ */
+
+import { NextResponse } from "next/server";
+import { requireAuth, requireRole } from "@/lib/auth";
+import {
+  dbUnavailable,
+  jsonError,
+  readJson,
+  serverError,
+} from "@/lib/workers/http";
+import { getScheduler } from "@/lib/workers/scheduler";
+import {
+  RunConflictError,
+  createRun,
+  getWorker,
+  listRuns,
+} from "@/lib/workers/store";
+import { parseRunRequest } from "@/lib/workers/validation";
+
+type Ctx = { params: Promise<{ id: string }> };
+
+export async function GET(request: Request, { params }: Ctx) {
+  const auth = await requireAuth();
+  if (!auth.authenticated) return auth.response;
+  const unavailable = dbUnavailable();
+  if (unavailable) return unavailable;
+  const { id } = await params;
+  const raw = Number(new URL(request.url).searchParams.get("limit") ?? 20);
+  const limit = Number.isInteger(raw) && raw > 0 ? Math.min(raw, 100) : 20;
+  try {
+    const worker = await getWorker(id);
+    if (!worker) return jsonError(404, "Worker not found");
+    return NextResponse.json({ runs: await listRuns(worker.id, limit) });
+  } catch (err) {
+    return serverError("list runs", err);
+  }
+}
+
+export async function POST(request: Request, { params }: Ctx) {
+  const auth = await requireRole("workers:run", {
+    route: "/api/workers/[id]/runs",
+  });
+  if (!auth.authorized) return auth.response;
+  const unavailable = dbUnavailable();
+  if (unavailable) return unavailable;
+  const { id } = await params;
+  const parsed = parseRunRequest(await readJson(request));
+  if (!parsed.ok) return jsonError(400, parsed.error);
+  try {
+    const worker = await getWorker(id);
+    if (!worker) return jsonError(404, "Worker not found");
+    const run = await createRun(
+      worker,
+      parsed.value.trigger,
+      parsed.value.input,
+      auth.user.username ?? null,
+    );
+    getScheduler().kick();
+    return NextResponse.json({ run }, { status: 202 });
+  } catch (err) {
+    if (err instanceof RunConflictError) {
+      return jsonError(409, "Worker already has a run in progress");
+    }
+    return serverError("queue run", err);
+  }
+}
diff --git a/app/api/workers/route.ts b/app/api/workers/route.ts
new file mode 100644
index 0000000..924d67a
--- /dev/null
+++ b/app/api/workers/route.ts
@@ -0,0 +1,78 @@
+/**
+ * /api/workers — list workers, create a worker (from a template or a body).
+ *
+ * GET: requireAuth. POST: requireRole("workers:manage").
+ */
+
+import { NextResponse } from "next/server";
+import { requireAuth, requireRole } from "@/lib/auth";
+import {
+  dbUnavailable,
+  engineAvailability,
+  jsonError,
+  readJson,
+  serverError,
+} from "@/lib/workers/http";
+import { getScheduler } from "@/lib/workers/scheduler";
+import { listWorkerSummaries } from "@/lib/workers/service";
+import { createWorker, getWorker } from "@/lib/workers/store";
+import { WORKER_TEMPLATES } from "@/lib/workers/templates";
+import { parseWorkerCreate } from "@/lib/workers/validation";
+
+const ROUTE = "/api/workers";
+
+export async function GET() {
+  const auth = await requireAuth();
+  if (!auth.authenticated) return auth.response;
+  const unavailable = dbUnavailable();
+  if (unavailable) return unavailable;
+  try {
+    const workers = await listWorkerSummaries();
+    return NextResponse.json({
+      workers,
+      templates: Object.values(WORKER_TEMPLATES).map((t) => ({
+        slug: t.slug,
+        name: t.name,
+        description: t.description,
+      })),
+      engines: engineAvailability(),
+      schedulerLeader: getScheduler().isLeader(),
+    });
+  } catch (err) {
+    return serverError("list workers", err);
+  }
+}
+
+export async function POST(request: Request) {
+  const auth = await requireRole("workers:manage", { route: ROUTE });
+  if (!auth.authorized) return auth.response;
+  const unavailable = dbUnavailable();
+  if (unavailable) return unavailable;
+
+  const body = await readJson(request);
+  const templateId =
+    typeof body === "object" && body !== null && "template" in body
+      ? String((body as { template: unknown }).template)
+      : null;
+  let input: unknown = body;
+  if (templateId) {
+    const template = WORKER_TEMPLATES[templateId];
+    if (!template) return jsonError(400, `Unknown template: ${templateId}`);
+    input = template;
+  }
+  const parsed = parseWorkerCreate(input);
+  if (!parsed.ok) return jsonError(400, parsed.error);
+
+  try {
+    if (await getWorker(parsed.value.slug)) {
+      return jsonError(
+        409,
+        `A worker with slug "${parsed.value.slug}" already exists`,
+      );
+    }
+    const worker = await createWorker(parsed.value, auth.user.username ?? null);
+    return NextResponse.json({ worker }, { status: 201 });
+  } catch (err) {
+    return serverError("create worker", err);
+  }
+}
diff --git a/app/api/workers/runs/[runId]/route.ts b/app/api/workers/runs/[runId]/route.ts
new file mode 100644
index 0000000..0cf7b57
--- /dev/null
+++ b/app/api/workers/runs/[runId]/route.ts
@@ -0,0 +1,86 @@
+/**
+ * /api/workers/runs/[runId] — a run with its event stream, and cancel.
+ *
+ * GET: requireAuth; `?after=<seq>` returns only newer events (polling).
+ * DELETE: requireRole("workers:run") — cancel a queued or running run.
+ */
+
+import { NextResponse } from "next/server";
+import { requireAuth, requireRole } from "@/lib/auth";
+import { dbUnavailable, jsonError, serverError } from "@/lib/workers/http";
+import { getScheduler } from "@/lib/workers/scheduler";
+import { failRunningRun, getRun, listRunEvents } from "@/lib/workers/store";
+import { TERMINAL_RUN_STATUSES, UUID_RE } from "@/types/workers";
+
+type Ctx = { params: Promise<{ runId: string }> };
+const EVENTS_PAGE = 500;
+
+export async function GET(request: Request, { params }: Ctx) {
+  const auth = await requireAuth();
+  if (!auth.authenticated) return auth.response;
+  const unavailable = dbUnavailable();
+  if (unavailable) return unavailable;
+  const { runId } = await params;
+  if (!UUID_RE.test(runId)) return jsonError(400, "Invalid run id");
+  const rawAfter = Number(new URL(request.url).searchParams.get("after") ?? -1);
+  const after = Number.isInteger(rawAfter) && rawAfter >= -1 ? rawAfter : -1;
+  try {
+    const run = await getRun(runId);
+    if (!run) return jsonError(404, "Run not found");
+    const events = await listRunEvents(runId, after, EVENTS_PAGE);
+    // hasMore: a full page came back; clients keep paging (with ?after=)
+    // until it is false, even after the run is terminal.
+    return NextResponse.json({
+      run,
+      events,
+      hasMore: events.length === EVENTS_PAGE,
+    });
+  } catch (err) {
+    return serverError("load run", err);
+  }
+}
+
+/**
+ * DELETE cancels a run (workers:run). With `?force=1` (workers:manage) it
+ * force-releases a run that recovery keeps locked because its execution
+ * could not be proven stopped — for the operator to use once they have
+ * confirmed nothing is still running.
+ */
+export async function DELETE(request: Request, { params }: Ctx) {
+  const force = new URL(request.url).searchParams.get("force") === "1";
+  const auth = await requireRole(force ? "workers:manage" : "workers:run", {
+    route: "/api/workers/runs/[runId]",
+  });
+  if (!auth.authorized) return auth.response;
+  const unavailable = dbUnavailable();
+  if (unavailable) return unavailable;
+  const { runId } = await params;
+  if (!UUID_RE.test(runId)) return jsonError(400, "Invalid run id");
+  try {
+    const run = await getRun(runId);
+    if (!run) return jsonError(404, "Run not found");
+    if (TERMINAL_RUN_STATUSES.includes(run.status)) {
+      return jsonError(409, `Run already ${run.status}`);
+    }
+    const scheduler = getScheduler();
+    if (force) {
+      if (scheduler.isExecuting(runId)) {
+        return jsonError(
+          409,
+          "Run is executing on this instance; cancel it instead",
+        );
+      }
+      const released = await failRunningRun(
+        runId,
+        `force-released by ${auth.user.username ?? "operator"}`,
+      );
+      if (!released) return jsonError(409, "Run is not running");
+      return NextResponse.json({ released: true });
+    }
+    const cancelled = await scheduler.cancel(runId);
+    if (!cancelled) return jsonError(409, "Run is no longer active");
+    return NextResponse.json({ cancelled: true });
+  } catch (err) {
+    return serverError("cancel run", err);
+  }
+}
diff --git a/lib/workers/http.ts b/lib/workers/http.ts
new file mode 100644
index 0000000..68701a7
--- /dev/null
+++ b/lib/workers/http.ts
@@ -0,0 +1,92 @@
+/**
+ * Shared helpers for the /api/workers routes.
+ */
+
+import { spawnSync } from "node:child_process";
+import { NextResponse } from "next/server";
+import { isDbConfigured } from "@/lib/db/config";
+import { agentSdkAvailable } from "./sdk-runner";
+import { resolveExecutor } from "./cli-runner";
+import type { WorkerEngine } from "@/types/workers";
+
+export function jsonError(status: number, error: string, message?: string) {
+  return NextResponse.json(message ? { error, message } : { error }, {
+    status,
+  });
+}
+
+/** Workers need Postgres; without it every route answers 503. */
+export function dbUnavailable(): NextResponse | null {
+  return isDbConfigured()
+    ? null
+    : jsonError(
+        503,
+        "Postgres not configured",
+        "Digital workers need DATABASE_URL (or PG* variables).",
+      );
+}
+
+export async function readJson(request: Request): Promise<unknown> {
+  try {
+    return await request.json();
+  } catch {
+    return undefined;
+  }
+}
+
+export function serverError(context: string, err: unknown) {
+  console.error(
+    `[workers] ${context}:`,
+    err instanceof Error ? err.message : err,
+  );
+  return jsonError(500, `Failed to ${context}`);
+}
+
+let cliCache: { at: number; value: Record<string, boolean> } | null = null;
+
+function onPath(bin: string): boolean {
+  return (
+    spawnSync("sh", ["-c", `command -v ${bin}`], { stdio: "ignore" }).status ===
+    0
+  );
+}
+
+/**
+ * Which engines can run here. CLI engines in container mode run inside the
+ * agent image, so they are available whenever Docker is; on the host they
+ * need the CLI on PATH. Cached for a minute.
+ */
+export function engineAvailability(): Record<
+  WorkerEngine,
+  { available: boolean; note: string }
+> {
+  const now = Date.now();
+  if (!cliCache || now - cliCache.at > 60_000) {
+    const container = resolveExecutor("auto") === "container";
+    cliCache = {
+      at: now,
+      value: {
+        claude: container ? onPath("docker") : onPath("claude"),
+        codex: container ? onPath("docker") : onPath("codex"),
+      },
+    };
+  }
+  const where =
+    resolveExecutor("auto") === "container" ? "agent container" : "host";
+  return {
+    "claude-cli": {
+      available: cliCache.value.claude,
+      note: `claude -p (${where}, subscription login)`,
+    },
+    "codex-cli": {
+      available: cliCache.value.codex,
+      note: `codex exec (${where}, subscription login)`,
+    },
+    "agent-sdk": {
+      available: agentSdkAvailable(),
+      note: agentSdkAvailable()
+        ? "Claude Agent SDK (ANTHROPIC_API_KEY, metered)"
+        : "Claude Agent SDK — set ANTHROPIC_API_KEY to enable",
+    },
+  };
+}
diff --git a/lib/workers/scheduler.ts b/lib/workers/scheduler.ts
new file mode 100644
index 0000000..608bc18
--- /dev/null
+++ b/lib/workers/scheduler.ts
@@ -0,0 +1,374 @@
+/**
+ * Worker scheduler (docs/plans/digital-workers.md §4.1, §4.5).
+ *
+ * Started once per web process from instrumentation.ts. Exactly one process
+ * leads, chosen with a session-level Postgres advisory lock held on a
+ * dedicated connection; only the leader creates automatic runs and executes
+ * queued runs. API handlers only queue runs, so every instance can accept
+ * requests while execution stays single-leader.
+ */
+
+import { Cron } from "croner";
+import type { PoolClient } from "pg";
+import { getClient } from "@/lib/db/pg";
+import {
+  removeLabelledContainers,
+  resolveExecutor,
+  stopExecutionAndWait,
+  stopHostRunAndWait,
+} from "./cli-runner";
+import { executeRun } from "./runner";
+import {
+  RunConflictError,
+  cancelQueuedRun,
+  cancelRequestedAmong,
+  countAutomaticRunsSince,
+  createRun,
+  failRunningRun,
+  lastRunsByWorker,
+  listQueuedRuns,
+  listRunningRuns,
+  listWorkers,
+  pruneRuns,
+  requestCancel,
+} from "./store";
+import type { Worker, WorkerRun } from "@/types/workers";
+
+/** Advisory lock key: "daaxwork" as a 64-bit integer. */
+const LEADER_LOCK_KEY = "7233451377399509611";
+const TICK_MS = 5_000;
+const TRIGGER_EVERY_MS = 30_000;
+const PRUNE_EVERY_MS = 60 * 60 * 1000;
+
+function maxConcurrent(): number {
+  const n = Number(process.env.WORKERS_MAX_CONCURRENT);
+  return Number.isInteger(n) && n > 0 ? n : 2;
+}
+
+function retentionDays(): number {
+  const n = Number(process.env.WORKERS_RETENTION_DAYS);
+  return Number.isInteger(n) && n > 0 ? n : 30;
+}
+
+/** Next cron fire time strictly after `after` (UTC), or null. */
+export function nextCronRun(expr: string, after: Date): Date | null {
+  try {
+    return new Cron(expr, { timezone: "UTC", paused: true }).nextRun(after);
+  } catch {
+    return null;
+  }
+}
+
+/**
+ * Decide whether an automatic run is due. Pure, so it is unit-tested apart
+ * from the database and timers.
+ */
+export function automaticTriggerDue(
+  worker: Pick<Worker, "enabled" | "runMode" | "cron" | "cooldownSeconds">,
+  lastRun: Pick<WorkerRun, "status" | "finishedAt" | "queuedAt"> | null,
+  lastEvaluated: Date,
+  now: Date,
+): boolean {
+  if (!worker.enabled) return false;
+  if (lastRun && (lastRun.status === "queued" || lastRun.status === "running"))
+    return false;
+  if (worker.runMode === "schedule") {
+    if (!worker.cron) return false;
+    const next = nextCronRun(worker.cron, lastEvaluated);
+    return next !== null && next.getTime() <= now.getTime();
+  }
+  if (worker.runMode === "continuous") {
+    if (!lastRun) return true;
+    const since = new Date(lastRun.finishedAt ?? lastRun.queuedAt).getTime();
+    return now.getTime() - since >= worker.cooldownSeconds * 1000;
+  }
+  return false;
+}
+
+/** When the worker will next run automatically (for display). */
+export function nextRunAt(
+  worker: Pick<Worker, "enabled" | "runMode" | "cron" | "cooldownSeconds">,
+  lastRun: Pick<WorkerRun, "status" | "finishedAt" | "queuedAt"> | null,
+  now: Date,
+): string | null {
+  if (!worker.enabled) return null;
+  if (worker.runMode === "schedule" && worker.cron) {
+    return nextCronRun(worker.cron, now)?.toISOString() ?? null;
+  }
+  if (worker.runMode === "continuous") {
+    if (!lastRun) return now.toISOString();
+    if (lastRun.status === "queued" || lastRun.status === "running")
+      return null;
+    const since = new Date(lastRun.finishedAt ?? lastRun.queuedAt).getTime();
+    return new Date(since + worker.cooldownSeconds * 1000).toISOString();
+  }
+  return null;
+}
+
+export class WorkerScheduler {
+  private timer: NodeJS.Timeout | null = null;
+  private lockClient: PoolClient | null = null;
+  private leader = false;
+  private ticking = false;
+  private lastTriggerCheck = 0;
+  private lastPrune = 0;
+  /** Per-worker schedule cursor: fires in (cursor, now] are due. */
+  private readonly evaluatedAt = new Map<string, Date>();
+  private leaderSince = new Date();
+  private readonly inFlight = new Map<string, AbortController>();
+  /** Only a started scheduler leads or executes (WORKERS_SCHEDULER=off). */
+  private started = false;
+
+  start(): void {
+    if (this.timer) return;
+    this.started = true;
+    this.timer = setInterval(() => void this.tick(), TICK_MS);
+    this.timer.unref();
+    void this.tick();
+  }
+
+  async stop(): Promise<void> {
+    this.started = false;
+    if (this.timer) clearInterval(this.timer);
+    this.timer = null;
+    this.abortAll();
+    await this.releaseLeadership();
+  }
+
+  isLeader(): boolean {
+    return this.leader;
+  }
+
+  /** Is this instance executing the run right now? */
+  isExecuting(runId: string): boolean {
+    return this.inFlight.has(runId);
+  }
+
+  /** Execute queued runs now instead of waiting for the next tick. */
+  kick(): void {
+    if (this.started) void this.tick();
+  }
+
+  /**
+   * Cancel a run from any instance. Queued → cancelled immediately; running
+   * here → aborted; running on another instance → a persisted request that
+   * the executing leader acts on within one tick. False if nothing to cancel.
+   */
+  async cancel(runId: string): Promise<boolean> {
+    const controller = this.inFlight.get(runId);
+    if (controller) {
+      controller.abort();
+      return true;
+    }
+    if ((await cancelQueuedRun(runId)) !== null) return true;
+    return requestCancel(runId);
+  }
+
+  private abortAll(): void {
+    for (const c of this.inFlight.values()) c.abort();
+  }
+
+  /** Lost the lock: stop executing, so the next leader never runs a duplicate. */
+  private loseLeadership(reason: string): void {
+    if (!this.leader && !this.lockClient) return;
+    console.error(
+      `[workers] scheduler leadership lost (${reason}); aborting in-flight runs`,
+    );
+    this.leader = false;
+    this.lockClient = null;
+    this.abortAll();
+  }
+
+  /**
+   * Stop whatever a dead leader left running before its runs are marked
+   * failed, so a worker never has two executions at once.
+   */
+  /**
+   * Release runs marked running that this leader is not executing — left by
+   * a dead leader, or kept after a failed cleanup — but only once their
+   * execution is verified stopped. Unverifiable ones stay running (so the
+   * worker cannot start a second execution) and are retried every tick.
+   */
+  private async reconcile(): Promise<number> {
+    let released = 0;
+    for (const r of await listRunningRuns()) {
+      if (this.inFlight.has(r.id)) continue;
+      const ref = r.executorRef;
+      try {
+        if (ref?.startsWith("container:")) await stopExecutionAndWait(ref);
+        else if (ref?.startsWith("host:")) await stopHostRunAndWait(r.id, ref);
+        // No ref: the executor reference is written before any spawn, so
+        // this run never started an execution.
+      } catch (err) {
+        console.error(
+          `[workers] run ${r.id}: cleanup not verified, keeping it active:`,
+          (err as Error).message,
+        );
+        continue;
+      }
+      if (
+        await failRunningRun(
+          r.id,
+          "interrupted: execution was stopped by the scheduler",
+        )
+      ) {
+        released++;
+      }
+    }
+    return released;
+  }
+
+  private async acquireLeadership(): Promise<void> {
+    const client = await getClient();
+    let locked = false;
+    try {
+      const res = await client.query<{ ok: boolean }>(
+        "SELECT pg_try_advisory_lock($1::bigint) AS ok",
+        [LEADER_LOCK_KEY],
+      );
+      locked = res.rows[0]?.ok === true;
+      if (!locked) {
+        client.release();
+        return;
+      }
+      // Leadership is published only after recovery succeeds. Labelled
+      // containers can only belong to a previous leader at this point.
+      if (resolveExecutor("auto") === "container") removeLabelledContainers();
+      const failed = await this.reconcile();
+      client.on("error", () => this.loseLeadership("lock connection error"));
+      this.lockClient = client;
+      this.leader = true;
+      this.leaderSince = new Date();
+      this.evaluatedAt.clear();
+      console.log(
+        `[workers] scheduler leadership acquired${failed ? ` (${failed} interrupted run(s) marked failed)` : ""}`,
+      );
+    } catch (err) {
+      if (locked) {
+        await client
+          .query("SELECT pg_advisory_unlock($1::bigint)", [LEADER_LOCK_KEY])
+          .catch(() => undefined);
+      }
+      // Destroy rather than return a possibly lock-holding session to the pool.
+      client.release(err instanceof Error ? err : true);
+      throw err;
+    }
+  }
+
+  private async releaseLeadership(): Promise<void> {
+    const client = this.lockClient;
+    this.leader = false;
+    this.lockClient = null;
+    if (!client) return;
+    try {
+      await client.query("SELECT pg_advisory_unlock($1::bigint)", [
+        LEADER_LOCK_KEY,
+      ]);
+    } finally {
+      client.release();
+    }
+  }
+
+  private async tick(): Promise<void> {
+    if (this.ticking || !this.started) return;
+    this.ticking = true;
+    try {
+      const wasLeader = this.leader;
+      if (!wasLeader) await this.acquireLeadership();
+      if (!this.leader) return;
+      await this.applyCancelRequests();
+      // Acquisition already reconciled; afterwards, every tick retries.
+      if (wasLeader) await this.reconcile();
+      const now = Date.now();
+      if (now - this.lastTriggerCheck >= TRIGGER_EVERY_MS) {
+        this.lastTriggerCheck = now;
+        await this.createDueRuns(new Date(now));
+      }
+      await this.dispatchQueued();
+      if (now - this.lastPrune >= PRUNE_EVERY_MS) {
+        this.lastPrune = now;
+        const n = await pruneRuns(retentionDays());
+        if (n)
+          console.log(
+            `[workers] pruned ${n} run(s) older than ${retentionDays()} days`,
+          );
+      }
+    } catch (err) {
+      console.error("[workers] scheduler tick failed:", (err as Error).message);
+    } finally {
+      this.ticking = false;
+    }
+  }
+
+  private async applyCancelRequests(): Promise<void> {
+    const ids = await cancelRequestedAmong([...this.inFlight.keys()]);
+    for (const id of ids) this.inFlight.get(id)?.abort();
+  }
+
+  private async createDueRuns(now: Date): Promise<void> {
+    const [workers, lastRuns] = await Promise.all([
+      listWorkers(),
+      lastRunsByWorker(),
+    ]);
+    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
+    for (const worker of workers) {
+      // Missed fires while daax was down (or before this leader) are not
+      // back-filled: each worker's cursor starts at leadership.
+      const since = this.evaluatedAt.get(worker.id) ?? this.leaderSince;
+      const last = lastRuns.get(worker.id) ?? null;
+      try {
+        if (!automaticTriggerDue(worker, last, since, now)) continue;
+        const count = await countAutomaticRunsSince(worker.id, dayAgo);
+        if (count >= worker.maxRunsPerDay) continue;
+        const trigger =
+          worker.runMode === "schedule" ? "schedule" : "continuous";
+        await createRun(worker, trigger, "", "scheduler");
+      } catch (err) {
+        if (!(err instanceof RunConflictError)) {
+          // Leave this worker's cursor where it was; retry next pass.
+          console.error(
+            `[workers] trigger check failed for ${worker.slug}:`,
+            (err as Error).message,
+          );
+          continue;
+        }
+      }
+      this.evaluatedAt.set(worker.id, now);
+    }
+  }
+
+  private async dispatchQueued(): Promise<void> {
+    const free = maxConcurrent() - this.inFlight.size;
+    if (free <= 0) return;
+    const queued = await listQueuedRuns(free + this.inFlight.size);
+    for (const run of queued) {
+      if (!this.leader || this.inFlight.size >= maxConcurrent()) break;
+      if (this.inFlight.has(run.id)) continue;
+      const controller = new AbortController();
+      this.inFlight.set(run.id, controller);
+      void executeRun(run.id, controller.signal)
+        .catch((err) =>
+          console.error(
+            `[workers] run ${run.id} crashed:`,
+            (err as Error).message,
+          ),
+        )
+        .finally(() => {
+          this.inFlight.delete(run.id);
+          this.kick();
+        });
+    }
+  }
+}
+
+const GLOBAL_KEY = Symbol.for("daax.workers.scheduler");
+type GlobalWithScheduler = typeof globalThis & {
+  [GLOBAL_KEY]?: WorkerScheduler;
+};
+
+/** The process-wide scheduler (survives dev hot reloads). */
+export function getScheduler(): WorkerScheduler {
+  const g = globalThis as GlobalWithScheduler;
+  if (!g[GLOBAL_KEY]) g[GLOBAL_KEY] = new WorkerScheduler();
+  return g[GLOBAL_KEY]!;
+}
diff --git a/lib/workers/service.ts b/lib/workers/service.ts
new file mode 100644
index 0000000..73167bf
--- /dev/null
+++ b/lib/workers/service.ts
@@ -0,0 +1,70 @@
+/**
+ * Read models for the API: workers with derived state (running, paused,
+ * failing), last run, next automatic run, and active goal count.
+ */
+
+import { query } from "@/lib/db/pg";
+import { nextRunAt } from "./scheduler";
+import { getWorker, lastRunsByWorker, listRuns, listWorkers } from "./store";
+import type { Worker, WorkerRun, WorkerSummary } from "@/types/workers";
+
+export function deriveState(
+  worker: Worker,
+  lastRun: WorkerRun | null,
+): WorkerSummary["state"] {
+  if (lastRun && (lastRun.status === "queued" || lastRun.status === "running"))
+    return "running";
+  if (!worker.enabled && worker.pausedReason) return "paused";
+  if (lastRun && (lastRun.status === "failed" || lastRun.status === "timeout"))
+    return "failing";
+  if (!worker.enabled && worker.runMode !== "adhoc") return "paused";
+  return "idle";
+}
+
+async function activeGoalCounts(): Promise<Map<string, number>> {
+  const res = await query<{ worker_id: string; n: string }>(
+    "SELECT worker_id, count(*) AS n FROM worker_goals WHERE status = 'active' GROUP BY worker_id",
+  );
+  return new Map(res.rows.map((r) => [r.worker_id, Number(r.n)]));
+}
+
+function summarize(
+  worker: Worker,
+  lastRun: WorkerRun | null,
+  goals: number,
+  now: Date,
+): WorkerSummary {
+  return {
+    ...worker,
+    state: deriveState(worker, lastRun),
+    lastRun,
+    nextRunAt: nextRunAt(worker, lastRun, now),
+    activeGoals: goals,
+  };
+}
+
+export async function listWorkerSummaries(
+  now = new Date(),
+): Promise<WorkerSummary[]> {
+  const [workers, lastRuns, goals] = await Promise.all([
+    listWorkers(),
+    lastRunsByWorker(),
+    activeGoalCounts(),
+  ]);
+  return workers.map((w) =>
+    summarize(w, lastRuns.get(w.id) ?? null, goals.get(w.id) ?? 0, now),
+  );
+}
+
+export async function getWorkerSummary(
+  idOrSlug: string,
+  now = new Date(),
+): Promise<WorkerSummary | null> {
+  const worker = await getWorker(idOrSlug);
+  if (!worker) return null;
+  const [runs, goals] = await Promise.all([
+    listRuns(worker.id, 1),
+    activeGoalCounts(),
+  ]);
+  return summarize(worker, runs[0] ?? null, goals.get(worker.id) ?? 0, now);
+}
diff --git a/lib/workers/signals.ts b/lib/workers/signals.ts
new file mode 100644
index 0000000..ee815b3
--- /dev/null
+++ b/lib/workers/signals.ts
@@ -0,0 +1,105 @@
+/**
+ * Project signals: git and GitHub state collected by daax itself with fixed,
+ * read-only commands (no shell, argument arrays only), then handed to the
+ * agent in its prompt. The agent gets no shell, so it cannot turn a "read"
+ * command into a write (see plan.ts READ_BUILTINS).
+ */
+
+import { execFile } from "node:child_process";
+
+const SIGNAL_TIMEOUT_MS = 20_000;
+const MAX_SIGNAL_CHARS = 6_000;
+
+interface SignalCommand {
+  label: string;
+  command: string;
+  args: string[];
+}
+
+export const SIGNAL_COMMANDS: readonly SignalCommand[] = [
+  {
+    label: "git status",
+    command: "git",
+    args: ["status", "--short", "--branch"],
+  },
+  {
+    label: "recent commits",
+    command: "git",
+    args: ["log", "-15", "--date=short", "--format=%h %ad %an %s"],
+  },
+  {
+    label: "open pull requests",
+    command: "gh",
+    args: [
+      "pr",
+      "list",
+      "--state",
+      "open",
+      "--limit",
+      "20",
+      "--json",
+      "number,title,headRefName,isDraft,reviewDecision,updatedAt",
+    ],
+  },
+  {
+    label: "recent CI runs",
+    command: "gh",
+    args: [
+      "run",
+      "list",
+      "--limit",
+      "10",
+      "--json",
+      "databaseId,workflowName,status,conclusion,headBranch,createdAt",
+    ],
+  },
+];
+
+function runOne(
+  cmd: SignalCommand,
+  cwd: string,
+  env: Record<string, string>,
+  signal: AbortSignal,
+): Promise<string> {
+  return new Promise((resolve) => {
+    execFile(
+      cmd.command,
+      cmd.args,
+      {
+        cwd,
+        env: env as NodeJS.ProcessEnv,
+        timeout: SIGNAL_TIMEOUT_MS,
+        maxBuffer: 1024 * 1024,
+        signal,
+      },
+      (err, stdout, stderr) => {
+        if (err) {
+          const why = (stderr || err.message).trim().split("\n")[0];
+          resolve(`(unavailable: ${why.slice(0, 200)})`);
+          return;
+        }
+        const out = stdout.trim() || "(none)";
+        resolve(
+          out.length > MAX_SIGNAL_CHARS
+            ? `${out.slice(0, MAX_SIGNAL_CHARS)}… [truncated]`
+            : out,
+        );
+      },
+    );
+  });
+}
+
+/** Collect every signal; failures are reported inline, never thrown. */
+export async function collectSignals(
+  cwd: string,
+  env: Record<string, string>,
+  signal: AbortSignal,
+): Promise<string> {
+  const outputs = await Promise.all(
+    SIGNAL_COMMANDS.map((c) => runOne(c, cwd, env, signal)),
+  );
+  return SIGNAL_COMMANDS.map(
+    (c, i) =>
+      `### ${c.label} (\`${c.command} ${c.args.join(" ")}\`)\n${outputs[i]}`,
+  ).join("\n\n");
+}

hook: PostToolUse
hook: PostToolUse Completed
hook: PostToolUse Completed
codex
The scoped change since the feature commit is limited to the two `turbopackIgnore` annotations. The remaining review is checking the full feature diff and its integration with the merged main branch. Backlog workflow access was denied by the tool’s approval policy; repository review instructions are available locally.
hook: PreToolUse
hook: PreToolUse Completed
exec
/bin/zsh -lc 'cat lib/workers/scheduler.ts lib/workers/service.ts lib/workers/signals.ts' in /Users/jasonpoley/prj/dx/src/daax-web
 succeeded in 0ms:
/**
 * Worker scheduler (docs/plans/digital-workers.md §4.1, §4.5).
 *
 * Started once per web process from instrumentation.ts. Exactly one process
 * leads, chosen with a session-level Postgres advisory lock held on a
 * dedicated connection; only the leader creates automatic runs and executes
 * queued runs. API handlers only queue runs, so every instance can accept
 * requests while execution stays single-leader.
 */

import { Cron } from "croner";
import type { PoolClient } from "pg";
import { getClient } from "@/lib/db/pg";
import {
  removeLabelledContainers,
  resolveExecutor,
  stopExecutionAndWait,
  stopHostRunAndWait,
} from "./cli-runner";
import { executeRun } from "./runner";
import {
  RunConflictError,
  cancelQueuedRun,
  cancelRequestedAmong,
  countAutomaticRunsSince,
  createRun,
  failRunningRun,
  lastRunsByWorker,
  listQueuedRuns,
  listRunningRuns,
  listWorkers,
  pruneRuns,
  requestCancel,
} from "./store";
import type { Worker, WorkerRun } from "@/types/workers";

/** Advisory lock key: "daaxwork" as a 64-bit integer. */
const LEADER_LOCK_KEY = "7233451377399509611";
const TICK_MS = 5_000;
const TRIGGER_EVERY_MS = 30_000;
const PRUNE_EVERY_MS = 60 * 60 * 1000;

function maxConcurrent(): number {
  const n = Number(process.env.WORKERS_MAX_CONCURRENT);
  return Number.isInteger(n) && n > 0 ? n : 2;
}

function retentionDays(): number {
  const n = Number(process.env.WORKERS_RETENTION_DAYS);
  return Number.isInteger(n) && n > 0 ? n : 30;
}

/** Next cron fire time strictly after `after` (UTC), or null. */
export function nextCronRun(expr: string, after: Date): Date | null {
  try {
    return new Cron(expr, { timezone: "UTC", paused: true }).nextRun(after);
  } catch {
    return null;
  }
}

/**
 * Decide whether an automatic run is due. Pure, so it is unit-tested apart
 * from the database and timers.
 */
export function automaticTriggerDue(
  worker: Pick<Worker, "enabled" | "runMode" | "cron" | "cooldownSeconds">,
  lastRun: Pick<WorkerRun, "status" | "finishedAt" | "queuedAt"> | null,
  lastEvaluated: Date,
  now: Date,
): boolean {
  if (!worker.enabled) return false;
  if (lastRun && (lastRun.status === "queued" || lastRun.status === "running"))
    return false;
  if (worker.runMode === "schedule") {
    if (!worker.cron) return false;
    const next = nextCronRun(worker.cron, lastEvaluated);
    return next !== null && next.getTime() <= now.getTime();
  }
  if (worker.runMode === "continuous") {
    if (!lastRun) return true;
    const since = new Date(lastRun.finishedAt ?? lastRun.queuedAt).getTime();
    return now.getTime() - since >= worker.cooldownSeconds * 1000;
  }
  return false;
}

/** When the worker will next run automatically (for display). */
export function nextRunAt(
  worker: Pick<Worker, "enabled" | "runMode" | "cron" | "cooldownSeconds">,
  lastRun: Pick<WorkerRun, "status" | "finishedAt" | "queuedAt"> | null,
  now: Date,
): string | null {
  if (!worker.enabled) return null;
  if (worker.runMode === "schedule" && worker.cron) {
    return nextCronRun(worker.cron, now)?.toISOString() ?? null;
  }
  if (worker.runMode === "continuous") {
    if (!lastRun) return now.toISOString();
    if (lastRun.status === "queued" || lastRun.status === "running")
      return null;
    const since = new Date(lastRun.finishedAt ?? lastRun.queuedAt).getTime();
    return new Date(since + worker.cooldownSeconds * 1000).toISOString();
  }
  return null;
}

export class WorkerScheduler {
  private timer: NodeJS.Timeout | null = null;
  private lockClient: PoolClient | null = null;
  private leader = false;
  private ticking = false;
  private lastTriggerCheck = 0;
  private lastPrune = 0;
  /** Per-worker schedule cursor: fires in (cursor, now] are due. */
  private readonly evaluatedAt = new Map<string, Date>();
  private leaderSince = new Date();
  private readonly inFlight = new Map<string, AbortController>();
  /** Only a started scheduler leads or executes (WORKERS_SCHEDULER=off). */
  private started = false;

  start(): void {
    if (this.timer) return;
    this.started = true;
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.timer.unref();
    void this.tick();
  }

  async stop(): Promise<void> {
    this.started = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.abortAll();
    await this.releaseLeadership();
  }

  isLeader(): boolean {
    return this.leader;
  }

  /** Is this instance executing the run right now? */
  isExecuting(runId: string): boolean {
    return this.inFlight.has(runId);
  }

  /** Execute queued runs now instead of waiting for the next tick. */
  kick(): void {
    if (this.started) void this.tick();
  }

  /**
   * Cancel a run from any instance. Queued → cancelled immediately; running
   * here → aborted; running on another instance → a persisted request that
   * the executing leader acts on within one tick. False if nothing to cancel.
   */
  async cancel(runId: string): Promise<boolean> {
    const controller = this.inFlight.get(runId);
    if (controller) {
      controller.abort();
      return true;
    }
    if ((await cancelQueuedRun(runId)) !== null) return true;
    return requestCancel(runId);
  }

  private abortAll(): void {
    for (const c of this.inFlight.values()) c.abort();
  }

  /** Lost the lock: stop executing, so the next leader never runs a duplicate. */
  private loseLeadership(reason: string): void {
    if (!this.leader && !this.lockClient) return;
    console.error(
      `[workers] scheduler leadership lost (${reason}); aborting in-flight runs`,
    );
    this.leader = false;
    this.lockClient = null;
    this.abortAll();
  }

  /**
   * Stop whatever a dead leader left running before its runs are marked
   * failed, so a worker never has two executions at once.
   */
  /**
   * Release runs marked running that this leader is not executing — left by
   * a dead leader, or kept after a failed cleanup — but only once their
   * execution is verified stopped. Unverifiable ones stay running (so the
   * worker cannot start a second execution) and are retried every tick.
   */
  private async reconcile(): Promise<number> {
    let released = 0;
    for (const r of await listRunningRuns()) {
      if (this.inFlight.has(r.id)) continue;
      const ref = r.executorRef;
      try {
        if (ref?.startsWith("container:")) await stopExecutionAndWait(ref);
        else if (ref?.startsWith("host:")) await stopHostRunAndWait(r.id, ref);
        // No ref: the executor reference is written before any spawn, so
        // this run never started an execution.
      } catch (err) {
        console.error(
          `[workers] run ${r.id}: cleanup not verified, keeping it active:`,
          (err as Error).message,
        );
        continue;
      }
      if (
        await failRunningRun(
          r.id,
          "interrupted: execution was stopped by the scheduler",
        )
      ) {
        released++;
      }
    }
    return released;
  }

  private async acquireLeadership(): Promise<void> {
    const client = await getClient();
    let locked = false;
    try {
      const res = await client.query<{ ok: boolean }>(
        "SELECT pg_try_advisory_lock($1::bigint) AS ok",
        [LEADER_LOCK_KEY],
      );
      locked = res.rows[0]?.ok === true;
      if (!locked) {
        client.release();
        return;
      }
      // Leadership is published only after recovery succeeds. Labelled
      // containers can only belong to a previous leader at this point.
      if (resolveExecutor("auto") === "container") removeLabelledContainers();
      const failed = await this.reconcile();
      client.on("error", () => this.loseLeadership("lock connection error"));
      this.lockClient = client;
      this.leader = true;
      this.leaderSince = new Date();
      this.evaluatedAt.clear();
      console.log(
        `[workers] scheduler leadership acquired${failed ? ` (${failed} interrupted run(s) marked failed)` : ""}`,
      );
    } catch (err) {
      if (locked) {
        await client
          .query("SELECT pg_advisory_unlock($1::bigint)", [LEADER_LOCK_KEY])
          .catch(() => undefined);
      }
      // Destroy rather than return a possibly lock-holding session to the pool.
      client.release(err instanceof Error ? err : true);
      throw err;
    }
  }

  private async releaseLeadership(): Promise<void> {
    const client = this.lockClient;
    this.leader = false;
    this.lockClient = null;
    if (!client) return;
    try {
      await client.query("SELECT pg_advisory_unlock($1::bigint)", [
        LEADER_LOCK_KEY,
      ]);
    } finally {
      client.release();
    }
  }

  private async tick(): Promise<void> {
    if (this.ticking || !this.started) return;
    this.ticking = true;
    try {
      const wasLeader = this.leader;
      if (!wasLeader) await this.acquireLeadership();
      if (!this.leader) return;
      await this.applyCancelRequests();
      // Acquisition already reconciled; afterwards, every tick retries.
      if (wasLeader) await this.reconcile();
      const now = Date.now();
      if (now - this.lastTriggerCheck >= TRIGGER_EVERY_MS) {
        this.lastTriggerCheck = now;
        await this.createDueRuns(new Date(now));
      }
      await this.dispatchQueued();
      if (now - this.lastPrune >= PRUNE_EVERY_MS) {
        this.lastPrune = now;
        const n = await pruneRuns(retentionDays());
        if (n)
          console.log(
            `[workers] pruned ${n} run(s) older than ${retentionDays()} days`,
          );
      }
    } catch (err) {
      console.error("[workers] scheduler tick failed:", (err as Error).message);
    } finally {
      this.ticking = false;
    }
  }

  private async applyCancelRequests(): Promise<void> {
    const ids = await cancelRequestedAmong([...this.inFlight.keys()]);
    for (const id of ids) this.inFlight.get(id)?.abort();
  }

  private async createDueRuns(now: Date): Promise<void> {
    const [workers, lastRuns] = await Promise.all([
      listWorkers(),
      lastRunsByWorker(),
    ]);
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    for (const worker of workers) {
      // Missed fires while daax was down (or before this leader) are not
      // back-filled: each worker's cursor starts at leadership.
      const since = this.evaluatedAt.get(worker.id) ?? this.leaderSince;
      const last = lastRuns.get(worker.id) ?? null;
      try {
        if (!automaticTriggerDue(worker, last, since, now)) continue;
        const count = await countAutomaticRunsSince(worker.id, dayAgo);
        if (count >= worker.maxRunsPerDay) continue;
        const trigger =
          worker.runMode === "schedule" ? "schedule" : "continuous";
        await createRun(worker, trigger, "", "scheduler");
      } catch (err) {
        if (!(err instanceof RunConflictError)) {
          // Leave this worker's cursor where it was; retry next pass.
          console.error(
            `[workers] trigger check failed for ${worker.slug}:`,
            (err as Error).message,
          );
          continue;
        }
      }
      this.evaluatedAt.set(worker.id, now);
    }
  }

  private async dispatchQueued(): Promise<void> {
    const free = maxConcurrent() - this.inFlight.size;
    if (free <= 0) return;
    const queued = await listQueuedRuns(free + this.inFlight.size);
    for (const run of queued) {
      if (!this.leader || this.inFlight.size >= maxConcurrent()) break;
      if (this.inFlight.has(run.id)) continue;
      const controller = new AbortController();
      this.inFlight.set(run.id, controller);
      void executeRun(run.id, controller.signal)
        .catch((err) =>
          console.error(
            `[workers] run ${run.id} crashed:`,
            (err as Error).message,
          ),
        )
        .finally(() => {
          this.inFlight.delete(run.id);
          this.kick();
        });
    }
  }
}

const GLOBAL_KEY = Symbol.for("daax.workers.scheduler");
type GlobalWithScheduler = typeof globalThis & {
  [GLOBAL_KEY]?: WorkerScheduler;
};

/** The process-wide scheduler (survives dev hot reloads). */
export function getScheduler(): WorkerScheduler {
  const g = globalThis as GlobalWithScheduler;
  if (!g[GLOBAL_KEY]) g[GLOBAL_KEY] = new WorkerScheduler();
  return g[GLOBAL_KEY]!;
}
/**
 * Read models for the API: workers with derived state (running, paused,
 * failing), last run, next automatic run, and active goal count.
 */

import { query } from "@/lib/db/pg";
import { nextRunAt } from "./scheduler";
import { getWorker, lastRunsByWorker, listRuns, listWorkers } from "./store";
import type { Worker, WorkerRun, WorkerSummary } from "@/types/workers";

export function deriveState(
  worker: Worker,
  lastRun: WorkerRun | null,
): WorkerSummary["state"] {
  if (lastRun && (lastRun.status === "queued" || lastRun.status === "running"))
    return "running";
  if (!worker.enabled && worker.pausedReason) return "paused";
  if (lastRun && (lastRun.status === "failed" || lastRun.status === "timeout"))
    return "failing";
  if (!worker.enabled && worker.runMode !== "adhoc") return "paused";
  return "idle";
}

async function activeGoalCounts(): Promise<Map<string, number>> {
  const res = await query<{ worker_id: string; n: string }>(
    "SELECT worker_id, count(*) AS n FROM worker_goals WHERE status = 'active' GROUP BY worker_id",
  );
  return new Map(res.rows.map((r) => [r.worker_id, Number(r.n)]));
}

function summarize(
  worker: Worker,
  lastRun: WorkerRun | null,
  goals: number,
  now: Date,
): WorkerSummary {
  return {
    ...worker,
    state: deriveState(worker, lastRun),
    lastRun,
    nextRunAt: nextRunAt(worker, lastRun, now),
    activeGoals: goals,
  };
}

export async function listWorkerSummaries(
  now = new Date(),
): Promise<WorkerSummary[]> {
  const [workers, lastRuns, goals] = await Promise.all([
    listWorkers(),
    lastRunsByWorker(),
    activeGoalCounts(),
  ]);
  return workers.map((w) =>
    summarize(w, lastRuns.get(w.id) ?? null, goals.get(w.id) ?? 0, now),
  );
}

export async function getWorkerSummary(
  idOrSlug: string,
  now = new Date(),
): Promise<WorkerSummary | null> {
  const worker = await getWorker(idOrSlug);
  if (!worker) return null;
  const [runs, goals] = await Promise.all([
    listRuns(worker.id, 1),
    activeGoalCounts(),
  ]);
  return summarize(worker, runs[0] ?? null, goals.get(worker.id) ?? 0, now);
}
/**
 * Project signals: git and GitHub state collected by daax itself with fixed,
 * read-only commands (no shell, argument arrays only), then handed to the
 * agent in its prompt. The agent gets no shell, so it cannot turn a "read"
 * command into a write (see plan.ts READ_BUILTINS).
 */

import { execFile } from "node:child_process";

const SIGNAL_TIMEOUT_MS = 20_000;
const MAX_SIGNAL_CHARS = 6_000;

interface SignalCommand {
  label: string;
  command: string;
  args: string[];
}

export const SIGNAL_COMMANDS: readonly SignalCommand[] = [
  {
    label: "git status",
    command: "git",
    args: ["status", "--short", "--branch"],
  },
  {
    label: "recent commits",
    command: "git",
    args: ["log", "-15", "--date=short", "--format=%h %ad %an %s"],
  },
  {
    label: "open pull requests",
    command: "gh",
    args: [
      "pr",
      "list",
      "--state",
      "open",
      "--limit",
      "20",
      "--json",
      "number,title,headRefName,isDraft,reviewDecision,updatedAt",
    ],
  },
  {
    label: "recent CI runs",
    command: "gh",
    args: [
      "run",
      "list",
      "--limit",
      "10",
      "--json",
      "databaseId,workflowName,status,conclusion,headBranch,createdAt",
    ],
  },
];

function runOne(
  cmd: SignalCommand,
  cwd: string,
  env: Record<string, string>,
  signal: AbortSignal,
): Promise<string> {
  return new Promise((resolve) => {
    execFile(
      cmd.command,
      cmd.args,
      {
        cwd,
        env: env as NodeJS.ProcessEnv,
        timeout: SIGNAL_TIMEOUT_MS,
        maxBuffer: 1024 * 1024,
        signal,
      },
      (err, stdout, stderr) => {
        if (err) {
          const why = (stderr || err.message).trim().split("\n")[0];
          resolve(`(unavailable: ${why.slice(0, 200)})`);
          return;
        }
        const out = stdout.trim() || "(none)";
        resolve(
          out.length > MAX_SIGNAL_CHARS
            ? `${out.slice(0, MAX_SIGNAL_CHARS)}… [truncated]`
            : out,
        );
      },
    );
  });
}

/** Collect every signal; failures are reported inline, never thrown. */
export async function collectSignals(
  cwd: string,
  env: Record<string, string>,
  signal: AbortSignal,
): Promise<string> {
  const outputs = await Promise.all(
    SIGNAL_COMMANDS.map((c) => runOne(c, cwd, env, signal)),
  );
  return SIGNAL_COMMANDS.map(
    (c, i) =>
      `### ${c.label} (\`${c.command} ${c.args.join(" ")}\`)\n${outputs[i]}`,
  ).join("\n\n");
}

hook: PostToolUse
hook: PostToolUse Completed
hook: PreToolUse
hook: PreToolUse Completed
exec
/bin/zsh -lc 'cat lib/workers/store.ts' in /Users/jasonpoley/prj/dx/src/daax-web
 succeeded in 0ms:
/**
 * Digital Workers — Postgres store (docs/plans/digital-workers.md §5).
 *
 * Plain async functions over the shared `pg` pool, following `lib/catalog/db.ts`:
 * jsonb columns are written with JSON.stringify and read back parsed;
 * timestamptz values are normalised to ISO-8601 strings.
 */

import { randomUUID } from "node:crypto";
import { getClient, query } from "@/lib/db/pg";
import { UUID_RE } from "@/types/workers";
import type {
  GoalStatus,
  RunEvent,
  RunStatus,
  RunTrigger,
  RunUsage,
  Worker,
  WorkerEngine,
  WorkerGoal,
  WorkerMcpServer,
  WorkerRun,
  WorkerRunEvent,
} from "@/types/workers";

type Row = Record<string, unknown>;

/** Thrown when a worker already has a queued or running run. */
export class RunConflictError extends Error {
  constructor(public readonly workerId: string) {
    super("Worker already has a run in progress");
    this.name = "RunConflictError";
  }
}

function iso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  return new Date(v as string).toISOString();
}

function isoOrNull(v: unknown): string | null {
  return v == null ? null : iso(v);
}

function toWorker(r: Row): Worker {
  return {
    id: r.id as string,
    slug: r.slug as string,
    name: r.name as string,
    role: r.role as Worker["role"],
    description: r.description as string,
    instructions: r.instructions as string,
    engine: r.engine as Worker["engine"],
    model: (r.model as string | null) ?? null,
    runMode: r.run_mode as Worker["runMode"],
    cron: (r.cron as string | null) ?? null,
    cooldownSeconds: r.cooldown_seconds as number,
    maxRunsPerDay: r.max_runs_per_day as number,
    timeoutSeconds: r.timeout_seconds as number,
    autonomy: r.autonomy as Worker["autonomy"],
    executor: r.executor as Worker["executor"],
    workingDir: (r.working_dir as string | null) ?? null,
    mcpServers: (r.mcp_servers as WorkerMcpServer[] | null) ?? [],
    enabled: r.enabled as boolean,
    pausedReason: (r.paused_reason as string | null) ?? null,
    createdBy: (r.created_by as string | null) ?? null,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

function toGoal(r: Row): WorkerGoal {
  return {
    id: r.id as string,
    workerId: r.worker_id as string,
    title: r.title as string,
    description: r.description as string,
    projectRef: (r.project_ref as string | null) ?? null,
    successCriteria: r.success_criteria as string,
    status: r.status as GoalStatus,
    priority: r.priority as number,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

function toRun(r: Row): WorkerRun {
  return {
    id: r.id as string,
    workerId: r.worker_id as string,
    trigger: r.trigger as RunTrigger,
    input: r.input as string,
    status: r.status as RunStatus,
    engine: r.engine as WorkerEngine,
    queuedAt: iso(r.queued_at),
    startedAt: isoOrNull(r.started_at),
    finishedAt: isoOrNull(r.finished_at),
    summary: (r.summary as string | null) ?? null,
    error: (r.error as string | null) ?? null,
    usage: (r.usage as RunUsage | null) ?? {},
    requestedBy: (r.requested_by as string | null) ?? null,
    cancelRequested: r.cancel_requested === true,
  };
}

function toEvent(r: Row): WorkerRunEvent {
  return {
    id: Number(r.id),
    runId: r.run_id as string,
    seq: r.seq as number,
    at: iso(r.at),
    type: r.type as WorkerRunEvent["type"],
    text: (r.text as string | null) ?? undefined,
    tool: (r.tool as string | null) ?? undefined,
    data: r.data ?? undefined,
  };
}

// ============================================================================
// Workers
// ============================================================================

/** Column name for each writable Worker field. */
const WORKER_COLUMNS = {
  slug: "slug",
  name: "name",
  role: "role",
  description: "description",
  instructions: "instructions",
  engine: "engine",
  model: "model",
  runMode: "run_mode",
  cron: "cron",
  cooldownSeconds: "cooldown_seconds",
  maxRunsPerDay: "max_runs_per_day",
  timeoutSeconds: "timeout_seconds",
  autonomy: "autonomy",
  executor: "executor",
  workingDir: "working_dir",
  mcpServers: "mcp_servers",
  enabled: "enabled",
  pausedReason: "paused_reason",
} as const satisfies Partial<Record<keyof Worker, string>>;

export type WorkerInput = Partial<Pick<Worker, keyof typeof WORKER_COLUMNS>> & {
  name: string;
  slug: string;
};

export type WorkerPatch = Partial<Pick<Worker, keyof typeof WORKER_COLUMNS>>;

function columnValue(key: keyof typeof WORKER_COLUMNS, value: unknown) {
  return key === "mcpServers" ? JSON.stringify(value ?? []) : value;
}

export async function listWorkers(): Promise<Worker[]> {
  const res = await query("SELECT * FROM workers ORDER BY name");
  return res.rows.map(toWorker);
}

/** Look a worker up by id (uuid) or slug. */
export async function getWorker(idOrSlug: string): Promise<Worker | null> {
  const isUuid = UUID_RE.test(idOrSlug);
  const res = await query(
    isUuid
      ? "SELECT * FROM workers WHERE id = $1"
      : "SELECT * FROM workers WHERE slug = $1",
    [idOrSlug],
  );
  return res.rows[0] ? toWorker(res.rows[0]) : null;
}

export async function createWorker(
  input: WorkerInput,
  createdBy: string | null,
): Promise<Worker> {
  const cols = ["id", "created_by"];
  const vals: unknown[] = [randomUUID(), createdBy];
  for (const [key, col] of Object.entries(WORKER_COLUMNS)) {
    const v = input[key as keyof WorkerInput];
    if (v !== undefined) {
      cols.push(col);
      vals.push(columnValue(key as keyof typeof WORKER_COLUMNS, v));
    }
  }
  const placeholders = vals.map((_, i) => `$${i + 1}`).join(", ");
  const res = await query(
    `INSERT INTO workers (${cols.join(", ")}) VALUES (${placeholders}) RETURNING *`,
    vals,
  );
  return toWorker(res.rows[0]);
}

export async function updateWorker(
  id: string,
  patch: WorkerPatch,
): Promise<Worker | null> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [key, col] of Object.entries(WORKER_COLUMNS)) {
    const v = patch[key as keyof WorkerPatch];
    if (v !== undefined) {
      vals.push(columnValue(key as keyof typeof WORKER_COLUMNS, v));
      sets.push(`${col} = $${vals.length}`);
    }
  }
  if (sets.length === 0) return getWorker(id);
  vals.push(id);
  const res = await query(
    `UPDATE workers SET ${sets.join(", ")}, updated_at = now() WHERE id = $${vals.length} RETURNING *`,
    vals,
  );
  return res.rows[0] ? toWorker(res.rows[0]) : null;
}

/**
 * Delete a worker only if it has no queued/running run, atomically. The row
 * lock (FOR UPDATE) conflicts with the key-share lock a concurrent run INSERT
 * takes through the worker_runs foreign key, so deletion and enqueue are
 * serialized: a run created first is seen here; one created after fails.
 */
export async function deleteWorkerIfIdle(
  id: string,
): Promise<"deleted" | "active" | "missing"> {
  const client = await getClient();
  try {
    await client.query("BEGIN");
    const found = await client.query(
      "SELECT id FROM workers WHERE id = $1 FOR UPDATE",
      [id],
    );
    if (found.rowCount === 0) {
      await client.query("ROLLBACK");
      return "missing";
    }
    const active = await client.query(
      "SELECT 1 FROM worker_runs WHERE worker_id = $1 AND status IN ('queued','running') LIMIT 1",
      [id],
    );
    if ((active.rowCount ?? 0) > 0) {
      await client.query("ROLLBACK");
      return "active";
    }
    await client.query("DELETE FROM workers WHERE id = $1", [id]);
    await client.query("COMMIT");
    return "deleted";
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteWorker(id: string): Promise<boolean> {
  const res = await query("DELETE FROM workers WHERE id = $1", [id]);
  return (res.rowCount ?? 0) > 0;
}

// ============================================================================
// Goals
// ============================================================================

export type GoalInput = Pick<WorkerGoal, "title"> &
  Partial<
    Pick<
      WorkerGoal,
      "description" | "projectRef" | "successCriteria" | "status" | "priority"
    >
  >;

const GOAL_COLUMNS = {
  title: "title",
  description: "description",
  projectRef: "project_ref",
  successCriteria: "success_criteria",
  status: "status",
  priority: "priority",
} as const;

export async function listGoals(
  workerId: string,
  status?: GoalStatus,
): Promise<WorkerGoal[]> {
  const res = status
    ? await query(
        "SELECT * FROM worker_goals WHERE worker_id = $1 AND status = $2 ORDER BY priority DESC, created_at",
        [workerId, status],
      )
    : await query(
        "SELECT * FROM worker_goals WHERE worker_id = $1 ORDER BY priority DESC, created_at",
        [workerId],
      );
  return res.rows.map(toGoal);
}

export async function createGoal(
  workerId: string,
  input: GoalInput,
): Promise<WorkerGoal> {
  const cols = ["id", "worker_id"];
  const vals: unknown[] = [randomUUID(), workerId];
  for (const [key, col] of Object.entries(GOAL_COLUMNS)) {
    const v = input[key as keyof GoalInput];
    if (v !== undefined) {
      cols.push(col);
      vals.push(v);
    }
  }
  const placeholders = vals.map((_, i) => `$${i + 1}`).join(", ");
  const res = await query(
    `INSERT INTO worker_goals (${cols.join(", ")}) VALUES (${placeholders}) RETURNING *`,
    vals,
  );
  return toGoal(res.rows[0]);
}

export async function updateGoal(
  workerId: string,
  goalId: string,
  patch: Partial<GoalInput>,
): Promise<WorkerGoal | null> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [key, col] of Object.entries(GOAL_COLUMNS)) {
    const v = patch[key as keyof GoalInput];
    if (v !== undefined) {
      vals.push(v);
      sets.push(`${col} = $${vals.length}`);
    }
  }
  if (sets.length === 0) {
    const res = await query(
      "SELECT * FROM worker_goals WHERE id = $1 AND worker_id = $2",
      [goalId, workerId],
    );
    return res.rows[0] ? toGoal(res.rows[0]) : null;
  }
  vals.push(goalId, workerId);
  const res = await query(
    `UPDATE worker_goals SET ${sets.join(", ")}, updated_at = now()
       WHERE id = $${vals.length - 1} AND worker_id = $${vals.length} RETURNING *`,
    vals,
  );
  return res.rows[0] ? toGoal(res.rows[0]) : null;
}

export async function deleteGoal(
  workerId: string,
  goalId: string,
): Promise<boolean> {
  const res = await query(
    "DELETE FROM worker_goals WHERE id = $1 AND worker_id = $2",
    [goalId, workerId],
  );
  return (res.rowCount ?? 0) > 0;
}

// ============================================================================
// Runs
// ============================================================================

/**
 * Queue a run. The partial unique index `worker_runs_one_active_idx` makes
 * "one queued/running run per worker" a database guarantee; a violation is
 * surfaced as RunConflictError.
 */
export async function createRun(
  worker: Pick<Worker, "id" | "engine">,
  trigger: RunTrigger,
  input: string,
  requestedBy: string | null,
): Promise<WorkerRun> {
  try {
    const res = await query(
      `INSERT INTO worker_runs (id, worker_id, trigger, input, engine, requested_by)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [randomUUID(), worker.id, trigger, input, worker.engine, requestedBy],
    );
    return toRun(res.rows[0]);
  } catch (err) {
    if ((err as { code?: string }).code === "23505") {
      throw new RunConflictError(worker.id);
    }
    throw err;
  }
}

/** queued → running. Returns false if the run is no longer queued (e.g. cancelled). */
export async function markRunStarted(runId: string): Promise<boolean> {
  const res = await query(
    "UPDATE worker_runs SET status = 'running', started_at = now() WHERE id = $1 AND status = 'queued'",
    [runId],
  );
  return (res.rowCount ?? 0) > 0;
}

/**
 * running → terminal. Only a run still `running` is updated, so a completion
 * from a deposed leader (whose run the new leader already failed) is ignored.
 */
export async function finishRun(
  runId: string,
  result: {
    status: RunStatus;
    summary?: string | null;
    error?: string | null;
    usage?: RunUsage;
  },
): Promise<WorkerRun | null> {
  const res = await query(
    `UPDATE worker_runs
        SET status = $2, summary = $3, error = $4, usage = $5, finished_at = now()
      WHERE id = $1 AND status IN ('queued','running') RETURNING *`,
    [
      runId,
      result.status,
      result.summary ?? null,
      result.error ?? null,
      JSON.stringify(result.usage ?? {}),
    ],
  );
  return res.rows[0] ? toRun(res.rows[0]) : null;
}

/** Record where a run executes (container name / host process group). */
export async function setExecutorRef(
  runId: string,
  ref: string,
): Promise<void> {
  await query("UPDATE worker_runs SET executor_ref = $2 WHERE id = $1", [
    runId,
    ref,
  ]);
}

/** Ask the executing leader to cancel a running run (any instance may call). */
export async function requestCancel(runId: string): Promise<boolean> {
  const res = await query(
    "UPDATE worker_runs SET cancel_requested = true WHERE id = $1 AND status = 'running'",
    [runId],
  );
  return (res.rowCount ?? 0) > 0;
}

/** Of the given run ids, those with a pending cancel request. */
export async function cancelRequestedAmong(
  runIds: string[],
): Promise<string[]> {
  if (runIds.length === 0) return [];
  const res = await query<{ id: string }>(
    "SELECT id FROM worker_runs WHERE id = ANY($1::uuid[]) AND cancel_requested",
    [runIds],
  );
  return res.rows.map((r) => r.id);
}

/** Runs still marked running (with where they execute), for leader recovery. */
export async function listRunningRuns(): Promise<
  { id: string; executorRef: string | null }[]
> {
  const res = await query<{ id: string; executor_ref: string | null }>(
    "SELECT id, executor_ref FROM worker_runs WHERE status = 'running'",
  );
  return res.rows.map((r) => ({ id: r.id, executorRef: r.executor_ref }));
}

/** Is any run of this worker queued or running? */
export async function hasActiveRun(workerId: string): Promise<boolean> {
  const res = await query(
    "SELECT 1 FROM worker_runs WHERE worker_id = $1 AND status IN ('queued','running') LIMIT 1",
    [workerId],
  );
  return (res.rowCount ?? 0) > 0;
}

export async function getRun(runId: string): Promise<WorkerRun | null> {
  const res = await query("SELECT * FROM worker_runs WHERE id = $1", [runId]);
  return res.rows[0] ? toRun(res.rows[0]) : null;
}

export async function listRuns(
  workerId: string,
  limit = 20,
): Promise<WorkerRun[]> {
  const res = await query(
    "SELECT * FROM worker_runs WHERE worker_id = $1 ORDER BY queued_at DESC LIMIT $2",
    [workerId, limit],
  );
  return res.rows.map(toRun);
}

/** Latest run per worker, keyed by worker id. */
export async function lastRunsByWorker(): Promise<Map<string, WorkerRun>> {
  const res = await query(
    `SELECT DISTINCT ON (worker_id) * FROM worker_runs
      ORDER BY worker_id, queued_at DESC`,
  );
  return new Map(res.rows.map((r) => [r.worker_id as string, toRun(r)]));
}

/**
 * The worker's "brief": the most recent successful full report (a run with
 * no question), falling back to the most recent answer when none exists.
 */
export async function latestBrief(workerId: string): Promise<WorkerRun | null> {
  const res = await query(
    `SELECT * FROM worker_runs
      WHERE worker_id = $1 AND status = 'succeeded' AND summary IS NOT NULL
      ORDER BY (input = '') DESC, finished_at DESC LIMIT 1`,
    [workerId],
  );
  return res.rows[0] ? toRun(res.rows[0]) : null;
}

/** Automatic (schedule/continuous) runs queued since `since`. */
export async function countAutomaticRunsSince(
  workerId: string,
  since: Date,
): Promise<number> {
  const res = await query<{ n: string }>(
    `SELECT count(*) AS n FROM worker_runs
      WHERE worker_id = $1 AND trigger IN ('schedule','continuous') AND queued_at >= $2`,
    [workerId, since.toISOString()],
  );
  return Number(res.rows[0]?.n ?? 0);
}

/** Statuses of the most recent finished runs, newest first. */
export async function recentFinishedStatuses(
  workerId: string,
  n: number,
): Promise<RunStatus[]> {
  const res = await query<{ status: RunStatus }>(
    `SELECT status FROM worker_runs
      WHERE worker_id = $1 AND finished_at IS NOT NULL
      ORDER BY finished_at DESC LIMIT $2`,
    [workerId, n],
  );
  return res.rows.map((r) => r.status);
}

/** Fail one still-running run whose execution was verified stopped. */
export async function failRunningRun(
  runId: string,
  error: string,
): Promise<boolean> {
  const res = await query(
    `UPDATE worker_runs SET status = 'failed', error = $2, finished_at = now()
      WHERE id = $1 AND status = 'running'`,
    [runId, error],
  );
  return (res.rowCount ?? 0) > 0;
}

/** Oldest queued runs across all workers (the leader's work queue). */
export async function listQueuedRuns(limit = 10): Promise<WorkerRun[]> {
  const res = await query(
    "SELECT * FROM worker_runs WHERE status = 'queued' ORDER BY queued_at LIMIT $1",
    [limit],
  );
  return res.rows.map(toRun);
}

/** Cancel a queued run, or flag a running one; returns the updated run. */
export async function cancelQueuedRun(
  runId: string,
): Promise<WorkerRun | null> {
  const res = await query(
    `UPDATE worker_runs SET status = 'cancelled', finished_at = now(), error = 'cancelled by operator'
      WHERE id = $1 AND status = 'queued' RETURNING *`,
    [runId],
  );
  return res.rows[0] ? toRun(res.rows[0]) : null;
}

/**
 * Delete finished runs (and, by cascade, their events) older than `days`.
 * Queued/running rows are never pruned: they hold the one-active-run
 * exclusion and the recovery reference of an execution still being cleaned up.
 */
export async function pruneRuns(days: number): Promise<number> {
  const res = await query(
    `DELETE FROM worker_runs
      WHERE status NOT IN ('queued','running')
        AND finished_at < now() - make_interval(days => $1)`,
    [days],
  );
  return res.rowCount ?? 0;
}

// ============================================================================
// Run events
// ============================================================================

export async function appendRunEvent(
  runId: string,
  seq: number,
  event: RunEvent,
): Promise<void> {
  await query(
    `INSERT INTO worker_run_events (run_id, seq, type, text, tool, data)
       VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      runId,
      seq,
      event.type,
      event.text ?? null,
      event.tool ?? null,
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

hook: PostToolUse
hook: PostToolUse Completed
hook: PreToolUse
hook: PreToolUse Completed
exec
/bin/zsh -lc 'git diff origin/main...HEAD -- lib/workers/mcp.ts lib/workers/plan.ts lib/workers/templates.ts lib/workers/workspace.ts' in /Users/jasonpoley/prj/dx/src/daax-web
 succeeded in 0ms:
diff --git a/lib/workers/mcp.ts b/lib/workers/mcp.ts
new file mode 100644
index 0000000..d71e030
--- /dev/null
+++ b/lib/workers/mcp.ts
@@ -0,0 +1,372 @@
+/**
+ * Worker MCP servers: resolve a worker's server list to concrete launch
+ * configs, list each server's tools, and classify them read vs write so the
+ * engine can be given an exact allow-list for the worker's autonomy level.
+ *
+ * Secrets: `ref` servers are resolved from the /mcp discovery sources at run
+ * time (their env never touches the DB); `inline` servers get only the env
+ * vars they name in `envPassthrough`, read from the daax process env.
+ */
+
+import { spawn } from "node:child_process";
+import { discoverAllMcps } from "@/lib/mcp-config";
+import { buildChildEnv, isAllowedRemoteUrl } from "@/lib/mcp-route-helpers";
+import { LineTail } from "./events";
+import type { WorkerMcpServer } from "@/types/workers";
+
+/**
+ * Environment variables that belong to daax itself or to the engines. They are
+ * never passed through to a worker's MCP servers, whatever a worker requests.
+ */
+const RESERVED_ENV =
+  /^(DATABASE_URL|PG[A-Z_]*|DAAX_[A-Z0-9_]*|WORKERS_[A-Z0-9_]*|ANTHROPIC_[A-Z0-9_]*|CLAUDE_[A-Z0-9_]*|CODEX_[A-Z0-9_]*|OPENAI_[A-Z0-9_]*|NEXT_[A-Z0-9_]*|NODE_OPTIONS|PATH|HOME|SHELL|LD_[A-Z_]*|DYLD_[A-Z_]*|HOST_WORKSPACE_PATH)$/;
+
+export function isReservedEnvName(name: string): boolean {
+  return RESERVED_ENV.test(name);
+}
+
+export interface ResolvedMcpServer {
+  id: string;
+  type: "stdio" | "http";
+  command?: string;
+  args?: string[];
+  url?: string;
+  env: Record<string, string>;
+}
+
+export interface McpToolInfo {
+  name: string;
+  readOnly: boolean;
+}
+
+const READ_WORDS = new Set([
+  "get",
+  "list",
+  "search",
+  "view",
+  "read",
+  "fetch",
+  "describe",
+  "show",
+  "find",
+  "count",
+  "lookup",
+  "inspect",
+  "status",
+  "diff",
+  "log",
+  "logs",
+  "compare",
+  "check",
+  "overview",
+  "guide",
+  "info",
+]);
+
+const WRITE_WORDS = new Set([
+  // Words that execute arbitrary operations make a tool a write even when a
+  // read word is present (execute_query, run_sql, call_api).
+  "execute",
+  "exec",
+  "sql",
+  "eval",
+  "call",
+  "invoke",
+  "apply",
+  "mutate",
+  "mutation",
+  "insert",
+  "upsert",
+  "patch",
+  "put",
+  "save",
+  "store",
+  "import",
+  "sync",
+  "publish",
+  "share",
+  "grant",
+  "revoke",
+  "reset",
+  "revert",
+  "rollback",
+  "restart",
+  "stop",
+  "start",
+  "kill",
+  "command",
+  "shell",
+  "script",
+  "create",
+  "add",
+  "edit",
+  "update",
+  "set",
+  "write",
+  "delete",
+  "remove",
+  "rename",
+  "archive",
+  "complete",
+  "close",
+  "reopen",
+  "merge",
+  "push",
+  "move",
+  "assign",
+  "comment",
+  "post",
+  "send",
+  "submit",
+  "approve",
+  "run",
+  "trigger",
+  "dispatch",
+  "cancel",
+  "fork",
+  "upload",
+  "install",
+  "enable",
+  "disable",
+  "lock",
+  "unlock",
+]);
+
+/** Split snake_case, kebab-case, dotted and camelCase names into words. */
+export function nameWords(name: string): string[] {
+  return name
+    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
+    .split(/[\s_.\-/]+/)
+    .filter(Boolean)
+    .map((w) => w.toLowerCase());
+}
+
+/**
+ * A tool is read-only when the server annotates it `readOnlyHint: true`.
+ * Without annotations, its name must contain a read word and no write word
+ * (`task_list`, `get_file` → read; `task_create`, `list_and_delete` → write).
+ * Unknown names are writes (fail closed). An explicit `readOnlyHint: false`
+ * or `destructiveHint: true` always means write.
+ */
+export function isReadOnlyTool(tool: {
+  name: string;
+  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean };
+}): boolean {
+  const a = tool.annotations;
+  if (a?.destructiveHint === true || a?.readOnlyHint === false) return false;
+  if (a?.readOnlyHint === true) return true;
+  const words = nameWords(tool.name);
+  if (words.some((w) => WRITE_WORDS.has(w))) return false;
+  return words.some((w) => READ_WORDS.has(w));
+}
+
+/**
+ * Resolve worker servers to launch configs. Unknown refs and invalid remote
+ * URLs are returned as `missing` (recorded as run warnings, not fatal).
+ */
+export function resolveMcpServers(
+  servers: WorkerMcpServer[],
+  projectPath: string,
+  env: NodeJS.ProcessEnv = process.env,
+): { resolved: ResolvedMcpServer[]; missing: string[] } {
+  const resolved: ResolvedMcpServer[] = [];
+  const missing: string[] = [];
+  const hasRefs = servers.some((s) => s.kind === "ref");
+  const discovered = hasRefs ? discoverAllMcps(projectPath).mcps : [];
+
+  for (const s of servers) {
+    if (s.kind === "ref") {
+      const found = discovered.find((d) => d.id === s.id && d.config);
+      const cfg = found?.config;
+      if (!cfg) {
+        missing.push(`${s.id} (not found in MCP configuration)`);
+        continue;
+      }
+      const type =
+        cfg.type === "http" || (!cfg.command && cfg.url) ? "http" : "stdio";
+      if (type === "http" && !isAllowedRemoteUrl(cfg.url)) {
+        missing.push(`${s.id} (invalid URL)`);
+        continue;
+      }
+      const cfgEnv = cfg.env ?? {};
+      resolved.push({
+        id: s.id,
+        type,
+        command: cfg.command,
+        args: cfg.args ?? [],
+        url: cfg.url,
+        env: cfgEnv,
+      });
+      continue;
+    }
+    const passthrough: Record<string, string> = {};
+    for (const name of s.envPassthrough ?? []) {
+      if (isReservedEnvName(name)) continue;
+      const v = env[name];
+      if (typeof v === "string") passthrough[name] = v;
+    }
+    resolved.push({
+      id: s.id,
+      type: s.type,
+      command: s.command,
+      args: s.args ?? [],
+      url: s.url,
+      env: passthrough,
+    });
+  }
+  return { resolved, missing };
+}
+
+const LIST_TIMEOUT_MS =
+  Number(process.env.WORKERS_MCP_LIST_TIMEOUT_MS) || 30_000;
+
+type RawTool = {
+  name: string;
+  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean };
+};
+
+function listViaStdio(
+  server: ResolvedMcpServer,
+  cwd: string | undefined,
+  signal: AbortSignal | undefined,
+): Promise<RawTool[]> {
+  return new Promise((resolve, reject) => {
+    // Same directory the engine will start the server in: some servers (e.g.
+    // Backlog.md) expose tools based on the project they find there.
+    const proc = spawn(server.command!, server.args ?? [], {
+      cwd,
+      env: buildChildEnv(server.env) as NodeJS.ProcessEnv,
+      stdio: ["pipe", "pipe", "pipe"],
+      signal,
+    });
+    let settled = false;
+    let buffer = "";
+    const stderrTail = new LineTail(4_000);
+    const done = (err: Error | null, tools?: RawTool[]) => {
+      if (settled) return;
+      settled = true;
+      clearTimeout(timer);
+      proc.kill();
+      if (err) reject(err);
+      else resolve(tools ?? []);
+    };
+    const timer = setTimeout(
+      () => done(new Error("timed out listing tools")),
+      LIST_TIMEOUT_MS,
+    );
+    const send = (msg: object) => proc.stdin.write(`${JSON.stringify(msg)}\n`);
+
+    proc.stdout.on("data", (chunk: Buffer) => {
+      buffer += chunk.toString();
+      const lines = buffer.split("\n");
+      buffer = lines.pop() ?? "";
+      for (const line of lines) {
+        let msg: {
+          id?: number;
+          result?: { tools?: RawTool[] };
+          error?: { message?: string };
+        };
+        try {
+          msg = JSON.parse(line);
+        } catch {
+          continue;
+        }
+        if (msg.id === 1) {
+          if (msg.error)
+            return done(new Error(msg.error.message ?? "initialize failed"));
+          send({ jsonrpc: "2.0", method: "notifications/initialized" });
+          send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
+        } else if (msg.id === 2) {
+          if (msg.error)
+            return done(new Error(msg.error.message ?? "tools/list failed"));
+          return done(null, msg.result?.tools ?? []);
+        }
+      }
+    });
+    proc.stderr.on("data", (c: Buffer) => {
+      stderrTail.push(c.toString());
+    });
+    proc.on("error", (e) => done(new Error(`failed to start: ${e.message}`)));
+    proc.on("close", (code) =>
+      done(
+        new Error(
+          `exited (${code ?? "signal"}) before listing tools${stderrTail.toString() ? `: ${stderrTail.toString().trim()}` : ""}`,
+        ),
+      ),
+    );
+    send({
+      jsonrpc: "2.0",
+      id: 1,
+      method: "initialize",
+      params: {
+        protocolVersion: "2025-06-18",
+        capabilities: {},
+        clientInfo: { name: "daax-workers", version: "1" },
+      },
+    });
+  });
+}
+
+async function listViaHttp(
+  server: ResolvedMcpServer,
+  signal: AbortSignal | undefined,
+): Promise<RawTool[]> {
+  const headers: Record<string, string> = {
+    "content-type": "application/json",
+    accept: "application/json, text/event-stream",
+  };
+  const post = async (body: object, sessionId?: string) => {
+    const res = await fetch(server.url!, {
+      method: "POST",
+      headers: sessionId
+        ? { ...headers, "mcp-session-id": sessionId }
+        : headers,
+      body: JSON.stringify(body),
+      signal: signal
+        ? AbortSignal.any([signal, AbortSignal.timeout(LIST_TIMEOUT_MS)])
+        : AbortSignal.timeout(LIST_TIMEOUT_MS),
+    });
+    if (!res.ok) throw new Error(`HTTP ${res.status}`);
+    const text = await res.text();
+    // Streamable HTTP may answer with an SSE frame; take the first data line.
+    const json = text.trimStart().startsWith("{")
+      ? text
+      : (text
+          .split("\n")
+          .find((l) => l.startsWith("data:"))
+          ?.slice(5) ?? "{}");
+    return {
+      json: JSON.parse(json),
+      sessionId: res.headers.get("mcp-session-id") ?? sessionId,
+    };
+  };
+  const init = await post({
+    jsonrpc: "2.0",
+    id: 1,
+    method: "initialize",
+    params: {
+      protocolVersion: "2025-06-18",
+      capabilities: {},
+      clientInfo: { name: "daax-workers", version: "1" },
+    },
+  });
+  const list = await post(
+    { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
+    init.sessionId,
+  );
+  return (list.json?.result?.tools as RawTool[]) ?? [];
+}
+
+/** List and classify a server's tools. Errors propagate to the caller. */
+export async function listServerTools(
+  server: ResolvedMcpServer,
+  opts: { cwd?: string; signal?: AbortSignal } = {},
+): Promise<McpToolInfo[]> {
+  const raw =
+    server.type === "http"
+      ? await listViaHttp(server, opts.signal)
+      : await listViaStdio(server, opts.cwd, opts.signal);
+  return raw
+    .filter((t) => typeof t?.name === "string")
+    .map((t) => ({ name: t.name, readOnly: isReadOnlyTool(t) }));
+}
diff --git a/lib/workers/plan.ts b/lib/workers/plan.ts
new file mode 100644
index 0000000..326fefe
--- /dev/null
+++ b/lib/workers/plan.ts
@@ -0,0 +1,301 @@
+/**
+ * Builds everything an engine needs for one run: prompts, the tool allow and
+ * deny lists for the worker's autonomy level, and the MCP server set.
+ *
+ * Write limits are enforced through the engine's own permission controls
+ * (Claude `--permission-mode dontAsk` + `--allowedTools`; codex `enabled_tools`
+ * + read-only sandbox), never by prompt wording alone.
+ */
+
+import type { McpToolInfo, ResolvedMcpServer } from "./mcp";
+import type {
+  RunTrigger,
+  Worker,
+  WorkerAutonomy,
+  WorkerGoal,
+} from "@/types/workers";
+
+/**
+ * Built-in tools the agent may use at every autonomy level: file reads and
+ * search only. There is deliberately no Bash: prefix rules cannot make a shell
+ * read-only (`git diff --output=<file>` writes, `gh ... --body-file` reads and
+ * posts). Git and GitHub state reach the agent as project signals collected by
+ * daax itself (lib/workers/signals.ts). Writes in `act` go through MCP tools.
+ */
+export const READ_BUILTINS = ["Read", "Glob", "Grep"] as const;
+
+/** Paths the Read tool may never open (credentials and daax state). */
+export const SECRET_PATH_DENY = [
+  "Read(**/.env)",
+  "Read(**/.env.*)",
+  "Read(**/*.pem)",
+  "Read(**/*.key)",
+  "Read(**/id_rsa*)",
+  "Read(**/id_ed25519*)",
+  "Read(**/.ssh/**)",
+  "Read(**/.aws/**)",
+  "Read(**/.config/gh/**)",
+  "Read(**/.codex/**)",
+  "Read(**/.claude/**)",
+  "Read(**/.claude.json)",
+  "Read(**/.daax/**)",
+  "Read(**/.daax-claude/**)",
+  "Read(**/.secrets*)",
+  "Read(**/credentials*)",
+  "Read(**/.npmrc)",
+  "Read(**/.netrc)",
+  "Read(**/.git-credentials)",
+] as const;
+
+/** Denied at every autonomy level. */
+export const ALWAYS_DENIED = [
+  "Bash",
+  "Edit",
+  "Write",
+  "NotebookEdit",
+  "WebFetch",
+  ...SECRET_PATH_DENY,
+] as const;
+
+/** MCP tool names that are never allowed, even in `act`. */
+const NEVER_MCP =
+  /(merge|delete|remove|push|deploy|release|archive|force|drop|destroy)/i;
+
+export interface ToolPolicy {
+  /** Claude-format allowed tool names (built-ins + mcp__server__tool). */
+  allowed: string[];
+  /** Claude-format denied tool names. */
+  denied: string[];
+  /** Per-server allowed MCP tool names (codex `enabled_tools`). */
+  mcpEnabled: Record<string, string[]>;
+}
+
+export function claudeToolName(server: string, tool: string): string {
+  return `mcp__${server}__${tool}`;
+}
+
+export function buildToolPolicy(
+  autonomy: WorkerAutonomy,
+  serverTools: Record<string, McpToolInfo[]>,
+): ToolPolicy {
+  const allowed: string[] = [...READ_BUILTINS];
+  const denied: string[] = [...ALWAYS_DENIED];
+  const mcpEnabled: Record<string, string[]> = {};
+
+  for (const [server, tools] of Object.entries(serverTools)) {
+    const enabled: string[] = [];
+    for (const t of tools) {
+      const permitted =
+        !NEVER_MCP.test(t.name) && (t.readOnly || autonomy === "act");
+      const name = claudeToolName(server, t.name);
+      if (permitted) {
+        enabled.push(t.name);
+        allowed.push(name);
+      } else {
+        denied.push(name);
+      }
+    }
+    mcpEnabled[server] = enabled;
+  }
+  return { allowed, denied, mcpEnabled };
+}
+
+const AUTONOMY_RULES: Record<WorkerAutonomy, string> = {
+  observe:
+    "Autonomy: OBSERVE. Report status only. Do not change anything and do not propose actions.",
+  propose:
+    "Autonomy: PROPOSE. Read anything you need. Do not change anything outside this report; put every recommended change under 'Next actions' for the operator to approve.",
+  act: "Autonomy: ACT. You may use the write tools you have been given (for example creating or editing Backlog.md tasks) when that clearly advances a goal. Never merge, push, deploy, release or delete. Record every change you made under 'Changes made'.",
+};
+
+const REPORT_FORMAT = `Write your final answer as a markdown report with these sections, in order:
+## Summary — two or three sentences.
+## Goals — a table: Goal | Status (on-track / at-risk / blocked / done) | Evidence (links, task ids, PR numbers).
+## Blockers and risks — each with its evidence and who can unblock it.
+## Decisions needed — questions only the operator can answer.
+## Next actions — at most three concrete steps.
+Cite evidence you actually read. If a tool failed or data was unavailable, say so instead of guessing.`;
+
+export function formatGoals(goals: WorkerGoal[]): string {
+  if (goals.length === 0) {
+    return "No goals are set. Report on the projects you can see, and propose goals under 'Decisions needed'.";
+  }
+  return goals
+    .map((g, i) => {
+      const parts = [`${i + 1}. ${g.title}`];
+      if (g.projectRef) parts.push(`   Project: ${g.projectRef}`);
+      if (g.description) parts.push(`   Detail: ${g.description}`);
+      if (g.successCriteria) parts.push(`   Done when: ${g.successCriteria}`);
+      return parts.join("\n");
+    })
+    .join("\n");
+}
+
+export interface RunPrompts {
+  system: string;
+  user: string;
+}
+
+export function buildPrompts(
+  worker: Pick<Worker, "name" | "instructions" | "autonomy">,
+  goals: WorkerGoal[],
+  trigger: RunTrigger,
+  input: string,
+  now: Date,
+  missingServers: string[] = [],
+  signals = "",
+): RunPrompts {
+  const system = [
+    `You are "${worker.name}", a digital worker running inside daax.`,
+    worker.instructions.trim(),
+    AUTONOMY_RULES[worker.autonomy],
+    REPORT_FORMAT,
+  ]
+    .filter(Boolean)
+    .join("\n\n");
+
+  const ask =
+    input ||
+    (trigger === "schedule" || trigger === "continuous"
+      ? "Scheduled check-in: review every active goal and produce the status report."
+      : "Produce the status report for the active goals.");
+
+  const user = [
+    `Current time (UTC): ${now.toISOString()}`,
+    `Active goals:\n${formatGoals(goals)}`,
+    missingServers.length
+      ? `Unavailable tools this run: ${missingServers.join(", ")}.`
+      : "",
+    signals
+      ? `Project signals (collected by daax just now; you have no shell):\n\n${signals}`
+      : "",
+    `Request (${trigger}): ${ask}`,
+  ]
+    .filter(Boolean)
+    .join("\n\n");
+
+  return { system, user };
+}
+
+/** Claude `--mcp-config` document for the resolved servers. */
+export function claudeMcpConfig(servers: ResolvedMcpServer[]): {
+  mcpServers: Record<string, unknown>;
+} {
+  const mcpServers: Record<string, unknown> = {};
+  for (const s of servers) {
+    mcpServers[s.id] =
+      s.type === "http"
+        ? { type: "http", url: s.url }
+        : { type: "stdio", command: s.command, args: s.args ?? [], env: s.env };
+  }
+  return { mcpServers };
+}
+
+function tomlString(s: string): string {
+  return JSON.stringify(s);
+}
+
+function tomlArray(items: string[]): string {
+  return `[${items.map(tomlString).join(", ")}]`;
+}
+
+/**
+ * Codex `config.toml` for an isolated, per-run CODEX_HOME (mode 0600, deleted
+ * after the run): only the worker's MCP servers, each restricted to its
+ * enabled tools, with its own env table — so one server's credentials reach
+ * that server only, never codex itself or other servers.
+ */
+export function codexConfigToml(
+  servers: ResolvedMcpServer[],
+  mcpEnabled: Record<string, string[]>,
+  model: string | null,
+): string {
+  const lines: string[] = [];
+  if (model) lines.push(`model = ${tomlString(model)}`);
+  lines.push('approval_policy = "never"', 'sandbox_mode = "read-only"', "");
+  for (const s of servers) {
+    lines.push(`[mcp_servers.${tomlString(s.id)}]`);
+    if (s.type === "http") {
+      lines.push(`url = ${tomlString(s.url ?? "")}`);
+    } else {
+      lines.push(`command = ${tomlString(s.command ?? "")}`);
+      lines.push(`args = ${tomlArray(s.args ?? [])}`);
+      const env = Object.entries(s.env);
+      if (env.length) {
+        lines.push(
+          `env = { ${env.map(([k, v]) => `${tomlString(k)} = ${tomlString(v)}`).join(", ")} }`,
+        );
+      }
+    }
+    // Only enabled_tools are exposed, so they are pre-approved: with
+    // approval_policy "never", codex would otherwise refuse every MCP call.
+    lines.push(
+      `enabled_tools = ${tomlArray(mcpEnabled[s.id] ?? [])}`,
+      'default_tools_approval_mode = "approve"',
+      "",
+    );
+  }
+  return lines.join("\n");
+}
+
+export interface EngineCommand {
+  command: string;
+  args: string[];
+}
+
+export function claudeCommand(opts: {
+  /** Execution nonce: the recovery marker on the command line (--session-id). */
+  nonce?: string;
+  prompts: RunPrompts;
+  mcpConfigPath: string;
+  policy: ToolPolicy;
+  model: string | null;
+}): EngineCommand {
+  const args = [
+    "-p",
+    opts.prompts.user,
+    "--output-format",
+    "stream-json",
+    "--verbose",
+    "--append-system-prompt",
+    opts.prompts.system,
+    "--setting-sources",
+    "",
+    "--mcp-config",
+    opts.mcpConfigPath,
+    "--strict-mcp-config",
+    "--permission-mode",
+    "dontAsk",
+    "--allowedTools",
+    ...opts.policy.allowed,
+    "--disallowedTools",
+    ...opts.policy.denied,
+  ];
+  if (opts.model) args.push("--model", opts.model);
+  if (opts.nonce) args.push("--session-id", opts.nonce);
+  return { command: "claude", args };
+}
+
+export function codexCommand(opts: {
+  prompts: RunPrompts;
+  workingDir: string;
+  lastMessagePath: string;
+}): EngineCommand {
+  return {
+    command: "codex",
+    args: [
+      "exec",
+      "--json",
+      "--skip-git-repo-check",
+      "--sandbox",
+      "read-only",
+      "-C",
+      opts.workingDir,
+      "-o",
+      opts.lastMessagePath,
+      // codex has no separate system prompt flag for exec; the role and rules
+      // lead the prompt.
+      `${opts.prompts.system}\n\n---\n\n${opts.prompts.user}`,
+    ],
+  };
+}
diff --git a/lib/workers/templates.ts b/lib/workers/templates.ts
new file mode 100644
index 0000000..92a8520
--- /dev/null
+++ b/lib/workers/templates.ts
@@ -0,0 +1,55 @@
+/**
+ * Worker templates. The Technical Project Manager is the first role
+ * (docs/plans/digital-workers.md §6). Templates are created disabled with
+ * `propose` autonomy; the operator enables them.
+ */
+
+import type { WorkerInput } from "./store";
+
+export const TPM_INSTRUCTIONS = `Role: Technical Project Manager.
+
+Mission: keep the operator's projects moving and visible. Know the state of every active goal, surface risks and blockers early, and propose the next concrete step.
+
+How to work:
+- Start from the active goals. For each goal, read its linked Backlog.md project: tasks by status, milestones, recent decisions.
+- Check delivery signals with read-only commands: open and recently merged PRs (\`gh pr list\`, \`gh pr view\`, \`gh pr checks\`), failing CI runs (\`gh run list\`), and recent commits (\`git log\`).
+- Classify each goal: on-track, at-risk, blocked, or done — and cite the evidence (task ids, PR numbers, run ids).
+- A goal is at-risk when work in progress has not moved in several days, CI is failing on its PRs, or tasks are blocked on a decision.
+- Name who or what unblocks each blocker. Separate decisions only the operator can make.
+- Keep it short. The operator reads this between other work.
+
+When asked a question (ad hoc or by voice), answer it directly first, in plain sentences, then include the report sections only if they add something.`;
+
+export const TPM_TEMPLATE: WorkerInput = {
+  slug: "tpm",
+  name: "Technical Project Manager",
+  role: "tpm",
+  description:
+    "Tracks goals across Backlog.md projects and GitHub, reports status, risks and blockers, and proposes next actions.",
+  instructions: TPM_INSTRUCTIONS,
+  engine: "claude-cli",
+  model: null,
+  runMode: "schedule",
+  // Weekdays 08:00 and 16:00 UTC.
+  cron: "0 8,16 * * 1-5",
+  cooldownSeconds: 1800,
+  maxRunsPerDay: 6,
+  timeoutSeconds: 900,
+  autonomy: "propose",
+  executor: "auto",
+  workingDir: null,
+  mcpServers: [
+    {
+      kind: "inline",
+      id: "backlog",
+      type: "stdio",
+      command: "backlog",
+      args: ["mcp", "start"],
+    },
+  ],
+  enabled: false,
+};
+
+export const WORKER_TEMPLATES: Record<string, WorkerInput> = {
+  tpm: TPM_TEMPLATE,
+};
diff --git a/lib/workers/workspace.ts b/lib/workers/workspace.ts
new file mode 100644
index 0000000..d74ab81
--- /dev/null
+++ b/lib/workers/workspace.ts
@@ -0,0 +1,16 @@
+import { existsSync } from "node:fs";
+import { homedir } from "node:os";
+import { join } from "node:path";
+
+/**
+ * The workspace root workers run inside. Same resolution order as
+ * instrumentation.ts (WORKSPACE_PATH → DAAX_WORKSPACE → /workspace → ~/prj).
+ */
+export function resolveWorkspaceRoot(
+  env: NodeJS.ProcessEnv = process.env,
+): string {
+  if (env.WORKSPACE_PATH) return env.WORKSPACE_PATH;
+  if (env.DAAX_WORKSPACE) return env.DAAX_WORKSPACE;
+  if (existsSync("/workspace")) return "/workspace";
+  return join(homedir(), "prj");
+}

hook: PostToolUse
hook: PostToolUse Completed
hook: PreToolUse
hook: PreToolUse Completed
exec
/bin/zsh -lc "cat lib/workers/runner.ts; sed -n '550,865p' lib/workers/cli-runner.ts; rg -n 'HTTP|initialized|schedule|cursor|force|nonce|MCP' .logs/reviews/codex-digital-workers-r*.md" in /Users/jasonpoley/prj/dx/src/daax-web
 succeeded in 0ms:
/**
 * Executes one queued run end to end: resolve tools, build the tool policy
 * and prompts, collect project signals, run the worker's engine, persist the
 * (redacted) event stream, record the outcome, and auto-pause a worker after
 * repeated automatic failures.
 *
 * One deadline covers the whole run — tool discovery, signal collection and
 * the engine — starting when the run is claimed.
 */

import { randomUUID } from "node:crypto";
import { realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { maskSecrets } from "@/lib/redaction/mask";
import { clip } from "./events";
import {
  ExecutionCleanupError,
  baseChildEnv,
  runCliEngine,
  runMarker,
  type CliRunResult,
} from "./cli-runner";
import {
  listServerTools,
  resolveMcpServers,
  type McpToolInfo,
  type ResolvedMcpServer,
} from "./mcp";
import { buildPrompts, buildToolPolicy } from "./plan";
import { runSdkEngine } from "./sdk-runner";
import { collectSignals } from "./signals";
import {
  appendRunEvent,
  finishRun,
  getRun,
  getWorker,
  listGoals,
  markRunStarted,
  recentFinishedStatuses,
  setExecutorRef,
  updateWorker,
} from "./store";
import { resolveWorkspaceRoot } from "./workspace";
import type { RunEvent, RunStatus, Worker, WorkerRun } from "@/types/workers";

/** Consecutive failed automatic runs before a worker is paused. */
export const FAILURE_PAUSE_THRESHOLD = 3;

export class WorkingDirError extends Error {}

/**
 * The worker's working directory: absolute or relative to the workspace root,
 * resolved through symlinks, and required to be an existing directory inside
 * the (also resolved) workspace root.
 */
export function resolveWorkingDir(
  worker: Pick<Worker, "workingDir">,
  root: string,
): string {
  let realRoot: string;
  try {
    realRoot = realpathSync(root);
  } catch {
    throw new WorkingDirError(`workspace root ${root} does not exist`);
  }
  if (!worker.workingDir) return realRoot;
  const target = isAbsolute(worker.workingDir)
    ? worker.workingDir
    : resolve(realRoot, worker.workingDir);
  let real: string;
  try {
    real = realpathSync(target);
  } catch {
    throw new WorkingDirError(`workingDir ${worker.workingDir} does not exist`);
  }
  const rel = relative(realRoot, real);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new WorkingDirError("workingDir is outside the workspace");
  }
  if (!statSync(real).isDirectory()) {
    throw new WorkingDirError(
      `workingDir ${worker.workingDir} is not a directory`,
    );
  }
  return real;
}

export function outcomeStatus(result: CliRunResult): RunStatus {
  if (result.cancelled) return "cancelled";
  if (result.timedOut) return "timeout";
  return result.final.ok ? "succeeded" : "failed";
}

/** Secret values that must never be stored in run history. */
export function knownSecretValues(
  servers: ResolvedMcpServer[],
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const values = servers.flatMap((s) => Object.values(s.env));
  for (const [k, v] of Object.entries(env)) {
    if (
      v &&
      /(TOKEN|SECRET|PASSWORD|API_KEY|DATABASE_URL|PRIVATE|CREDENTIAL)/.test(k)
    ) {
      values.push(v);
    }
  }
  // maskSecrets ignores values shorter than 4 characters.
  return values.filter((v) => v.length >= 4);
}

/** Redact secrets from any string inside an event (text and data). */
/**
 * Redact one stored string: first remove every known secret literal from the
 * RAW string (so values inside ANSI/OSC escape payloads, which the
 * presentation masker preserves, are gone too), then apply the pattern
 * masker for secrets of known shapes.
 */
export function redactString(s: string, knownValues: string[]): string {
  let out = s;
  for (const v of knownValues) {
    if (v.length >= 4 && out.includes(v)) out = out.split(v).join("[redacted]");
  }
  return maskSecrets(out, { knownValues });
}

/** Redact every string in a JSON-like value, keys included. */
export function redactValue<T>(value: T, knownValues: string[]): T {
  const mask = (s: string) => redactString(s, knownValues);
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") return mask(v);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>).map(([k, x]) => [
          // Keys are redacted too: tool-call arguments are structured.
          mask(k),
          walk(x),
        ]),
      );
    }
    return v;
  };
  return walk(value) as T;
}

/** Redact every string an event carries: text, tool, data keys and values. */
export function redactEvent(e: RunEvent, knownValues: string[]): RunEvent {
  const mask = (s: string) => redactString(s, knownValues);
  const walk = (v: unknown) => redactValue(v, knownValues);
  return {
    ...e,
    text: e.text === undefined ? undefined : clip(mask(e.text)),
    tool: e.tool === undefined ? undefined : mask(e.tool),
    data: e.data === undefined ? undefined : walk(e.data),
  };
}

/** Pause an automatic worker whose last N runs all failed. */
export async function applyFailurePolicy(worker: Worker): Promise<boolean> {
  if (worker.runMode === "adhoc" || !worker.enabled) return false;
  const recent = await recentFinishedStatuses(
    worker.id,
    FAILURE_PAUSE_THRESHOLD,
  );
  const failing =
    recent.length === FAILURE_PAUSE_THRESHOLD &&
    recent.every((s) => s === "failed" || s === "timeout");
  if (!failing) return false;
  await updateWorker(worker.id, {
    enabled: false,
    pausedReason: `paused after ${FAILURE_PAUSE_THRESHOLD} consecutive failed runs`,
  });
  return true;
}

export async function executeRun(
  runId: string,
  signal: AbortSignal,
): Promise<WorkerRun | null> {
  const run = await getRun(runId);
  if (!run || run.status !== "queued") return run;
  const worker = await getWorker(run.workerId);
  if (!worker) {
    return finishRun(runId, {
      status: "failed",
      error: "worker no longer exists",
    });
  }

  if (!(await markRunStarted(runId))) return getRun(runId);
  const timeoutMs = worker.timeoutSeconds * 1000;
  const startedAt = Date.now();
  const deadline = AbortSignal.timeout(timeoutMs);
  const runSignal = AbortSignal.any([signal, deadline]);
  const remainingMs = () => Math.max(1, timeoutMs - (Date.now() - startedAt));

  let secrets = knownSecretValues([]);
  const redact = (s: string | null | undefined) =>
    s == null ? s : redactString(s, secrets);
  let seq = 0;
  let engineVersion: string | undefined;
  const onEvent = async (e: RunEvent) => {
    const data = e.data as { version?: string } | undefined;
    if (e.type === "system" && typeof data?.version === "string")
      engineVersion = data.version;
    try {
      await appendRunEvent(runId, seq++, redactEvent(e, secrets));
    } catch (err) {
      console.error(
        "[workers] failed to store run event:",
        (err as Error).message,
      );
    }
  };
  const interrupted = (): RunStatus | null =>
    signal.aborted ? "cancelled" : deadline.aborted ? "timeout" : null;

  let status: RunStatus = "failed";
  try {
    const root = resolveWorkspaceRoot();
    const workingDir = resolveWorkingDir(worker, root);
    const goals = await listGoals(worker.id, "active");

    const { resolved, missing } = resolveMcpServers(
      worker.mcpServers,
      workingDir,
    );
    secrets = knownSecretValues(resolved);
    const serverTools: Record<string, McpToolInfo[]> = {};
    const usable: ResolvedMcpServer[] = [];
    for (const server of resolved) {
      if (runSignal.aborted) break;
      try {
        serverTools[server.id] = await listServerTools(server, {
          cwd: workingDir,
          signal: runSignal,
        });
        usable.push(server);
      } catch (err) {
        // Fail closed: a server whose tools cannot be listed cannot be
        // classified, so it is not given to the engine at all.
        missing.push(`${server.id} (${(err as Error).message})`);
      }
    }
    for (const m of missing)
      await onEvent({ type: "system", text: `MCP server unavailable: ${m}` });

    const policy = buildToolPolicy(worker.autonomy, serverTools);
    await onEvent({
      type: "system",
      text: `tool policy: ${policy.allowed.length} allowed, ${policy.denied.length} denied (${worker.autonomy})`,
      data: { mcpEnabled: policy.mcpEnabled },
    });

    const signals = runSignal.aborted
      ? ""
      : await collectSignals(workingDir, baseChildEnv(), runSignal);
    const early = interrupted();
    if (early) {
      status = early;
      return await finishRun(runId, {
        status,
        error:
          early === "timeout"
            ? `timed out after ${worker.timeoutSeconds}s`
            : "cancelled by operator",
      });
    }

    const prompts = buildPrompts(
      worker,
      goals,
      run.trigger,
      run.input,
      new Date(),
      missing,
      signals,
    );
    // A fresh random nonce per execution is the marker recovery uses to find
    // this run's agent by its command line (lib/workers/cli-runner.ts). It
    // exists only in the executor reference, so nothing else can match it.
    const nonce = randomUUID();
    // The nonce must never be stored or shown (it is what makes the marker
    // unforgeable): redact it everywhere from here on.
    secrets = [...secrets, nonce];
    prompts.system += `\n\n(${runMarker(nonce)})`;
    const common = {
      model: worker.model,
      workingDir,
      prompts,
      policy,
      servers: usable,
      timeoutMs: remainingMs(),
      // The combined signal, so the run's single deadline also covers engine
      // start-up; the runner decides timeout vs cancel below.
      signal: runSignal,
      onEvent,
    };
    const result =
      worker.engine === "agent-sdk"
        ? await runSdkEngine({
            ...common,
            runId,
            nonce,
            onExecutor: (ref) => setExecutorRef(runId, ref),
          })
        : await runCliEngine({
            ...common,
            runId,
            engine: worker.engine,
            executor: worker.executor,
            nonce,
            onExecutor: (ref) => setExecutorRef(runId, ref),
          });

    status = interrupted() ?? outcomeStatus(result);
    const error =
      status === "timeout"
        ? `timed out after ${worker.timeoutSeconds}s`
        : status === "cancelled"
          ? "cancelled by operator"
          : result.final.error;
    return await finishRun(runId, {
      status,
      summary: redact(result.final.summary),
      error: status === "succeeded" ? null : redact(error),
      // Every stored value is redacted, engine-reported metadata included.
      usage: redactValue({ ...result.final.usage, engineVersion }, secrets),
    });
  } catch (err) {
    const message = redact(
      err instanceof Error ? err.message : String(err),
    ) as string;
    await onEvent({ type: "error", text: message });
    if (err instanceof ExecutionCleanupError) {
      // Keep the run active (one-run-per-worker exclusion holds) until the
      // leader's reconciliation verifies the execution stopped.
      status = "running";
      return getRun(runId);
    }
    return finishRun(runId, { status: "failed", error: message });
  } finally {
    if (status === "failed" || status === "timeout") {
      const fresh = await getWorker(worker.id).catch(() => null);
      if (fresh) await applyFailurePolicy(fresh).catch(() => false);
    }
  }
}
}

function groupAlive(pgid: number): boolean {
  try {
    process.kill(-pgid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * Stop an orphaned execution and wait until it is really gone (recovery).
 * Host groups get SIGTERM, then SIGKILL after 10 s; throws if the group is
 * still alive after 15 s so the run is not released while it executes.
 */
export async function stopExecutionAndWait(
  ref: string,
  sleep: (ms: number) => Promise<void> = (ms) =>
    new Promise((r) => setTimeout(r, ms)),
): Promise<void> {
  if (ref.startsWith("container:")) {
    const name = ref.slice("container:".length);
    const rm = spawnSync("docker", ["rm", "-f", name], { encoding: "utf8" });
    if (rm.status !== 0 && !/No such container/i.test(rm.stderr ?? "")) {
      throw new Error(
        `cannot remove container ${name}: ${(rm.stderr ?? "").trim()}`,
      );
    }
    return;
  }
  const pgid = parseHostRef(ref)?.pgid;
  if (!pgid) return;
  const signal = (sig: NodeJS.Signals) => {
    try {
      process.kill(-pgid, sig);
    } catch {
      // already gone
    }
  };
  signal("SIGTERM");
  for (let waited = 0; waited < 15_000; waited += 250) {
    if (!groupAlive(pgid)) return;
    if (waited === 10_000) signal("SIGKILL");
    await sleep(250);
  }
  if (groupAlive(pgid)) throw new Error(`process group ${pgid} did not exit`);
}

/** Split a byte stream into complete lines. */
function lineSplitter(onLine: (line: string) => void) {
  let buffer = "";
  return {
    push(chunk: Buffer) {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const l of lines) if (l.trim()) onLine(l);
    },
    flush() {
      if (buffer.trim()) onLine(buffer);
      buffer = "";
    },
  };
}

const cancelledResult = (): CliRunResult => ({
  final: { ok: false, summary: null, error: "cancelled", usage: {} },
  timedOut: false,
  cancelled: true,
});

export async function runCliEngine(input: CliRunInput): Promise<CliRunResult> {
  const mode = resolveExecutor(input.executor);
  if (mode === "container" && !HOST_WORKSPACE_PATH) {
    throw new Error(
      "the container executor needs daax running in container mode (HOST_WORKSPACE_PATH is not set); use executor auto or host",
    );
  }
  if (input.signal.aborted) return cancelledResult();

  const dir = makeRunDir(input.runId, mode);
  const containerName = `daax-w-${randomBytes(4).toString("hex")}`;
  let prepared: Prepared | null = null;

  try {
    prepared = prepare(input, mode, dir);
    const env = { ...baseChildEnv(), ...prepared.env };
    const command = mode === "host" ? hostBinary(prepared.command) : "docker";
    const args =
      mode === "host"
        ? prepared.args
        : dockerArgs(
            input.runId,
            containerName,
            dir,
            input.workingDir,
            prepared,
          );

    await input.onEvent({
      type: "system",
      text: `starting ${input.engine} (${mode})`,
      data: {
        executor: mode,
        workingDir: input.workingDir,
        container: mode === "container" ? containerName : undefined,
      },
    });
    if (input.signal.aborted) return cancelledResult();

    // Where the run will execute is recorded BEFORE spawning, so a crash at
    // any point afterwards leaves a reference recovery can act on. If it
    // cannot be recorded, nothing is started.
    if (input.onExecutor) {
      // Bounded by the run's cancel/deadline signal: a write that never
      // completes cannot hold the run past its deadline.
      const aborted = new Promise<"aborted">((resolve) => {
        if (input.signal.aborted) resolve("aborted");
        input.signal.addEventListener("abort", () => resolve("aborted"), {
          once: true,
        });
      });
      const recorded = await Promise.race([
        input
          .onExecutor(
            mode === "container"
              ? `container:${containerName}`
              : hostRef(null, null, input.nonce),
          )
          .then(() => "recorded" as const),
        aborted,
      ]);
      if (recorded === "aborted") return cancelledResult();
    }
    if (input.signal.aborted) return cancelledResult();

    const child = spawn(command, args, {
      cwd: mode === "host" ? input.workingDir : undefined,
      env: env as NodeJS.ProcessEnv,
      stdio: ["ignore", "pipe", "pipe"],
      // Own process group on the host, so stop() reaches every descendant.
      detached: mode === "host",
    });

    // Everything below up to the first await is synchronous, so no exit,
    // output, cancel or timeout can be missed while something else awaits.
    const stderrTail = new LineTail(16_000);
    // Resolve on process exit plus a short grace for buffered output, so a
    // descendant holding the pipes open cannot keep the run alive.
    const exited = new Promise<number | null>((resolve) => {
      let done = false;
      const finish = (code: number | null) => {
        if (done) return;
        done = true;
        resolve(code);
      };
      child.on("error", (err) => {
        stderrTail.push(`\n${err.message}\n`);
        finish(-1);
      });
      child.on("close", (code) => finish(code));
      child.on("exit", (code) => {
        setTimeout(() => finish(code), 2_000).unref();
      });
    });

    // Host refs carry the process start time so recovery can tell this
    // process group from a later one that reuses the pid.
    const startTime =
      mode === "host" && child.pid ? processStartTime(child.pid) : null;
    const ref =
      mode === "container"
        ? `container:${containerName}`
        : hostRef(child.pid ?? null, startTime, input.nonce);

    const codexAcc = new CodexAccumulator();
    let claudeFinal: Final | undefined;
    // Events are persisted in order; a chain keeps writes sequential.
    let chain = Promise.resolve();
    const emit = (e: RunEvent) => {
      chain = chain.then(() => input.onEvent(e)).catch(() => undefined);
    };

    let lineCount = 0;
    const splitter = lineSplitter((line) => {
      lineCount++;
      let json: unknown;
      try {
        json = JSON.parse(line);
      } catch {
        return;
      }
      const parsed =
        input.engine === "claude-cli"
          ? mapClaudeMessage(json)
          : mapCodexMessage(json);
      if (input.engine === "codex-cli") codexAcc.add(parsed);
      if (parsed.final) claudeFinal = parsed.final;
      parsed.events.forEach(emit);
    });
    child.stdout.on("data", (c: Buffer) => splitter.push(c));
    child.stderr.on("data", (c: Buffer) => {
      stderrTail.push(c.toString());
    });

    let timedOut = false;
    let cancelled = false;
    const control = stopController(
      () => ref,
      () => child.kill("SIGTERM"),
    );
    const stop = () => control.stop();
    const timer = setTimeout(
      () => {
        timedOut = true;
        stop();
      },
      Math.max(1, input.timeoutMs),
    );
    const onAbort = () => {
      cancelled = true;
      stop();
    };
    input.signal.addEventListener("abort", onAbort, { once: true });
    if (input.signal.aborted) onAbort();

    // Recording where the run executes must never block its lifecycle. If it
    // cannot be recorded, recovery could not find the execution later, so it
    // is stopped now.
    let unrecorded = false;
    if (mode === "host" && child.pid && input.onExecutor) {
      input.onExecutor(ref).catch(() => {
        // Ignored once cleanup is verified: never signal a group that may
        // since have been reused.
        if (control.settled) return;
        unrecorded = true;
        stop();
      });
    }

    const exitCode = await exited;
    const stderr = stderrTail.toString();
    clearTimeout(timer);
    input.signal.removeEventListener("abort", onAbort);
    // Anything the agent left running goes with it — verified, so a run is
    // never released while its execution may still be alive.
    try {
      await stopExecutionAndWait(ref);
    } catch (err) {
      throw new ExecutionCleanupError(ref, (err as Error).message);
    }
    control.settle();
    splitter.flush();
    await chain;
    await input.onEvent({
      type: "system",
      text: `${input.engine} exited (${exitCode ?? "signal"}), ${lineCount} output line(s)`,
      data: {
        exitCode,
        lines: lineCount,
        // Redacted (then clipped) by the runner before it is stored.
        stderr: stderr.trim() || undefined,
      },
    });

    let final: Final;
    if (input.engine === "claude-cli") {
      final = claudeFinal ?? {
        ok: false,
        summary: null,
        error: `claude exited (${exitCode}) without a result${stderr ? `: ${stderr.trim()}` : ""}`,
        usage: {},
      };
    } else {
      final = codexAcc.final();
      const last = prepared.lastMessagePath;
      // `last` is a runtime temp file, not a bundled asset: keep Turbopack from tracing the project.
      if (last && existsSync(/*turbopackIgnore: true*/ last)) {
        const text = readFileSync(
          /*turbopackIgnore: true*/ last,
          "utf8",
        ).trim();
        if (text) final = { ...final, summary: text };
      }
      if (exitCode !== 0 || !final.ok) {
        const detail = stderr
          .replace(/^Reading additional input from stdin\.\.\.\s*/m, "")
          .trim();
        final = {
          ...final,
          ok: false,
          error: `${final.error ?? `codex exited (${exitCode})`}${exitCode !== 0 ? ` [exit ${exitCode}]` : ""}${detail ? `: ${detail}` : ""}`,
        };
      }
    }
    if (unrecorded && !timedOut) {
      final = {
        ...final,
        ok: false,
        error: "stopped: where the run executes could not be recorded",
      };
    }
    return { final, timedOut, cancelled: cancelled && !unrecorded };
  } finally {
    try {
      prepared?.afterRun();
    } catch (err) {
      console.error(
        "[workers] codex auth write-back failed:",
        (err as Error).message,
      );
    }
    rmSync(dir.local, { recursive: true, force: true });
  }
}
.logs/reviews/codex-digital-workers-r12.md:7:| Prompt text mistaken for execution ownership | **FIXED for the reported disclosure route** | The exposed nonce can no longer be copied from these payloads. Matching still accepts markers anywhere in engine command lines and relies on nonce secrecy: [cli-runner.ts:368](/Users/jasonpoley/prj/dx/src/daax-web/lib/workers/cli-runner.ts:368). |
.logs/reviews/codex-digital-workers-r12.md:18:| Unresolved `host:pending` | **FIXED** | Ambiguity throws at [cli-runner.ts:452](/Users/jasonpoley/prj/dx/src/daax-web/lib/workers/cli-runner.ts:452); exclusion remains at [scheduler.ts:202](/Users/jasonpoley/prj/dx/src/daax-web/lib/workers/scheduler.ts:202). |
.logs/reviews/codex-digital-workers-r12.md:21:| MCP trust boundary | **ACCEPTED-RESIDUAL** | Credential boundary remains documented at [digital-workers.md:292](/Users/jasonpoley/prj/dx/src/daax-web/docs/plans/digital-workers.md:292). |
.logs/reviews/codex-digital-workers-r12.md:23:Nine in-memory cases passed across all three engine dispatches, using real mappers/redaction with mocked engines and storage. Event and completion payloads contained no nonce; numeric usage remained intact. Wrapper rejection, pending-reference ambiguity and the settlement guard also passed.
.logs/reviews/codex-digital-workers-r13.md:44:| Prompt text mistaken for execution ownership | **FIXED for the reported disclosure route** | The exposed nonce can no longer be copied from these payloads. Matching still accepts markers anywhere in engine command lines and relies on nonce secrecy: [cli-runner.ts:368](/Users/jasonpoley/prj/dx/src/daax-web/lib/workers/cli-runner.ts:368). |
.logs/reviews/codex-digital-workers-r13.md:55:| Unresolved `host:pending` | **FIXED** | Ambiguity throws at [cli-runner.ts:452](/Users/jasonpoley/prj/dx/src/daax-web/lib/workers/cli-runner.ts:452); exclusion remains at [scheduler.ts:202](/Users/jasonpoley/prj/dx/src/daax-web/lib/workers/scheduler.ts:202). |
.logs/reviews/codex-digital-workers-r13.md:58:| MCP trust boundary | **ACCEPTED-RESIDUAL** | Credential boundary remains documented at [digital-workers.md:292](/Users/jasonpoley/prj/dx/src/daax-web/docs/plans/digital-workers.md:292). |
.logs/reviews/codex-digital-workers-r13.md:60:Nine in-memory cases passed across all three engine dispatches, using real mappers/redaction with mocked engines and storage. Event and completion payloads contained no nonce; numeric usage remained intact. Wrapper rejection, pending-reference ambiguity and the settlement guard also passed.
.logs/reviews/codex-digital-workers-r13.md:91:1. Backlog.md — managed via the `backlog` CLI / MCP server (config: `backlog/config.yml`, project `daax-web`). Tasks live under `backlog/tasks/`. Read `backlog://workflow/overview` (MCP resource) or call `backlog.get_workflow_overview()` before working a task. Never edit task files directly — use the CLI.
.logs/reviews/codex-digital-workers-r13.md:157: lib/workers/scheduler.ts                     | 374 ++++++++++++
.logs/reviews/codex-digital-workers-r13.md:200:+ *   DAAX_WS_TOKEN_SECRET, ...) are never passed to an agent. MCP server
.logs/reviews/codex-digital-workers-r13.md:205:+ *   a new scheduler leader can remove orphans.
.logs/reviews/codex-digital-workers-r13.md:266:+  nonce: string;
.logs/reviews/codex-digital-workers-r13.md:280:+/** An executor reference without its secret nonce, safe to show or store. */
.logs/reviews/codex-digital-workers-r13.md:399:+  /** Engine env on top of the base env (never MCP credentials). */
.logs/reviews/codex-digital-workers-r13.md:416:+      nonce: input.nonce,
.logs/reviews/codex-digital-workers-r13.md:425:+  // codex: an isolated CODEX_HOME holding only this worker's MCP servers.
.logs/reviews/codex-digital-workers-r13.md:515:+ * Host executor refs: `host:pending#<nonce>` (recorded before spawn) and
.logs/reviews/codex-digital-workers-r13.md:516:+ * `host:<pgid>|<start time>#<nonce>` (after spawn). The nonce is a fresh
.logs/reviews/codex-digital-workers-r13.md:521:+): { pgid: number | null; start: string | null; nonce: string | null } | null {
.logs/reviews/codex-digital-workers-r13.md:523:+  const [body, nonce = null] = ref.slice("host:".length).split("#");
.logs/reviews/codex-digital-workers-r13.md:524:+  if (body === "pending") return { pgid: null, start: null, nonce };
.logs/reviews/codex-digital-workers-r13.md:528:+  return { pgid, start: rest.length ? rest.join("|") : null, nonce };
.logs/reviews/codex-digital-workers-r13.md:534:+  nonce: string,
.logs/reviews/codex-digital-workers-r13.md:537:+  return `host:${body}#${nonce}`;
.logs/reviews/codex-digital-workers-r13.md:541:+export function runMarker(nonce: string): string {
.logs/reviews/codex-digital-workers-r13.md:542:+  return `daax-run:${nonce}`;
.logs/reviews/codex-digital-workers-r13.md:554:+ * Is this command line an engine process carrying this execution's nonce?
.logs/reviews/codex-digital-workers-r13.md:557:+ *  - The nonce appears as `(daax-run:<nonce>)` or as the `--session-id`
.logs/reviews/codex-digital-workers-r13.md:558:+ *    token. The nonce is a random UUID that exists only in the executor
.logs/reviews/codex-digital-workers-r13.md:561:+export function isEngineCommandFor(command: string, nonce: string): boolean {
.logs/reviews/codex-digital-workers-r13.md:567:+  if (command.includes(`(${runMarker(nonce)})`)) return true;
.logs/reviews/codex-digital-workers-r13.md:570:+      t === `--session-id=${nonce}` ||
.logs/reviews/codex-digital-workers-r13.md:571:+      (t === "--session-id" && tokens[i + 1] === nonce),
.logs/reviews/codex-digital-workers-r13.md:579:+ * Engine processes carrying this execution's nonce. Throws if the process
.logs/reviews/codex-digital-workers-r13.md:583:+  nonce: string,
.logs/reviews/codex-digital-workers-r13.md:594:+    if (m && isEngineCommandFor(m[3], nonce)) {
.logs/reviews/codex-digital-workers-r13.md:607:+ * until an operator force-releases it.
.logs/reviews/codex-digital-workers-r13.md:613:+    find?: (nonce: string) => { pid: number; pgid: number }[];
.logs/reviews/codex-digital-workers-r13.md:633:+  if (!parsed?.nonce) {
.logs/reviews/codex-digital-workers-r13.md:634:+    // Without its nonce the execution cannot be identified: never signal.
.logs/reviews/codex-digital-workers-r13.md:636:+      `run ${runId} has no execution marker recorded; force-release once confirmed stopped`,
.logs/reviews/codex-digital-workers-r13.md:639:+  const nonce = parsed.nonce;
.logs/reviews/codex-digital-workers-r13.md:640:+  const marked = find(nonce);
.logs/reviews/codex-digital-workers-r13.md:646:+        `run ${runId} was starting when daax stopped and its process group is unknown; force-release once confirmed stopped`,
.logs/reviews/codex-digital-workers-r13.md:651:+        `process group ${parsed.pgid} is alive but carries no marker for run ${runId}; not signalled — force-release the run once it is confirmed stopped`,
.logs/reviews/codex-digital-workers-r13.md:659:+    if (find(nonce).length === 0 && groups.every((g) => !alive(g))) return;
.logs/reviews/codex-digital-workers-r13.md:871:+              : hostRef(null, null, input.nonce),
.logs/reviews/codex-digital-workers-r13.md:917:+        : hostRef(child.pid ?? null, startTime, input.nonce);
.logs/reviews/codex-digital-workers-r13.md:1056:+    rmSync(dir.local, { recursive: true, force: true });
.logs/reviews/codex-digital-workers-r13.md:1311:+      await onEvent({ type: "system", text: `MCP server unavailable: ${m}` });
.logs/reviews/codex-digital-workers-r13.md:1344:+    // A fresh random nonce per execution is the marker recovery uses to find
.logs/reviews/codex-digital-workers-r13.md:1347:+    const nonce = randomUUID();
.logs/reviews/codex-digital-workers-r13.md:1348:+    // The nonce must never be stored or shown (it is what makes the marker
.logs/reviews/codex-digital-workers-r13.md:1350:+    secrets = [...secrets, nonce];
.logs/reviews/codex-digital-workers-r13.md:1351:+    prompts.system += `\n\n(${runMarker(nonce)})`;
.logs/reviews/codex-digital-workers-r13.md:1369:+            nonce,
.logs/reviews/codex-digital-workers-r13.md:1377:+            nonce,
.logs/reviews/codex-digital-workers-r13.md:1455:+  nonce: string;
.logs/reviews/codex-digital-workers-r13.md:1536:+        .onExecutor(hostRef(null, null, input.nonce))
.logs/reviews/codex-digital-workers-r13.md:1558:+  // MCP server credentials are passed per server via mcpServers, never here.
.logs/reviews/codex-digital-workers-r13.md:1580:+        // The execution nonce on the child's command line
.logs/reviews/codex-digital-workers-r13.md:1581:+        // (--session-id=<nonce>) is the recovery marker.
.logs/reviews/codex-digital-workers-r13.md:1582:+        sessionId: input.nonce,
.logs/reviews/codex-digital-workers-r13.md:1607:+            ref = hostRef(pid, start, input.nonce);
.logs/reviews/codex-digital-workers-r13.md:1671:    "prebuild": "node -e \"const fs=require('fs'); if (fs.existsSync('3rd-party/safe-mcp')) { require('child_process').execSync('bun run parse:safe-mcp', { stdio: 'inherit' }); } else { console.log('Skipping SAFE-MCP parse (3rd-party/safe-mcp not found)'); }\"",
.logs/reviews/codex-digital-workers-r13.md:1825:tests/lib/workers/scheduler.test.ts
.logs/reviews/codex-digital-workers-r13.md:1833:tests/components/workers/schedule.test.ts
.logs/reviews/codex-digital-workers-r13.md:1837:tests/lib/workers/scheduler.test.ts
.logs/reviews/codex-digital-workers-r13.md:1855:MCP tool call requires approval, but approval policy is never
.logs/reviews/codex-digital-workers-r13.md:2384:+/** Automatic (schedule/continuous) runs queued since `since`. */
.logs/reviews/codex-digital-workers-r13.md:2391:+      WHERE worker_id = $1 AND trigger IN ('schedule','continuous') AND queued_at >= $2`,
.logs/reviews/codex-digital-workers-r13.md:2546:+const MCP_ID_RE = /^[A-Za-z0-9_.-]{1,64}$/;
.logs/reviews/codex-digital-workers-r13.md:2642:+      !MCP_ID_RE.test(raw.id)
.logs/reviews/codex-digital-workers-r13.md:2644:+      errors.push(`${at}.id must match ${MCP_ID_RE}`);
.logs/reviews/codex-digital-workers-r13.md:2775:+  // container mode). Confinement is enforced at run time on the real path.
.logs/reviews/codex-digital-workers-r13.md:2805:+  if (mode === "schedule" && !patch.cron) {
.logs/reviews/codex-digital-workers-r13.md:2806:+    errors.push("cron is required when runMode is schedule");
.logs/reviews/codex-digital-workers-r13.md:2838:+  if (w.runMode === "schedule" && !w.cron) {
.logs/reviews/codex-digital-workers-r13.md:2839:+    return "cron is required when runMode is schedule";
.logs/reviews/codex-digital-workers-r13.md:2892:+ *                       autonomy, MCP server set. mcp_servers holds refs or
.logs/reviews/codex-digital-workers-r13.md:2951:+    check: "run_mode IN ('schedule','adhoc','continuous')",
.logs/reviews/codex-digital-workers-r13.md:3014:+    // stop orphaned executions when a new scheduler leader takes over.
.logs/reviews/codex-digital-workers-r13.md:3024:+    check: "trigger IN ('schedule','adhoc','continuous','cli','voice')",
.logs/reviews/codex-digital-workers-r13.md:3030:+  // At most one queued/running run per worker, enforced by the database.
.logs/reviews/codex-digital-workers-r13.md:3065:/bin/zsh -lc 'git diff ccab6ec..HEAD -- lib/workers app/api/workers app/workers components/workers migrations/1781568000400_digital-workers.js scripts/workers-cli.ts; git diff origin/main...HEAD -- lib/workers/http.ts lib/workers/service.ts lib/workers/scheduler.ts lib/workers/signals.ts app/api/workers' in /Users/jasonpoley/prj/dx/src/daax-web
.logs/reviews/codex-digital-workers-r13.md:3321:+ * POST answers 202 with the queued run; the scheduler leader executes it.
.logs/reviews/codex-digital-workers-r13.md:3332:+import { getScheduler } from "@/lib/workers/scheduler";
.logs/reviews/codex-digital-workers-r13.md:3409:+import { getScheduler } from "@/lib/workers/scheduler";
.logs/reviews/codex-digital-workers-r13.md:3432:+      schedulerLeader: getScheduler().isLeader(),
.logs/reviews/codex-digital-workers-r13.md:3488:+import { getScheduler } from "@/lib/workers/scheduler";
.logs/reviews/codex-digital-workers-r13.md:3521:+ * DELETE cancels a run (workers:run). With `?force=1` (workers:manage) it
.logs/reviews/codex-digital-workers-r13.md:3522:+ * force-releases a run that recovery keeps locked because its execution
.logs/reviews/codex-digital-workers-r13.md:3527:+  const force = new URL(request.url).searchParams.get("force") === "1";
.logs/reviews/codex-digital-workers-r13.md:3528:+  const auth = await requireRole(force ? "workers:manage" : "workers:run", {
.logs/reviews/codex-digital-workers-r13.md:3542:+    const scheduler = getScheduler();
.logs/reviews/codex-digital-workers-r13.md:3543:+    if (force) {
.logs/reviews/codex-digital-workers-r13.md:3544:+      if (scheduler.isExecuting(runId)) {
.logs/reviews/codex-digital-workers-r13.md:3552:+        `force-released by ${auth.user.username ?? "operator"}`,
.logs/reviews/codex-digital-workers-r13.md:3557:+    const cancelled = await scheduler.cancel(runId);
.logs/reviews/codex-digital-workers-r13.md:3662:diff --git a/lib/workers/scheduler.ts b/lib/workers/scheduler.ts
.logs/reviews/codex-digital-workers-r13.md:3666:+++ b/lib/workers/scheduler.ts
.logs/reviews/codex-digital-workers-r13.md:3669:+ * Worker scheduler (docs/plans/digital-workers.md §4.1, §4.5).
.logs/reviews/codex-digital-workers-r13.md:3742:+  if (worker.runMode === "schedule") {
.logs/reviews/codex-digital-workers-r13.md:3762:+  if (worker.runMode === "schedule" && worker.cron) {
.logs/reviews/codex-digital-workers-r13.md:3782:+  /** Per-worker schedule cursor: fires in (cursor, now] are due. */
.logs/reviews/codex-digital-workers-r13.md:3786:+  /** Only a started scheduler leads or executes (WORKERS_SCHEDULER=off). */
.logs/reviews/codex-digital-workers-r13.md:3842:+      `[workers] scheduler leadership lost (${reason}); aborting in-flight runs`,
.logs/reviews/codex-digital-workers-r13.md:3879:+          "interrupted: execution was stopped by the scheduler",
.logs/reviews/codex-digital-workers-r13.md:3911:+        `[workers] scheduler leadership acquired${failed ? ` (${failed} interrupted run(s) marked failed)` : ""}`,
.logs/reviews/codex-digital-workers-r13.md:3964:+      console.error("[workers] scheduler tick failed:", (err as Error).message);
.logs/reviews/codex-digital-workers-r13.md:3983:+      // back-filled: each worker's cursor starts at leadership.
.logs/reviews/codex-digital-workers-r13.md:3991:+          worker.runMode === "schedule" ? "schedule" : "continuous";
.logs/reviews/codex-digital-workers-r13.md:3992:+        await createRun(worker, trigger, "", "scheduler");
.logs/reviews/codex-digital-workers-r13.md:3995:+          // Leave this worker's cursor where it was; retry next pass.
.logs/reviews/codex-digital-workers-r13.md:4031:+const GLOBAL_KEY = Symbol.for("daax.workers.scheduler");
.logs/reviews/codex-digital-workers-r13.md:4036:+/** The process-wide scheduler (survives dev hot reloads). */
.logs/reviews/codex-digital-workers-r13.md:4054:+import { nextRunAt } from "./scheduler";
.logs/reviews/codex-digital-workers-r13.md:4238:/bin/zsh -lc 'cat lib/workers/scheduler.ts lib/workers/service.ts lib/workers/signals.ts' in /Users/jasonpoley/prj/dx/src/daax-web
.logs/reviews/codex-digital-workers-r13.md:4241: * Worker scheduler (docs/plans/digital-workers.md §4.1, §4.5).
.logs/reviews/codex-digital-workers-r13.md:4314:  if (worker.runMode === "schedule") {
.logs/reviews/codex-digital-workers-r13.md:4334:  if (worker.runMode === "schedule" && worker.cron) {
.logs/reviews/codex-digital-workers-r13.md:4354:  /** Per-worker schedule cursor: fires in (cursor, now] are due. */
.logs/reviews/codex-digital-workers-r13.md:4358:  /** Only a started scheduler leads or executes (WORKERS_SCHEDULER=off). */
.logs/reviews/codex-digital-workers-r13.md:4414:      `[workers] scheduler leadership lost (${reason}); aborting in-flight runs`,
.logs/reviews/codex-digital-workers-r13.md:4451:          "interrupted: execution was stopped by the scheduler",
.logs/reviews/codex-digital-workers-r13.md:4483:        `[workers] scheduler leadership acquired${failed ? ` (${failed} interrupted run(s) marked failed)` : ""}`,
.logs/reviews/codex-digital-workers-r13.md:4536:      console.error("[workers] scheduler tick failed:", (err as Error).message);
.logs/reviews/codex-digital-workers-r13.md:4555:      // back-filled: each worker's cursor starts at leadership.
.logs/reviews/codex-digital-workers-r13.md:4563:          worker.runMode === "schedule" ? "schedule" : "continuous";
.logs/reviews/codex-digital-workers-r13.md:4564:        await createRun(worker, trigger, "", "scheduler");
.logs/reviews/codex-digital-workers-r13.md:4567:          // Leave this worker's cursor where it was; retry next pass.
.logs/reviews/codex-digital-workers-r13.md:4603:const GLOBAL_KEY = Symbol.for("daax.workers.scheduler");
.logs/reviews/codex-digital-workers-r13.md:4608:/** The process-wide scheduler (survives dev hot reloads). */
.logs/reviews/codex-digital-workers-r13.md:4620:import { nextRunAt } from "./scheduler";
.logs/reviews/codex-digital-workers-r13.md:5312:/** Automatic (schedule/continuous) runs queued since `since`. */
.logs/reviews/codex-digital-workers-r13.md:5319:      WHERE worker_id = $1 AND trigger IN ('schedule','continuous') AND queued_at >= $2`,
.logs/reviews/codex-digital-workers-r13.md:5438:+ * Worker MCP servers: resolve a worker's server list to concrete launch
.logs/reviews/codex-digital-workers-r13.md:5455:+ * never passed through to a worker's MCP servers, whatever a worker requests.
.logs/reviews/codex-digital-workers-r13.md:5618:+        missing.push(`${s.id} (not found in MCP configuration)`);
.logs/reviews/codex-digital-workers-r13.md:5657:+  Number(process.env.WORKERS_MCP_LIST_TIMEOUT_MS) || 30_000;
.logs/reviews/codex-digital-workers-r13.md:5713:+          send({ jsonrpc: "2.0", method: "notifications/initialized" });
.logs/reviews/codex-digital-workers-r13.md:5765:+    if (!res.ok) throw new Error(`HTTP ${res.status}`);
.logs/reviews/codex-digital-workers-r13.md:5767:+    // Streamable HTTP may answer with an SSE frame; take the first data line.
.logs/reviews/codex-digital-workers-r13.md:5817:+ * deny lists for the worker's autonomy level, and the MCP server set.
.logs/reviews/codex-digital-workers-r13.md:5819:+ * Write limits are enforced through the engine's own permission controls
.logs/reviews/codex-digital-workers-r13.md:5837:+ * daax itself (lib/workers/signals.ts). Writes in `act` go through MCP tools.
.logs/reviews/codex-digital-workers-r13.md:5874:+/** MCP tool names that are never allowed, even in `act`. */
.logs/reviews/codex-digital-workers-r13.md:5875:+const NEVER_MCP =
.logs/reviews/codex-digital-workers-r13.md:5876:+  /(merge|delete|remove|push|deploy|release|archive|force|drop|destroy)/i;
.logs/reviews/codex-digital-workers-r13.md:5883:+  /** Per-server allowed MCP tool names (codex `enabled_tools`). */
.logs/reviews/codex-digital-workers-r13.md:5903:+        !NEVER_MCP.test(t.name) && (t.readOnly || autonomy === "act");
.logs/reviews/codex-digital-workers-r13.md:5973:+    (trigger === "schedule" || trigger === "continuous"
.logs/reviews/codex-digital-workers-r13.md:6018:+ * after the run): only the worker's MCP servers, each restricted to its
.logs/reviews/codex-digital-workers-r13.md:6045:+    // approval_policy "never", codex would otherwise refuse every MCP call.
.logs/reviews/codex-digital-workers-r13.md:6061:+  /** Execution nonce: the recovery marker on the command line (--session-id). */
.logs/reviews/codex-digital-workers-r13.md:6062:+  nonce?: string;
.logs/reviews/codex-digital-workers-r13.md:6089:+  if (opts.nonce) args.push("--session-id", opts.nonce);
.logs/reviews/codex-digital-workers-r13.md:6153:+  runMode: "schedule",

hook: PostToolUse
hook: PostToolUse Completed
hook: PreToolUse
hook: PreToolUse Completed
exec
/bin/zsh -lc 'git diff origin/main...HEAD -- components/workers/AskBar.tsx components/workers/GoalsTab.tsx components/workers/RunTimeline.tsx components/workers/api.ts components/workers/voice.ts components/workers/format.tsx' in /Users/jasonpoley/prj/dx/src/daax-web
 succeeded in 0ms:
diff --git a/components/workers/AskBar.tsx b/components/workers/AskBar.tsx
new file mode 100644
index 0000000..1f860ff
--- /dev/null
+++ b/components/workers/AskBar.tsx
@@ -0,0 +1,205 @@
+"use client";
+
+import { useEffect, useRef, useState } from "react";
+import { Send, Volume2, VolumeX } from "lucide-react";
+import { Button } from "@/components/ui/button";
+import { Textarea } from "@/components/ui/textarea";
+import { VoiceInput } from "@/components/ui/voice-input";
+import { TERMINAL_RUN_STATUSES, type WorkerRun } from "@/types/workers";
+import { workersApi } from "./api";
+import { useRunFollower } from "./RunTimeline";
+import { Markdown } from "./Markdown";
+import { RunStatusBadge } from "./format";
+import { firstSection, parseVoiceIntent, speakable } from "./voice";
+
+const SPEAK_KEY = "daax.workers.speak";
+
+function speak(text: string) {
+  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
+  window.speechSynthesis.cancel();
+  window.speechSynthesis.speak(new SpeechSynthesisUtterance(speakable(text)));
+}
+
+function stopSpeaking() {
+  if (typeof window !== "undefined" && "speechSynthesis" in window)
+    window.speechSynthesis.cancel();
+}
+
+interface AskBarProps {
+  workerId: string;
+  workerName: string;
+  enabled: boolean;
+  brief: WorkerRun | null;
+  onChanged: () => void;
+}
+
+/**
+ * Ask a worker a question by typing or by voice. Control phrases ("run now",
+ * "pause", "resume", "status", "stop") act directly; anything else becomes
+ * an ad hoc run whose answer streams in and can be read aloud.
+ */
+export function AskBar({
+  workerId,
+  workerName,
+  enabled,
+  brief,
+  onChanged,
+}: AskBarProps) {
+  const [text, setText] = useState("");
+  const [runId, setRunId] = useState<string | null>(null);
+  const [notice, setNotice] = useState<string | null>(null);
+  const [error, setError] = useState<string | null>(null);
+  const [speakOn, setSpeakOn] = useState(false);
+  const { run, events } = useRunFollower(runId);
+  const spokenFor = useRef<string | null>(null);
+
+  useEffect(() => {
+    setSpeakOn(localStorage.getItem(SPEAK_KEY) === "1");
+  }, []);
+
+  useEffect(() => {
+    if (
+      !run ||
+      !TERMINAL_RUN_STATUSES.includes(run.status) ||
+      spokenFor.current === run.id
+    )
+      return;
+    spokenFor.current = run.id;
+    onChanged();
+    if (!speakOn) return;
+    if (run.summary) speak(run.summary);
+    else if (run.error) speak(`The run ${run.status}. ${run.error}`);
+  }, [run, speakOn, onChanged]);
+
+  const toggleSpeak = () => {
+    const next = !speakOn;
+    setSpeakOn(next);
+    localStorage.setItem(SPEAK_KEY, next ? "1" : "0");
+    if (!next) stopSpeaking();
+  };
+
+  const say = (message: string) => {
+    setNotice(message);
+    if (speakOn) speak(message);
+  };
+
+  const submit = async (raw: string, via: "adhoc" | "voice") => {
+    const intent = parseVoiceIntent(raw);
+    setError(null);
+    setNotice(null);
+    try {
+      switch (intent.kind) {
+        case "stop":
+          stopSpeaking();
+          if (run && !TERMINAL_RUN_STATUSES.includes(run.status)) {
+            await workersApi.cancelRun(run.id);
+            say("Cancelled the run.");
+          }
+          return;
+        case "pause":
+          await workersApi.update(workerId, { enabled: false });
+          onChanged();
+          return say(`${workerName} is paused.`);
+        case "resume":
+          await workersApi.update(workerId, { enabled: true });
+          onChanged();
+          return say(`${workerName} is running on its schedule again.`);
+        case "status":
+          return say(
+            brief?.summary
+              ? speakable(firstSection(brief.summary))
+              : "There is no report yet.",
+          );
+        case "run":
+        case "ask": {
+          const input = intent.kind === "ask" ? intent.text : "";
+          const res = await workersApi.startRun(workerId, input, via);
+          setRunId(res.run.id);
+          setText("");
+          onChanged();
+          return;
+        }
+      }
+    } catch (e) {
+      setError((e as Error).message);
+    }
+  };
+
+  const active = run && !TERMINAL_RUN_STATUSES.includes(run.status);
+  const lastMessage = [...events]
+    .reverse()
+    .find((e) => e.type === "message")?.text;
+
+  return (
+    <div className="space-y-3 rounded-lg border p-4" data-testid="ask-bar">
+      <div className="flex items-start gap-2">
+        <Textarea
+          value={text}
+          onChange={(e) => setText(e.target.value)}
+          onKeyDown={(e) => {
+            if (e.key === "Enter" && !e.shiftKey && text.trim()) {
+              e.preventDefault();
+              void submit(text, "adhoc");
+            }
+          }}
+          placeholder={`Ask ${workerName} — e.g. "what's blocking the Postgres work?" — or say "run now", "pause", "status"`}
+          className="min-h-[44px] flex-1 resize-none"
+          rows={1}
+          aria-label="Ask the worker"
+          disabled={Boolean(active)}
+        />
+        <VoiceInput
+          onTranscript={(t) => void submit(t, "voice")}
+          disabled={Boolean(active)}
+        />
+        <Button
+          onClick={() => void submit(text, "adhoc")}
+          disabled={!text.trim() || Boolean(active)}
+          aria-label="Send"
+        >
+          <Send className="h-4 w-4" />
+        </Button>
+        <Button
+          variant="outline"
+          onClick={toggleSpeak}
+          aria-label={
+            speakOn ? "Stop reading answers aloud" : "Read answers aloud"
+          }
+          aria-pressed={speakOn}
+          title={speakOn ? "Answers are read aloud" : "Answers are silent"}
+        >
+          {speakOn ? (
+            <Volume2 className="h-4 w-4" />
+          ) : (
+            <VolumeX className="h-4 w-4" />
+          )}
+        </Button>
+      </div>
+      {!enabled && (
+        <p className="text-xs text-muted-foreground">
+          Automatic runs are paused; questions and &ldquo;run now&rdquo; still
+          work.
+        </p>
+      )}
+      {notice && <p className="text-sm">{notice}</p>}
+      {error && (
+        <p role="alert" className="text-sm text-destructive">
+          {error}
+        </p>
+      )}
+      {run && (
+        <div className="space-y-2" data-testid="ask-answer">
+          <div className="flex items-center gap-2 text-xs text-muted-foreground">
+            <RunStatusBadge status={run.status} />
+            {active && <span>{events.length} steps so far…</span>}
+          </div>
+          {active && lastMessage && (
+            <p className="text-sm text-muted-foreground">{lastMessage}</p>
+          )}
+          {run.summary && <Markdown text={run.summary} />}
+          {run.error && <p className="text-sm text-destructive">{run.error}</p>}
+        </div>
+      )}
+    </div>
+  );
+}
diff --git a/components/workers/GoalsTab.tsx b/components/workers/GoalsTab.tsx
new file mode 100644
index 0000000..0e96415
--- /dev/null
+++ b/components/workers/GoalsTab.tsx
@@ -0,0 +1,163 @@
+"use client";
+
+import { useState } from "react";
+import { Check, Plus, Trash2, Undo2 } from "lucide-react";
+import { Badge } from "@/components/ui/badge";
+import { Button } from "@/components/ui/button";
+import { Input } from "@/components/ui/input";
+import { Textarea } from "@/components/ui/textarea";
+import type { WorkerGoal } from "@/types/workers";
+import { workersApi } from "./api";
+
+export function GoalsTab({
+  workerId,
+  goals,
+  onChanged,
+}: {
+  workerId: string;
+  goals: WorkerGoal[];
+  onChanged: () => void;
+}) {
+  const [title, setTitle] = useState("");
+  const [projectRef, setProjectRef] = useState("");
+  const [criteria, setCriteria] = useState("");
+  const [error, setError] = useState<string | null>(null);
+
+  const run = async (fn: () => Promise<unknown>) => {
+    setError(null);
+    try {
+      await fn();
+      onChanged();
+    } catch (e) {
+      setError((e as Error).message);
+    }
+  };
+
+  const add = () =>
+    run(async () => {
+      await workersApi.addGoal(workerId, {
+        title: title.trim(),
+        projectRef: projectRef.trim() || null,
+        successCriteria: criteria.trim(),
+      });
+      setTitle("");
+      setProjectRef("");
+      setCriteria("");
+    });
+
+  return (
+    <div className="space-y-4" data-testid="goals-tab">
+      <ul className="space-y-2">
+        {goals.map((g) => (
+          <li
+            key={g.id}
+            className="flex items-start justify-between gap-3 rounded border p-3"
+          >
+            <div className="space-y-1">
+              <div className="flex items-center gap-2">
+                <span
+                  className={
+                    g.status === "active"
+                      ? "font-medium"
+                      : "font-medium text-muted-foreground line-through"
+                  }
+                >
+                  {g.title}
+                </span>
+                <Badge variant="outline">{g.status}</Badge>
+              </div>
+              {g.projectRef && (
+                <p className="font-mono text-xs text-muted-foreground">
+                  {g.projectRef}
+                </p>
+              )}
+              {g.successCriteria && (
+                <p className="text-xs text-muted-foreground">
+                  Done when: {g.successCriteria}
+                </p>
+              )}
+            </div>
+            <div className="flex gap-1">
+              {g.status === "active" ? (
+                <Button
+                  size="sm"
+                  variant="ghost"
+                  aria-label="Mark done"
+                  onClick={() =>
+                    void run(() =>
+                      workersApi.updateGoal(workerId, g.id, { status: "done" }),
+                    )
+                  }
+                >
+                  <Check className="h-4 w-4" />
+                </Button>
+              ) : (
+                <Button
+                  size="sm"
+                  variant="ghost"
+                  aria-label="Reactivate"
+                  onClick={() =>
+                    void run(() =>
+                      workersApi.updateGoal(workerId, g.id, {
+                        status: "active",
+                      }),
+                    )
+                  }
+                >
+                  <Undo2 className="h-4 w-4" />
+                </Button>
+              )}
+              <Button
+                size="sm"
+                variant="ghost"
+                aria-label="Delete goal"
+                onClick={() =>
+                  void run(() => workersApi.deleteGoal(workerId, g.id))
+                }
+              >
+                <Trash2 className="h-4 w-4" />
+              </Button>
+            </div>
+          </li>
+        ))}
+        {goals.length === 0 && (
+          <li className="text-sm text-muted-foreground">
+            No goals yet. Without goals the worker reports on every project it
+            can see.
+          </li>
+        )}
+      </ul>
+
+      <div className="space-y-2 rounded border p-3">
+        <p className="text-sm font-medium">Add a goal</p>
+        <Input
+          value={title}
+          onChange={(e) => setTitle(e.target.value)}
+          placeholder="Goal — e.g. Ship Postgres RBAC to production"
+          aria-label="Goal title"
+        />
+        <Input
+          value={projectRef}
+          onChange={(e) => setProjectRef(e.target.value)}
+          placeholder="Backlog.md project path (optional) — e.g. /workspace/dx/src/daax-web"
+          aria-label="Project"
+        />
+        <Textarea
+          value={criteria}
+          onChange={(e) => setCriteria(e.target.value)}
+          placeholder="Done when… (optional)"
+          rows={2}
+          aria-label="Success criteria"
+        />
+        <Button onClick={() => void add()} disabled={!title.trim()}>
+          <Plus className="mr-1 h-4 w-4" /> Add goal
+        </Button>
+      </div>
+      {error && (
+        <p role="alert" className="text-sm text-destructive">
+          {error}
+        </p>
+      )}
+    </div>
+  );
+}
diff --git a/components/workers/RunTimeline.tsx b/components/workers/RunTimeline.tsx
new file mode 100644
index 0000000..599e07c
--- /dev/null
+++ b/components/workers/RunTimeline.tsx
@@ -0,0 +1,139 @@
+"use client";
+
+import { useEffect, useRef, useState } from "react";
+import { Square } from "lucide-react";
+import { Button } from "@/components/ui/button";
+import {
+  TERMINAL_RUN_STATUSES,
+  type WorkerRun,
+  type WorkerRunEvent,
+} from "@/types/workers";
+import { workersApi } from "./api";
+import { RunStatusBadge, localTime } from "./format";
+import { Markdown } from "./Markdown";
+
+const POLL_MS = 2_000;
+
+/** Follows a run: polls new events until the run reaches a terminal status. */
+export function useRunFollower(runId: string | null) {
+  const [run, setRun] = useState<WorkerRun | null>(null);
+  const [events, setEvents] = useState<WorkerRunEvent[]>([]);
+  const [error, setError] = useState<string | null>(null);
+  const lastSeq = useRef(-1);
+
+  useEffect(() => {
+    lastSeq.current = -1;
+    setEvents([]);
+    setRun(null);
+    setError(null);
+    if (!runId) return;
+    let stopped = false;
+    let timer: ReturnType<typeof setTimeout> | undefined;
+    const poll = async () => {
+      try {
+        const res = await workersApi.run(runId, lastSeq.current);
+        if (stopped) return;
+        setRun(res.run);
+        if (res.events.length) {
+          lastSeq.current = res.events[res.events.length - 1].seq;
+          setEvents((prev) => [...prev, ...res.events]);
+        }
+        // Keep draining pages before stopping, so a finished run with more
+        // than one page of events is shown in full.
+        if (res.hasMore) {
+          if (!stopped) timer = setTimeout(() => void poll(), 0);
+          return;
+        }
+        if (TERMINAL_RUN_STATUSES.includes(res.run.status)) return;
+      } catch (e) {
+        if (!stopped) setError((e as Error).message);
+      }
+      if (!stopped) timer = setTimeout(() => void poll(), POLL_MS);
+    };
+    void poll();
+    return () => {
+      stopped = true;
+      if (timer) clearTimeout(timer);
+    };
+  }, [runId]);
+
+  return { run, events, error };
+}
+
+function EventLine({ e }: { e: WorkerRunEvent }) {
+  const label =
+    e.type === "tool_call" || e.type === "tool_result"
+      ? `${e.type} ${e.tool ?? ""}`
+      : e.type;
+  return (
+    <li className="grid grid-cols-[5.5rem_8rem_1fr] gap-2 border-b py-1 text-xs last:border-0">
+      <span className="text-muted-foreground">
+        {new Date(e.at).toLocaleTimeString()}
+      </span>
+      <span className="truncate font-mono" title={label}>
+        {label}
+      </span>
+      <span className="whitespace-pre-wrap break-words">
+        {e.text ??
+          (e.data !== undefined ? JSON.stringify(e.data).slice(0, 300) : "")}
+      </span>
+    </li>
+  );
+}
+
+export function RunTimeline({
+  runId,
+  showSummary = true,
+}: {
+  runId: string;
+  showSummary?: boolean;
+}) {
+  const { run, events, error } = useRunFollower(runId);
+  const active = run && !TERMINAL_RUN_STATUSES.includes(run.status);
+
+  return (
+    <div className="space-y-3" data-testid="run-timeline">
+      {run && (
+        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
+          <RunStatusBadge status={run.status} />
+          <span>{run.trigger}</span>
+          <span>{run.engine}</span>
+          <span>queued {localTime(run.queuedAt)}</span>
+          {run.usage.costUsd !== undefined && (
+            <span>${run.usage.costUsd.toFixed(3)}</span>
+          )}
+          {run.usage.turns !== undefined && (
+            <span>{run.usage.turns} turns</span>
+          )}
+          {active && (
+            <Button
+              size="sm"
+              variant="outline"
+              onClick={() => void workersApi.cancelRun(run.id)}
+            >
+              <Square className="mr-1 h-3 w-3" /> Cancel
+            </Button>
+          )}
+        </div>
+      )}
+      {run?.input && <p className="text-sm">&ldquo;{run.input}&rdquo;</p>}
+      {error && <p className="text-sm text-destructive">{error}</p>}
+      {run?.error && <p className="text-sm text-destructive">{run.error}</p>}
+      {showSummary && run?.summary && (
+        <div className="rounded border p-3">
+          <Markdown text={run.summary} />
+        </div>
+      )}
+      <details open={Boolean(active)}>
+        <summary className="cursor-pointer text-xs text-muted-foreground">
+          Activity ({events.length} events)
+        </summary>
+        <ul className="mt-2 max-h-96 overflow-y-auto">
+          {events.map((e) => (
+            <EventLine key={e.seq} e={e} />
+          ))}
+        </ul>
+      </details>
+    </div>
+  );
+}
diff --git a/components/workers/api.ts b/components/workers/api.ts
new file mode 100644
index 0000000..6f6427f
--- /dev/null
+++ b/components/workers/api.ts
@@ -0,0 +1,109 @@
+// Client-side calls to /api/workers (browser only).
+
+import type {
+  Worker,
+  WorkerEngine,
+  WorkerGoal,
+  WorkerRun,
+  WorkerRunEvent,
+  WorkerSummary,
+} from "@/types/workers";
+
+export interface EngineInfo {
+  available: boolean;
+  note: string;
+}
+
+export interface WorkersList {
+  workers: WorkerSummary[];
+  templates: { slug: string; name: string; description: string }[];
+  engines: Record<WorkerEngine, EngineInfo>;
+  schedulerLeader: boolean;
+}
+
+export interface WorkerDetailData {
+  worker: WorkerSummary;
+  goals: WorkerGoal[];
+  brief: WorkerRun | null;
+}
+
+export class ApiError extends Error {
+  constructor(
+    public readonly status: number,
+    message: string,
+  ) {
+    super(message);
+  }
+}
+
+async function call<T>(path: string, init?: RequestInit): Promise<T> {
+  const res = await fetch(path, {
+    ...init,
+    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
+  });
+  const body = (await res.json().catch(() => ({}))) as {
+    error?: string;
+    message?: string;
+  };
+  if (!res.ok) {
+    throw new ApiError(
+      res.status,
+      body.message
+        ? `${body.error}: ${body.message}`
+        : (body.error ?? res.statusText),
+    );
+  }
+  return body as T;
+}
+
+const enc = encodeURIComponent;
+
+export const workersApi = {
+  list: () => call<WorkersList>("/api/workers"),
+  createFromTemplate: (template: string) =>
+    call<{ worker: Worker }>("/api/workers", {
+      method: "POST",
+      body: JSON.stringify({ template }),
+    }),
+  get: (id: string) => call<WorkerDetailData>(`/api/workers/${enc(id)}`),
+  update: (id: string, patch: Partial<Worker>) =>
+    call<{ worker: Worker }>(`/api/workers/${enc(id)}`, {
+      method: "PATCH",
+      body: JSON.stringify(patch),
+    }),
+  remove: (id: string) =>
+    call<{ deleted: boolean }>(`/api/workers/${enc(id)}`, { method: "DELETE" }),
+  addGoal: (id: string, goal: Partial<WorkerGoal>) =>
+    call<{ goal: WorkerGoal }>(`/api/workers/${enc(id)}/goals`, {
+      method: "POST",
+      body: JSON.stringify(goal),
+    }),
+  updateGoal: (id: string, goalId: string, patch: Partial<WorkerGoal>) =>
+    call<{ goal: WorkerGoal }>(`/api/workers/${enc(id)}/goals/${enc(goalId)}`, {
+      method: "PATCH",
+      body: JSON.stringify(patch),
+    }),
+  deleteGoal: (id: string, goalId: string) =>
+    call<{ deleted: boolean }>(`/api/workers/${enc(id)}/goals/${enc(goalId)}`, {
+      method: "DELETE",
+    }),
+  runs: (id: string, limit = 20) =>
+    call<{ runs: WorkerRun[] }>(`/api/workers/${enc(id)}/runs?limit=${limit}`),
+  startRun: (id: string, input = "", trigger: "adhoc" | "voice" = "adhoc") =>
+    call<{ run: WorkerRun }>(`/api/workers/${enc(id)}/runs`, {
+      method: "POST",
+      body: JSON.stringify({ input, trigger }),
+    }),
+  run: (runId: string, after = -1) =>
+    call<{ run: WorkerRun; events: WorkerRunEvent[]; hasMore?: boolean }>(
+      `/api/workers/runs/${enc(runId)}?after=${after}`,
+    ),
+  cancelRun: (runId: string) =>
+    call<{ cancelled: boolean }>(`/api/workers/runs/${enc(runId)}`, {
+      method: "DELETE",
+    }),
+  mcpCatalog: () =>
+    call<{ state?: { mcps?: { id: string; name: string; source: string }[] } }>(
+      "/api/mcp/config",
+    ),
+};
diff --git a/components/workers/format.tsx b/components/workers/format.tsx
new file mode 100644
index 0000000..c4b7fe2
--- /dev/null
+++ b/components/workers/format.tsx
@@ -0,0 +1,69 @@
+"use client";
+
+import { Badge } from "@/components/ui/badge";
+import type { RunStatus, WorkerSummary } from "@/types/workers";
+
+export function relativeTime(
+  iso: string | null | undefined,
+  now = Date.now(),
+): string {
+  if (!iso) return "—";
+  const diff = new Date(iso).getTime() - now;
+  const abs = Math.abs(diff);
+  const units: [number, string][] = [
+    [86_400_000, "d"],
+    [3_600_000, "h"],
+    [60_000, "m"],
+  ];
+  for (const [ms, label] of units) {
+    if (abs >= ms) {
+      const n = Math.round(abs / ms);
+      return diff < 0 ? `${n}${label} ago` : `in ${n}${label}`;
+    }
+  }
+  return diff < 0 ? "just now" : "in <1m";
+}
+
+export function localTime(iso: string | null | undefined): string {
+  return iso ? new Date(iso).toLocaleString() : "—";
+}
+
+const STATE_VARIANT: Record<
+  WorkerSummary["state"],
+  "default" | "secondary" | "destructive" | "outline"
+> = {
+  running: "default",
+  idle: "secondary",
+  paused: "outline",
+  failing: "destructive",
+};
+
+export function StateBadge({ state }: { state: WorkerSummary["state"] }) {
+  return (
+    <Badge variant={STATE_VARIANT[state]} data-testid="worker-state">
+      {state}
+    </Badge>
+  );
+}
+
+const RUN_VARIANT: Record<
+  RunStatus,
+  "default" | "secondary" | "destructive" | "outline"
+> = {
+  queued: "outline",
+  running: "default",
+  succeeded: "secondary",
+  failed: "destructive",
+  timeout: "destructive",
+  cancelled: "outline",
+};
+
+export function RunStatusBadge({ status }: { status: RunStatus }) {
+  return <Badge variant={RUN_VARIANT[status]}>{status}</Badge>;
+}
+
+export const MODE_LABEL: Record<WorkerSummary["runMode"], string> = {
+  schedule: "Scheduled",
+  adhoc: "Ad hoc",
+  continuous: "Continuous",
+};
diff --git a/components/workers/voice.ts b/components/workers/voice.ts
new file mode 100644
index 0000000..56e13c4
--- /dev/null
+++ b/components/workers/voice.ts
@@ -0,0 +1,55 @@
+// Voice helpers for the ask bar: control intents handled without an LLM run,
+// and markdown → plain text for speech synthesis.
+
+export type VoiceIntent =
+  | { kind: "run" }
+  | { kind: "pause" }
+  | { kind: "resume" }
+  | { kind: "status" }
+  | { kind: "stop" }
+  | { kind: "ask"; text: string };
+
+const CONTROL: [RegExp, VoiceIntent["kind"]][] = [
+  [/^(run( it)?( now)?|check in( now)?|start( a)? run)$/, "run"],
+  [/^(pause|pause (the )?worker|stop scheduling)$/, "pause"],
+  [/^(resume|resume (the )?worker|unpause|start scheduling)$/, "resume"],
+  [/^(status|what'?s the status|read (me )?the (brief|status))$/, "status"],
+  [/^(stop|stop talking|be quiet|cancel)$/, "stop"],
+];
+
+export function parseVoiceIntent(raw: string): VoiceIntent {
+  const text = raw.trim();
+  const normalized = text
+    .toLowerCase()
+    .replace(/[.!?,]+$/g, "")
+    .replace(/\s+/g, " ");
+  for (const [re, kind] of CONTROL) {
+    if (re.test(normalized)) return { kind } as VoiceIntent;
+  }
+  return { kind: "ask", text };
+}
+
+/** Strip markdown to something a speech synthesizer reads naturally. */
+export function speakable(markdown: string, maxChars = 1_500): string {
+  const text = markdown
+    .replace(/```[\s\S]*?```/g, " ")
+    .replace(/^\s*\|?\s*:?-{3,}.*$/gm, "")
+    .replace(/\|/g, ", ")
+    .replace(/^#{1,6}\s+(.*)$/gm, "$1.")
+    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
+    .replace(/[*_`>#]/g, "")
+    .replace(/^\s*[-+]\s+/gm, "")
+    .replace(/\s*,\s*,/g, ",")
+    .replace(/\n{2,}/g, ". ")
+    .replace(/\n/g, " ")
+    .replace(/\s{2,}/g, " ")
+    .replace(/\.\s*\./g, ".")
+    .trim();
+  return text.length > maxChars ? `${text.slice(0, maxChars)}…` : text;
+}
+
+/** First section of a report (for "status"). */
+export function firstSection(markdown: string): string {
+  const parts = markdown.split(/\n(?=##\s)/);
+  return (parts[0].startsWith("##") ? parts[0] : (parts[1] ?? parts[0])).trim();
+}

hook: PostToolUse
hook: PostToolUse Completed
codex
The round 12 redaction and recovery fixes remain present. The review is now checking scheduling, MCP discovery, and UI controls for defects outside those earlier findings.
hook: PreToolUse
hook: PreToolUse Completed
exec
/bin/zsh -lc 'git diff origin/main...HEAD -- components/workers/ScheduleTab.tsx components/workers/ToolsTab.tsx components/workers/WorkerDetail.tsx components/workers/WorkersList.tsx components/workers/Markdown.tsx app/workers' in /Users/jasonpoley/prj/dx/src/daax-web
 succeeded in 0ms:
diff --git a/app/workers/[slug]/page.tsx b/app/workers/[slug]/page.tsx
new file mode 100644
index 0000000..0d22e8f
--- /dev/null
+++ b/app/workers/[slug]/page.tsx
@@ -0,0 +1,16 @@
+import { WorkerDetail } from "@/components/workers/WorkerDetail";
+
+export const metadata = { title: "Digital Worker" };
+
+export default async function WorkerPage({
+  params,
+}: {
+  params: Promise<{ slug: string }>;
+}) {
+  const { slug } = await params;
+  return (
+    <div className="container mx-auto max-w-screen-xl p-6">
+      <WorkerDetail slug={slug} />
+    </div>
+  );
+}
diff --git a/app/workers/page.tsx b/app/workers/page.tsx
new file mode 100644
index 0000000..9d2c3db
--- /dev/null
+++ b/app/workers/page.tsx
@@ -0,0 +1,29 @@
+import { UserCog } from "lucide-react";
+import { WorkersList } from "@/components/workers/WorkersList";
+
+export const metadata = {
+  title: "Digital Workers",
+  description:
+    "AI workers with goals and tools, run on a schedule, on demand, or continuously.",
+};
+
+export default function WorkersPage() {
+  return (
+    <div className="container mx-auto max-w-screen-xl space-y-6 p-6">
+      <div className="flex items-center gap-3">
+        <div className="rounded-lg bg-primary/10 p-2 text-primary">
+          <UserCog className="h-5 w-5" aria-hidden />
+        </div>
+        <div>
+          <h1 className="text-xl font-bold">Digital Workers</h1>
+          <p className="text-sm text-muted-foreground">
+            AI workers with goals and MCP tools. They run on a schedule, on
+            demand, or continuously — manage them here, from the CLI (
+            <code className="font-mono">bun run workers</code>), or by voice.
+          </p>
+        </div>
+      </div>
+      <WorkersList />
+    </div>
+  );
+}
diff --git a/components/workers/Markdown.tsx b/components/workers/Markdown.tsx
new file mode 100644
index 0000000..8e77780
--- /dev/null
+++ b/components/workers/Markdown.tsx
@@ -0,0 +1,175 @@
+"use client";
+
+// Minimal markdown renderer for worker reports: headings, paragraphs, lists,
+// tables, bold, inline code, fenced code and links. Builds React elements
+// (never HTML strings), so report text cannot inject markup.
+
+import { Fragment, type ReactNode } from "react";
+
+function inline(text: string, key: string): ReactNode[] {
+  const out: ReactNode[] = [];
+  const re = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\((https?:\/\/[^)\s]+)\))/g;
+  let last = 0;
+  let m: RegExpExecArray | null;
+  let i = 0;
+  while ((m = re.exec(text))) {
+    if (m.index > last) out.push(text.slice(last, m.index));
+    const tok = m[0];
+    const k = `${key}-${i++}`;
+    if (tok.startsWith("`")) {
+      out.push(
+        <code
+          key={k}
+          className="rounded bg-muted px-1 py-0.5 font-mono text-xs"
+        >
+          {tok.slice(1, -1)}
+        </code>,
+      );
+    } else if (tok.startsWith("**")) {
+      out.push(<strong key={k}>{tok.slice(2, -2)}</strong>);
+    } else {
+      const label = tok.slice(1, tok.indexOf("]"));
+      out.push(
+        <a
+          key={k}
+          href={m[2]}
+          target="_blank"
+          rel="noreferrer"
+          className="text-primary underline"
+        >
+          {label}
+        </a>,
+      );
+    }
+    last = m.index + tok.length;
+  }
+  if (last < text.length) out.push(text.slice(last));
+  return out;
+}
+
+const cells = (row: string) =>
+  row
+    .trim()
+    .replace(/^\||\|$/g, "")
+    .split("|")
+    .map((c) => c.trim());
+
+export function Markdown({ text }: { text: string }) {
+  const lines = text.replace(/\r\n/g, "\n").split("\n");
+  const blocks: ReactNode[] = [];
+  let i = 0;
+  while (i < lines.length) {
+    const line = lines[i];
+    const key = `b${i}`;
+    if (!line.trim()) {
+      i++;
+      continue;
+    }
+    if (line.startsWith("```")) {
+      const body: string[] = [];
+      i++;
+      while (i < lines.length && !lines[i].startsWith("```"))
+        body.push(lines[i++]);
+      i++;
+      blocks.push(
+        <pre
+          key={key}
+          className="overflow-x-auto rounded bg-muted p-3 font-mono text-xs"
+        >
+          {body.join("\n")}
+        </pre>,
+      );
+      continue;
+    }
+    const h = /^(#{1,6})\s+(.*)$/.exec(line);
+    if (h) {
+      const size = h[1].length <= 2 ? "text-base" : "text-sm";
+      blocks.push(
+        <h3 key={key} className={`${size} mt-4 font-semibold first:mt-0`}>
+          {inline(h[2], key)}
+        </h3>,
+      );
+      i++;
+      continue;
+    }
+    if (
+      line.trim().startsWith("|") &&
+      lines[i + 1]?.trim().match(/^\|?\s*:?-{3,}/)
+    ) {
+      const head = cells(line);
+      const rows: string[][] = [];
+      i += 2;
+      while (i < lines.length && lines[i].trim().startsWith("|"))
+        rows.push(cells(lines[i++]));
+      blocks.push(
+        <div key={key} className="overflow-x-auto">
+          <table className="w-full border-collapse text-sm">
+            <thead>
+              <tr>
+                {head.map((c, j) => (
+                  <th
+                    key={j}
+                    className="border-b px-2 py-1 text-left font-medium text-muted-foreground"
+                  >
+                    {inline(c, `${key}h${j}`)}
+                  </th>
+                ))}
+              </tr>
+            </thead>
+            <tbody>
+              {rows.map((r, ri) => (
+                <tr key={ri} className="border-b last:border-0">
+                  {r.map((c, j) => (
+                    <td key={j} className="px-2 py-1 align-top">
+                      {inline(c, `${key}r${ri}c${j}`)}
+                    </td>
+                  ))}
+                </tr>
+              ))}
+            </tbody>
+          </table>
+        </div>,
+      );
+      continue;
+    }
+    if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
+      const ordered = /^\s*\d+\./.test(line);
+      const items: string[] = [];
+      while (i < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[i])) {
+        items.push(lines[i++].replace(/^\s*([-*+]|\d+\.)\s+/, ""));
+      }
+      const List = ordered ? "ol" : "ul";
+      blocks.push(
+        <List
+          key={key}
+          className={`${ordered ? "list-decimal" : "list-disc"} space-y-1 pl-5 text-sm`}
+        >
+          {items.map((it, j) => (
+            <li key={j}>{inline(it, `${key}i${j}`)}</li>
+          ))}
+        </List>,
+      );
+      continue;
+    }
+    const para: string[] = [];
+    while (
+      i < lines.length &&
+      lines[i].trim() &&
+      !/^(#|```|\s*([-*+]|\d+\.)\s|\|)/.test(lines[i])
+    ) {
+      para.push(lines[i++]);
+    }
+    if (para.length === 0) para.push(lines[i++]);
+    blocks.push(
+      <p key={key} className="text-sm leading-relaxed">
+        {para.map((p, j) => (
+          <Fragment key={j}>
+            {j > 0 && " "}
+            {inline(p, `${key}p${j}`)}
+          </Fragment>
+        ))}
+      </p>,
+    );
+  }
+  return <div className="space-y-2">{blocks}</div>;
+}
diff --git a/components/workers/ScheduleTab.tsx b/components/workers/ScheduleTab.tsx
new file mode 100644
index 0000000..ffc9177
--- /dev/null
+++ b/components/workers/ScheduleTab.tsx
@@ -0,0 +1,181 @@
+"use client";
+
+import { useMemo, useState } from "react";
+import { Cron } from "croner";
+import { Button } from "@/components/ui/button";
+import { Input } from "@/components/ui/input";
+import { Label } from "@/components/ui/label";
+import {
+  Select,
+  SelectContent,
+  SelectItem,
+  SelectTrigger,
+  SelectValue,
+} from "@/components/ui/select";
+import { Switch } from "@/components/ui/switch";
+import {
+  WORKER_RUN_MODES,
+  type WorkerRunMode,
+  type WorkerSummary,
+} from "@/types/workers";
+import { MODE_LABEL, localTime } from "./format";
+
+/** Next `n` fire times for a cron expression, or an error message. */
+export function cronPreview(
+  expr: string,
+  n = 3,
+  from = new Date(),
+): { times: Date[]; error: string | null } {
+  try {
+    const job = new Cron(expr, { timezone: "UTC", paused: true });
+    return { times: job.nextRuns(n, from), error: null };
+  } catch (e) {
+    return { times: [], error: (e as Error).message };
+  }
+}
+
+export function ScheduleTab({
+  worker,
+  onSave,
+}: {
+  worker: WorkerSummary;
+  onSave: (patch: Partial<WorkerSummary>) => Promise<void>;
+}) {
+  const [mode, setMode] = useState<WorkerRunMode>(worker.runMode);
+  const [cron, setCron] = useState(worker.cron ?? "0 8 * * 1-5");
+  const [cooldown, setCooldown] = useState(
+    String(Math.round(worker.cooldownSeconds / 60)),
+  );
+  const [cap, setCap] = useState(String(worker.maxRunsPerDay));
+  const [timeout, setTimeoutMin] = useState(
+    String(Math.round(worker.timeoutSeconds / 60)),
+  );
+  const [workingDir, setWorkingDir] = useState(worker.workingDir ?? "");
+  const preview = useMemo(
+    () => (mode === "schedule" ? cronPreview(cron) : null),
+    [mode, cron],
+  );
+
+  const save = () =>
+    onSave({
+      runMode: mode,
+      cron: mode === "schedule" ? cron.trim() : worker.cron,
+      cooldownSeconds: Number(cooldown) * 60,
+      maxRunsPerDay: Number(cap),
+      timeoutSeconds: Number(timeout) * 60,
+      workingDir: workingDir.trim() || null,
+    });
+
+  return (
+    <div className="max-w-2xl space-y-5" data-testid="schedule-tab">
+      <div className="flex items-center gap-3">
+        <Switch
+          id="worker-enabled"
+          checked={worker.enabled}
+          onCheckedChange={(v) => void onSave({ enabled: v })}
+        />
+        <Label htmlFor="worker-enabled">
+          {worker.enabled ? "Automatic runs on" : "Automatic runs paused"}
+        </Label>
+      </div>
+
+      <div className="space-y-2">
+        <Label>Run mode</Label>
+        <Select value={mode} onValueChange={(v) => setMode(v as WorkerRunMode)}>
+          <SelectTrigger className="w-60" aria-label="Run mode">
+            <SelectValue />
+          </SelectTrigger>
+          <SelectContent>
+            {WORKER_RUN_MODES.map((m) => (
+              <SelectItem key={m} value={m}>
+                {MODE_LABEL[m]}
+              </SelectItem>
+            ))}
+          </SelectContent>
+        </Select>
+        <p className="text-xs text-muted-foreground">
+          {mode === "schedule" &&
+            "Runs on the cron schedule below (UTC). Missed runs while daax is down are skipped."}
+          {mode === "continuous" &&
+            "Starts the next run after the cooldown once the previous one finishes."}
+          {mode === "adhoc" &&
+            "Runs only when asked — from this page, the CLI, or by voice."}
+        </p>
+      </div>
+
+      {mode === "schedule" && (
+        <div className="space-y-2">
+          <Label htmlFor="worker-cron">Cron (UTC)</Label>
+          <Input
+            id="worker-cron"
+            value={cron}
+            onChange={(e) => setCron(e.target.value)}
+            className="w-60 font-mono"
+          />
+          {preview?.error ? (
+            <p className="text-xs text-destructive">{preview.error}</p>
+          ) : (
+            <p className="text-xs text-muted-foreground">
+              Next:{" "}
+              {preview?.times
+                .map((t) => localTime(t.toISOString()))
+                .join(" · ")}
+            </p>
+          )}
+        </div>
+      )}
+
+      <div className="grid grid-cols-3 gap-3">
+        <div className="space-y-1">
+          <Label htmlFor="worker-cooldown">Cooldown (min)</Label>
+          <Input
+            id="worker-cooldown"
+            type="number"
+            min={5}
+            value={cooldown}
+            onChange={(e) => setCooldown(e.target.value)}
+          />
+        </div>
+        <div className="space-y-1">
+          <Label htmlFor="worker-cap">Max automatic runs / day</Label>
+          <Input
+            id="worker-cap"
+            type="number"
+            min={1}
+            max={288}
+            value={cap}
+            onChange={(e) => setCap(e.target.value)}
+          />
+        </div>
+        <div className="space-y-1">
+          <Label htmlFor="worker-timeout">Timeout (min)</Label>
+          <Input
+            id="worker-timeout"
+            type="number"
+            min={1}
+            max={60}
+            value={timeout}
+            onChange={(e) => setTimeoutMin(e.target.value)}
+          />
+        </div>
+      </div>
+
+      <div className="space-y-1">
+        <Label htmlFor="worker-dir">
+          Working directory (inside the workspace)
+        </Label>
+        <Input
+          id="worker-dir"
+          value={workingDir}
+          onChange={(e) => setWorkingDir(e.target.value)}
+          placeholder="Relative to the workspace, e.g. dx/src/daax-web (workspace root when empty)"
+          className="font-mono"
+        />
+      </div>
+
+      <Button onClick={() => void save()} disabled={Boolean(preview?.error)}>
+        Save schedule
+      </Button>
+    </div>
+  );
+}
diff --git a/components/workers/ToolsTab.tsx b/components/workers/ToolsTab.tsx
new file mode 100644
index 0000000..014c4b7
--- /dev/null
+++ b/components/workers/ToolsTab.tsx
@@ -0,0 +1,233 @@
+"use client";
+
+import { useEffect, useState } from "react";
+import { Plus, Trash2 } from "lucide-react";
+import { Button } from "@/components/ui/button";
+import { Input } from "@/components/ui/input";
+import {
+  Select,
+  SelectContent,
+  SelectItem,
+  SelectTrigger,
+  SelectValue,
+} from "@/components/ui/select";
+import {
+  WORKER_AUTONOMY,
+  WORKER_ENGINES,
+  type WorkerAutonomy,
+  type WorkerEngine,
+  type WorkerMcpServer,
+  type WorkerSummary,
+} from "@/types/workers";
+import { workersApi, type EngineInfo } from "./api";
+
+const AUTONOMY_HELP: Record<WorkerAutonomy, string> = {
+  observe: "Reads and reports. Proposes nothing, changes nothing.",
+  propose:
+    "Reads everything, changes nothing; recommends next actions for you to approve.",
+  act: "May create/edit Backlog.md tasks and comment on GitHub. Never merges, pushes, deploys or deletes.",
+};
+
+export function ToolsTab({
+  worker,
+  engines,
+  onSave,
+}: {
+  worker: WorkerSummary;
+  engines: Record<WorkerEngine, EngineInfo> | null;
+  onSave: (patch: Partial<WorkerSummary>) => Promise<void>;
+}) {
+  const [catalog, setCatalog] = useState<
+    { id: string; name: string; source: string }[]
+  >([]);
+  const [pick, setPick] = useState("");
+  const [inlineId, setInlineId] = useState("");
+  const [inlineCmd, setInlineCmd] = useState("");
+  const [inlineEnv, setInlineEnv] = useState("");
+
+  useEffect(() => {
+    workersApi
+      .mcpCatalog()
+      .then((r) => setCatalog(r.state?.mcps ?? []))
+      .catch(() => setCatalog([]));
+  }, []);
+
+  const servers = worker.mcpServers;
+  const save = (next: WorkerMcpServer[]) => onSave({ mcpServers: next });
+  const addRef = () => {
+    if (!pick || servers.some((s) => s.id === pick)) return;
+    void save([...servers, { kind: "ref", id: pick }]);
+    setPick("");
+  };
+  const addInline = () => {
+    const [command, ...args] = inlineCmd.trim().split(/\s+/);
+    if (!inlineId.trim() || !command) return;
+    const envPassthrough = inlineEnv
+      .split(/[\s,]+/)
+      .map((s) => s.trim())
+      .filter(Boolean);
+    void save([
+      ...servers,
+      {
+        kind: "inline",
+        id: inlineId.trim(),
+        type: "stdio",
+        command,
+        args,
+        envPassthrough,
+      },
+    ]);
+    setInlineId("");
+    setInlineCmd("");
+    setInlineEnv("");
+  };
+
+  return (
+    <div className="space-y-6" data-testid="tools-tab">
+      <section className="grid gap-4 md:grid-cols-2">
+        <div className="space-y-2">
+          <p className="text-sm font-medium">Engine</p>
+          <Select
+            value={worker.engine}
+            onValueChange={(v) => void onSave({ engine: v as WorkerEngine })}
+          >
+            <SelectTrigger aria-label="Engine">
+              <SelectValue />
+            </SelectTrigger>
+            <SelectContent>
+              {WORKER_ENGINES.map((e) => (
+                <SelectItem key={e} value={e}>
+                  {e}
+                  {engines && !engines[e].available ? " (unavailable)" : ""}
+                </SelectItem>
+              ))}
+            </SelectContent>
+          </Select>
+          {engines && (
+            <p className="text-xs text-muted-foreground">
+              {engines[worker.engine].note}
+            </p>
+          )}
+          <Input
+            defaultValue={worker.model ?? ""}
+            placeholder="Model (optional, engine default when empty)"
+            aria-label="Model"
+            onBlur={(e) => {
+              const v = e.target.value.trim() || null;
+              if (v !== worker.model) void onSave({ model: v });
+            }}
+          />
+        </div>
+        <div className="space-y-2">
+          <p className="text-sm font-medium">Autonomy</p>
+          <Select
+            value={worker.autonomy}
+            onValueChange={(v) =>
+              void onSave({ autonomy: v as WorkerAutonomy })
+            }
+          >
+            <SelectTrigger aria-label="Autonomy">
+              <SelectValue />
+            </SelectTrigger>
+            <SelectContent>
+              {WORKER_AUTONOMY.map((a) => (
+                <SelectItem key={a} value={a}>
+                  {a}
+                </SelectItem>
+              ))}
+            </SelectContent>
+          </Select>
+          <p className="text-xs text-muted-foreground">
+            {AUTONOMY_HELP[worker.autonomy]}
+          </p>
+        </div>
+      </section>
+
+      <section className="space-y-2">
+        <p className="text-sm font-medium">MCP servers</p>
+        <p className="text-xs text-muted-foreground">
+          Each run lists every server&apos;s tools and gives the engine only the
+          ones this autonomy level allows. Secrets are never stored with the
+          worker.
+        </p>
+        <ul className="space-y-1">
+          {servers.map((s) => (
+            <li
+              key={s.id}
+              className="flex items-center justify-between rounded border px-3 py-2 text-sm"
+            >
+              <span>
+                <span className="font-mono">{s.id}</span>{" "}
+                <span className="text-xs text-muted-foreground">
+                  {s.kind === "ref"
+                    ? "from MCP configuration"
+                    : `${s.command ?? s.url} ${(s.args ?? []).join(" ")}${s.envPassthrough?.length ? ` · env: ${s.envPassthrough.join(", ")}` : ""}`}
+                </span>
+              </span>
+              <Button
+                size="sm"
+                variant="ghost"
+                aria-label={`Remove ${s.id}`}
+                onClick={() => void save(servers.filter((x) => x.id !== s.id))}
+              >
+                <Trash2 className="h-4 w-4" />
+              </Button>
+            </li>
+          ))}
+          {servers.length === 0 && (
+            <li className="text-sm text-muted-foreground">No MCP servers.</li>
+          )}
+        </ul>
+        <div className="flex gap-2">
+          <Select value={pick} onValueChange={setPick}>
+            <SelectTrigger
+              className="w-72"
+              aria-label="Add from MCP configuration"
+            >
+              <SelectValue placeholder="Add from MCP configuration…" />
+            </SelectTrigger>
+            <SelectContent>
+              {catalog
+                .filter((c) => !servers.some((s) => s.id === c.id))
+                .map((c) => (
+                  <SelectItem key={c.id} value={c.id}>
+                    {c.name} ({c.source})
+                  </SelectItem>
+                ))}
+            </SelectContent>
+          </Select>
+          <Button variant="outline" onClick={addRef} disabled={!pick}>
+            <Plus className="mr-1 h-4 w-4" /> Add
+          </Button>
+        </div>
+        <div className="grid gap-2 md:grid-cols-[10rem_1fr_14rem_auto]">
+          <Input
+            value={inlineId}
+            onChange={(e) => setInlineId(e.target.value)}
+            placeholder="id"
+            aria-label="Server id"
+          />
+          <Input
+            value={inlineCmd}
+            onChange={(e) => setInlineCmd(e.target.value)}
+            placeholder="command and args — e.g. backlog mcp start"
+            aria-label="Server command"
+          />
+          <Input
+            value={inlineEnv}
+            onChange={(e) => setInlineEnv(e.target.value)}
+            placeholder="env var names to pass (optional)"
+            aria-label="Environment variable names"
+          />
+          <Button
+            variant="outline"
+            onClick={addInline}
+            disabled={!inlineId.trim() || !inlineCmd.trim()}
+          >
+            <Plus className="mr-1 h-4 w-4" /> Add
+          </Button>
+        </div>
+      </section>
+    </div>
+  );
+}
diff --git a/components/workers/WorkerDetail.tsx b/components/workers/WorkerDetail.tsx
new file mode 100644
index 0000000..e4a4916
--- /dev/null
+++ b/components/workers/WorkerDetail.tsx
@@ -0,0 +1,231 @@
+"use client";
+
+import Link from "next/link";
+import { useCallback, useEffect, useState } from "react";
+import { ArrowLeft, Pause, Play, UserCog } from "lucide-react";
+import { Button } from "@/components/ui/button";
+import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
+import type { WorkerEngine, WorkerRun, WorkerSummary } from "@/types/workers";
+import { workersApi, type EngineInfo, type WorkerDetailData } from "./api";
+import { AskBar } from "./AskBar";
+import { GoalsTab } from "./GoalsTab";
+import { Markdown } from "./Markdown";
+import { RunTimeline } from "./RunTimeline";
+import { ScheduleTab } from "./ScheduleTab";
+import { ToolsTab } from "./ToolsTab";
+import {
+  MODE_LABEL,
+  RunStatusBadge,
+  StateBadge,
+  localTime,
+  relativeTime,
+} from "./format";
+
+function RunsTab({
+  workerId,
+  refreshKey,
+}: {
+  workerId: string;
+  refreshKey: number;
+}) {
+  const [runs, setRuns] = useState<WorkerRun[]>([]);
+  const [selected, setSelected] = useState<string | null>(null);
+
+  useEffect(() => {
+    workersApi
+      .runs(workerId, 30)
+      .then((r) => {
+        setRuns(r.runs);
+        setSelected((cur) => cur ?? r.runs[0]?.id ?? null);
+      })
+      .catch(() => setRuns([]));
+  }, [workerId, refreshKey]);
+
+  return (
+    <div className="grid gap-4 md:grid-cols-[18rem_1fr]" data-testid="runs-tab">
+      <ul className="space-y-1">
+        {runs.map((r) => (
+          <li key={r.id}>
+            <button
+              type="button"
+              onClick={() => setSelected(r.id)}
+              className={`w-full rounded border px-3 py-2 text-left text-xs ${selected === r.id ? "bg-muted" : ""}`}
+            >
+              <div className="flex items-center justify-between gap-2">
+                <RunStatusBadge status={r.status} />
+                <span className="text-muted-foreground">
+                  {relativeTime(r.queuedAt)}
+                </span>
+              </div>
+              <p className="mt-1 truncate">{r.input || `${r.trigger} run`}</p>
+            </button>
+          </li>
+        ))}
+        {runs.length === 0 && (
+          <li className="text-sm text-muted-foreground">No runs yet.</li>
+        )}
+      </ul>
+      <div>{selected && <RunTimeline key={selected} runId={selected} />}</div>
+    </div>
+  );
+}
+
+export function WorkerDetail({ slug }: { slug: string }) {
+  const [data, setData] = useState<WorkerDetailData | null>(null);
+  const [engines, setEngines] = useState<Record<
+    WorkerEngine,
+    EngineInfo
+  > | null>(null);
+  const [error, setError] = useState<string | null>(null);
+  const [refreshKey, setRefreshKey] = useState(0);
+
+  const load = useCallback(async () => {
+    try {
+      setData(await workersApi.get(slug));
+      setError(null);
+    } catch (e) {
+      setError((e as Error).message);
+    }
+  }, [slug]);
+
+  const changed = useCallback(() => {
+    setRefreshKey((k) => k + 1);
+    void load();
+  }, [load]);
+
+  useEffect(() => {
+    void load();
+    workersApi
+      .list()
+      .then((l) => setEngines(l.engines))
+      .catch(() => setEngines(null));
+    const t = setInterval(() => void load(), 15_000);
+    return () => clearInterval(t);
+  }, [load]);
+
+  const save = async (patch: Partial<WorkerSummary>) => {
+    if (!data) return;
+    setError(null);
+    try {
+      await workersApi.update(data.worker.id, patch);
+      changed();
+    } catch (e) {
+      setError((e as Error).message);
+    }
+  };
+
+  if (!data) {
+    return error ? (
+      <p role="alert" className="text-sm text-destructive">
+        {error}
+      </p>
+    ) : (
+      <p className="text-sm text-muted-foreground">Loading…</p>
+    );
+  }
+
+  const { worker, goals, brief } = data;
+  return (
+    <div className="space-y-6" data-testid="worker-detail">
+      <div className="flex flex-wrap items-start justify-between gap-4">
+        <div className="flex items-center gap-3">
+          <Button variant="ghost" size="sm" asChild aria-label="All workers">
+            <Link href="/workers">
+              <ArrowLeft className="h-4 w-4" />
+            </Link>
+          </Button>
+          <div className="rounded-lg bg-primary/10 p-2 text-primary">
+            <UserCog className="h-5 w-5" aria-hidden />
+          </div>
+          <div>
+            <h1 className="flex items-center gap-2 text-xl font-bold">
+              {worker.name} <StateBadge state={worker.state} />
+            </h1>
+            <p className="text-sm text-muted-foreground">
+              {MODE_LABEL[worker.runMode]} · {worker.engine} · {worker.autonomy}{" "}
+              · next run {relativeTime(worker.nextRunAt)}
+            </p>
+          </div>
+        </div>
+        <div className="flex gap-2">
+          <Button
+            onClick={() =>
+              void workersApi
+                .startRun(worker.id)
+                .then(changed, (e: Error) => setError(e.message))
+            }
+            disabled={worker.state === "running"}
+          >
+            <Play className="mr-1 h-4 w-4" /> Run now
+          </Button>
+          <Button
+            variant="outline"
+            onClick={() => void save({ enabled: !worker.enabled })}
+          >
+            {worker.enabled ? (
+              <Pause className="mr-1 h-4 w-4" />
+            ) : (
+              <Play className="mr-1 h-4 w-4" />
+            )}
+            {worker.enabled ? "Pause" : "Resume"}
+          </Button>
+        </div>
+      </div>
+
+      {worker.pausedReason && (
+        <p className="text-sm text-destructive">{worker.pausedReason}</p>
+      )}
+      {error && (
+        <p role="alert" className="text-sm text-destructive">
+          {error}
+        </p>
+      )}
+
+      <AskBar
+        workerId={worker.id}
+        workerName={worker.name}
+        enabled={worker.enabled}
+        brief={brief}
+        onChanged={changed}
+      />
+
+      <Tabs defaultValue="brief">
+        <TabsList>
+          <TabsTrigger value="brief">Brief</TabsTrigger>
+          <TabsTrigger value="goals">
+            Goals ({goals.filter((g) => g.status === "active").length})
+          </TabsTrigger>
+          <TabsTrigger value="runs">Runs</TabsTrigger>
+          <TabsTrigger value="tools">Tools</TabsTrigger>
+          <TabsTrigger value="schedule">Schedule</TabsTrigger>
+        </TabsList>
+        <TabsContent value="brief" className="pt-4">
+          {brief?.summary ? (
+            <div className="space-y-2" data-testid="brief">
+              <p className="text-xs text-muted-foreground">
+                Latest report · {localTime(brief.finishedAt)} · {brief.trigger}
+              </p>
+              <Markdown text={brief.summary} />
+            </div>
+          ) : (
+            <p className="text-sm text-muted-foreground">
+              No report yet. Add goals, then press Run now or ask a question.
+            </p>
+          )}
+        </TabsContent>
+        <TabsContent value="goals" className="pt-4">
+          <GoalsTab workerId={worker.id} goals={goals} onChanged={changed} />
+        </TabsContent>
+        <TabsContent value="runs" className="pt-4">
+          <RunsTab workerId={worker.id} refreshKey={refreshKey} />
+        </TabsContent>
+        <TabsContent value="tools" className="pt-4">
+          <ToolsTab worker={worker} engines={engines} onSave={save} />
+        </TabsContent>
+        <TabsContent value="schedule" className="pt-4">
+          <ScheduleTab key={worker.updatedAt} worker={worker} onSave={save} />
+        </TabsContent>
+      </Tabs>
+    </div>
+  );
+}
diff --git a/components/workers/WorkersList.tsx b/components/workers/WorkersList.tsx
new file mode 100644
index 0000000..d9b9d22
--- /dev/null
+++ b/components/workers/WorkersList.tsx
@@ -0,0 +1,166 @@
+"use client";
+
+import Link from "next/link";
+import { useCallback, useEffect, useState } from "react";
+import { Play, Plus, RefreshCw, UserCog } from "lucide-react";
+import { Button } from "@/components/ui/button";
+import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
+import { workersApi, type WorkersList as ListData } from "./api";
+import { MODE_LABEL, StateBadge, relativeTime } from "./format";
+
+export function WorkersList() {
+  const [data, setData] = useState<ListData | null>(null);
+  const [error, setError] = useState<string | null>(null);
+  const [busy, setBusy] = useState<string | null>(null);
+
+  const load = useCallback(async () => {
+    try {
+      setData(await workersApi.list());
+      setError(null);
+    } catch (e) {
+      setError((e as Error).message);
+    }
+  }, []);
+
+  useEffect(() => {
+    void load();
+    const t = setInterval(() => void load(), 10_000);
+    return () => clearInterval(t);
+  }, [load]);
+
+  const act = async (key: string, fn: () => Promise<unknown>) => {
+    setBusy(key);
+    try {
+      await fn();
+      await load();
+    } catch (e) {
+      setError((e as Error).message);
+    } finally {
+      setBusy(null);
+    }
+  };
+
+  const existing = new Set(data?.workers.map((w) => w.slug));
+  const missingTemplates =
+    data?.templates.filter((t) => !existing.has(t.slug)) ?? [];
+
+  return (
+    <div className="space-y-4" data-testid="workers-list">
+      {error && (
+        <p role="alert" className="text-sm text-destructive">
+          {error}
+        </p>
+      )}
+
+      {data && (
+        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
+          {Object.entries(data.engines).map(([id, e]) => (
+            <span
+              key={id}
+              className="rounded border px-2 py-0.5"
+              title={e.note}
+            >
+              {id}: {e.available ? "ready" : "unavailable"}
+            </span>
+          ))}
+          {!data.schedulerLeader && (
+            <span className="rounded border px-2 py-0.5">
+              scheduler: standby on this instance
+            </span>
+          )}
+          <Button
+            variant="ghost"
+            size="sm"
+            onClick={() => void load()}
+            aria-label="Refresh"
+          >
+            <RefreshCw className="h-4 w-4" />
+          </Button>
+        </div>
+      )}
+
+      {missingTemplates.map((t) => (
+        <Card key={t.slug} className="border-dashed">
+          <CardContent className="flex items-center justify-between gap-4 py-4">
+            <div>
+              <p className="font-medium">{t.name}</p>
+              <p className="text-sm text-muted-foreground">{t.description}</p>
+            </div>
+            <Button
+              onClick={() =>
+                void act(`create-${t.slug}`, () =>
+                  workersApi.createFromTemplate(t.slug),
+                )
+              }
+              disabled={busy !== null}
+              data-testid={`create-${t.slug}`}
+            >
+              <Plus className="mr-1 h-4 w-4" /> Add worker
+            </Button>
+          </CardContent>
+        </Card>
+      ))}
+
+      <div className="grid gap-4 md:grid-cols-2">
+        {data?.workers.map((w) => (
+          <Card key={w.id} data-testid={`worker-card-${w.slug}`}>
+            <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
+              <div className="flex items-center gap-2">
+                <UserCog className="h-5 w-5 text-primary" aria-hidden />
+                <CardTitle className="text-base">
+                  <Link href={`/workers/${w.slug}`} className="hover:underline">
+                    {w.name}
+                  </Link>
+                </CardTitle>
+              </div>
+              <StateBadge state={w.state} />
+            </CardHeader>
+            <CardContent className="space-y-3 text-sm">
+              <p className="text-muted-foreground">{w.description}</p>
+              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
+                <dt className="text-muted-foreground">Mode</dt>
+                <dd>
+                  {MODE_LABEL[w.runMode]}
+                  {w.enabled ? "" : " (paused)"}
+                </dd>
+                <dt className="text-muted-foreground">Engine</dt>
+                <dd>{w.engine}</dd>
+                <dt className="text-muted-foreground">Goals</dt>
+                <dd>{w.activeGoals} active</dd>
+                <dt className="text-muted-foreground">Last run</dt>
+                <dd>
+                  {w.lastRun
+                    ? `${w.lastRun.status}, ${relativeTime(w.lastRun.queuedAt)}`
+                    : "never"}
+                </dd>
+                <dt className="text-muted-foreground">Next run</dt>
+                <dd>{relativeTime(w.nextRunAt)}</dd>
+              </dl>
+              {w.pausedReason && (
+                <p className="text-xs text-destructive">{w.pausedReason}</p>
+              )}
+              <div className="flex gap-2">
+                <Button
+                  size="sm"
+                  onClick={() =>
+                    void act(`run-${w.id}`, () => workersApi.startRun(w.id))
+                  }
+                  disabled={busy !== null || w.state === "running"}
+                >
+                  <Play className="mr-1 h-4 w-4" /> Run now
+                </Button>
+                <Button size="sm" variant="outline" asChild>
+                  <Link href={`/workers/${w.slug}`}>Open</Link>
+                </Button>
+              </div>
+            </CardContent>
+          </Card>
+        ))}
+      </div>
+
+      {data && data.workers.length === 0 && missingTemplates.length === 0 && (
+        <p className="text-sm text-muted-foreground">No workers yet.</p>
+      )}
+    </div>
+  );
+}

hook: PostToolUse
hook: PostToolUse Completed
hook: PreToolUse
hook: PreToolUse Completed
exec
/bin/zsh -lc "git diff origin/main...HEAD -- lib/workers/events.ts scripts/workers-cli.ts; cat vitest.config.ts; sed -n '260,330p' docs/plans/digital-workers.md" in /Users/jasonpoley/prj/dx/src/daax-web
 succeeded in 24ms:

## 9. Decisions requiring approval

| #   | Decision             | Recommended                                                                                                                                                                                                                                                                          | Alternatives (cost / risk)                                                                                           |
| --- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| D1  | Worker brain         | **APPROVED (amended): all three are engines, chosen per worker** — `claude-cli` (default, `claude -p`, subscription login), `codex-cli` (`codex exec --json`, subscription login), `agent-sdk` (`@anthropic-ai/claude-agent-sdk`, in-process, requires `ANTHROPIC_API_KEY`, metered) | —                                                                                                                    |
| D2  | Engine host          | Web process (`instrumentation.ts`) + pg advisory-lock leader                                                                                                                                                                                                                         | New `daax-workers` service — cleanest isolation, but a third process in every mode; terminal plane — has no Postgres |
| D3  | Cron parsing         | `croner` (zero-dependency, MIT)                                                                                                                                                                                                                                                      | `cron-parser` (deps on luxon); hand-rolled — error-prone                                                             |
| D4  | TPM default autonomy | `propose` (read everything, write nothing)                                                                                                                                                                                                                                           | `act` by default — faster but writes to Backlog/GitHub unattended                                                    |
| D5  | Voice                | Browser-native STT (existing) + `speechSynthesis` TTS                                                                                                                                                                                                                                | Server Whisper/TTS — new service, better accuracy, costs                                                             |
| D6  | CLI                  | `bun run workers` in this repo over REST                                                                                                                                                                                                                                             | Add to Go `daax-cli` — separate repo and release train                                                               |

## 10. Delivery — one branch, reviewable commits

1. Migration + `lib/workers/store.ts` + types + unit tests (mocked pg) +
   integration test (real pg, migration round-trip).
2. Runner (prompt builder, MCP config writer, command builder, stream-json
   parser, executors) + scheduler (cron, continuous, caps, leader lock) + tests.
3. REST API `/api/workers/*` + RBAC permissions + route tests + auth audit.
4. TPM template (seeded, disabled until the operator enables it) + instructions.
5. UI: `/workers` list + detail tabs + ask bar + voice + nav/home/config wiring
   - component tests + Playwright spec.
6. CLI + tests.
7. Docs (CLAUDE.md section), decision log `.logs/decisions/digital-workers.jsonl`.

Definition of done: `bun run lint`, `typecheck`, `format:check`, `test`,
`test:integration`, `test:e2e` for the new spec, `bun run build`, and
`docker build --target runner` all pass; cross-provider validation (Codex)
recorded in the PR; Backlog task updated.

## 10a. Implementation notes (as built)

- **MCP trust boundary (residual risk, stated plainly)**: autonomy controls
  which MCP _tools the agent may call_. It cannot control what a third-party
  MCP server does inside a tool it labels read-only (`readOnlyHint: true` is a
  self-declaration; the MCP spec treats annotations as hints, not guarantees).
  A server is arbitrary code the operator chose to run. Give every worker MCP
  server **read-only credentials** (read-only DB user, fine-grained read token)
  when the worker is `observe`/`propose`; that, not the annotation, is the
  enforcement for what the server itself can change.
- **Tool classification** (`lib/workers/mcp.ts`): before each run every MCP
  server is started and its tools listed. A tool is read-only when annotated
  `readOnlyHint: true`, or when its name contains a read word and no write
  word (`task_list` read, `task_create` write). Unknown names are writes. A
  server whose tools cannot be listed is dropped from the run (fail closed).
- **Claude engines**: `--permission-mode dontAsk` + exact `--allowedTools`
  (`Read`/`Glob`/`Grep` + permitted `mcp__server__tool`) + `--disallowedTools`
  (Bash, Edit, Write, WebFetch, credential paths, non-permitted MCP tools). No
  shell at all: prefix rules cannot make a shell read-only (`git diff
--output=<file>` writes);
  `--setting-sources ""` so the operator's personal hooks and settings do not
  run inside workers (OAuth login still works; `--bare` would disable it).
- **Codex engine**: an isolated per-run `CODEX_HOME` with a generated
  `config.toml` (only the worker's servers, `enabled_tools` = permitted tools,
  `default_tools_approval_mode = "approve"`, `approval_policy = "never"`,
  `sandbox_mode = "read-only"`) and the login symlinked (host) or copied
  (container). Env values are passed by name (`env_vars`), never written.
- **Secrets**: MCP credentials go only into that server's config (Claude
  `mcp.json` / codex per-server `env` table, 0600, deleted after the run),
  never the agent env; daax/engine variables (DATABASE*URL, DAAX*\*, …) cannot
  be passed through; events, reports and errors are redacted
  (`lib/redaction/mask.ts` patterns + known secret values) before storage.
- **Lifecycle**: one deadline from claim covers discovery, signals and the
  engine; cancel is checked before every phase and can be requested from any
  instance (persisted, applied by the leader within one tick). Where a run
  executes is recorded **before** anything is spawned (`container:<name>` or
  `host:pending`, then `host:<pgid>|<start>`); if that write fails nothing
  starts. Host runs have their own process group. Every execution gets a
  fresh random **nonce** (UUID) that exists only in its executor reference
  (`host:pending#<nonce>`, `host:<pgid>|<start>#<nonce>`) and is placed on
  the engine's command line (`(daax-run:<nonce>)` in the prompt,

hook: PostToolUse
hook: PostToolUse Completed
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Completed
hook: PreToolUse Completed
hook: PreToolUse Completed
exec
/bin/zsh -lc "cat tests/lib/workers/mcp.test.ts; sed -n '1,250p' tests/lib/workers/scheduler.test.ts; cat tests/components/workers/ask-bar.test.tsx; rg -n 'disabled|stop|onTranscript' components/ui/voice-input.tsx" in /Users/jasonpoley/prj/dx/src/daax-web
 succeeded in 0ms:
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { discoverAllMcps } = vi.hoisted(() => ({ discoverAllMcps: vi.fn() }));
vi.mock("@/lib/mcp-config", () => ({ discoverAllMcps }));

import {
  isReadOnlyTool,
  isReservedEnvName,
  listServerTools,
  nameWords,
  resolveMcpServers,
} from "@/lib/workers/mcp";

describe("nameWords", () => {
  it("splits snake, kebab, dotted, slash and camelCase", () => {
    expect(nameWords("task_list")).toEqual(["task", "list"]);
    expect(nameWords("get-file.contents/v2")).toEqual([
      "get",
      "file",
      "contents",
      "v2",
    ]);
    expect(nameWords("listIssues")).toEqual(["list", "issues"]);
    expect(nameWords("createPullRequest")).toEqual([
      "create",
      "pull",
      "request",
    ]);
    expect(nameWords("get2Things")).toEqual(["get2", "things"]);
    expect(nameWords("")).toEqual([]);
  });
});

describe("isReadOnlyTool", () => {
  it.each([
    "task_list",
    "task_search",
    "task_view",
    "document_view",
    "get_workflow_overview",
    "milestone_list",
    "listIssues",
    "getFileContents",
  ])("%s is read-only", (name) => {
    expect(isReadOnlyTool({ name })).toBe(true);
  });

  it.each([
    "task_create",
    "task_edit",
    "task_archive",
    "task_complete",
    "milestone_add",
    "document_update",
    "createIssue",
    "list_and_delete",
    "execute_query",
    "run_sql",
    "query_sql",
    "call_api",
    "invoke_function",
    "get_and_apply",
    "list_then_sync",
    "shell_status",
    "restart_service",
    "frobnicate",
    "",
  ])("%s is a write (or unknown → write)", (name) => {
    expect(isReadOnlyTool({ name })).toBe(false);
  });

  it("annotations win over the name", () => {
    expect(
      isReadOnlyTool({
        name: "frobnicate",
        annotations: { readOnlyHint: true },
      }),
    ).toBe(true);
    expect(
      isReadOnlyTool({
        name: "task_create",
        annotations: { readOnlyHint: true },
      }),
    ).toBe(true);
    expect(
      isReadOnlyTool({
        name: "task_list",
        annotations: { readOnlyHint: false },
      }),
    ).toBe(false);
    expect(
      isReadOnlyTool({
        name: "task_list",
        annotations: { readOnlyHint: true, destructiveHint: true },
      }),
    ).toBe(false);
    expect(isReadOnlyTool({ name: "task_list", annotations: {} })).toBe(true);
  });
});

describe("isReservedEnvName", () => {
  it.each([
    "DATABASE_URL",
    "PGPASSWORD",
    "PGHOST",
    "DAAX_WS_TOKEN_SECRET",
    "WORKERS_MAX_CONCURRENT",
    "ANTHROPIC_API_KEY",
    "CLAUDE_CONFIG_DIR",
    "CODEX_HOME",
    "OPENAI_API_KEY",
    "NEXT_PUBLIC_X",
    "NODE_OPTIONS",
    "PATH",
    "HOME",
    "SHELL",
    "LD_PRELOAD",
    "DYLD_INSERT_LIBRARIES",
    "HOST_WORKSPACE_PATH",
  ])("%s is reserved", (name) => {
    expect(isReservedEnvName(name)).toBe(true);
  });

  it.each([
    "GITHUB_TOKEN",
    "GH_TOKEN",
    "LINEAR_API_KEY",
    "PATHS",
    "MY_HOME",
    "XDAAX_Y",
  ])("%s is not reserved", (name) => {
    expect(isReservedEnvName(name)).toBe(false);
  });
});

describe("resolveMcpServers", () => {
  beforeEach(() => discoverAllMcps.mockReset());

  it("inline: passes through only named env vars that are present, never others", () => {
    const env = {
      GITHUB_TOKEN: "ghp_x",
      OTHER_SECRET: "nope",
    } as unknown as NodeJS.ProcessEnv;
    const { resolved, missing } = resolveMcpServers(
      [
        {
          kind: "inline",
          id: "gh",
          type: "stdio",
          command: "gh-mcp",
          envPassthrough: ["GITHUB_TOKEN", "NOT_SET"],
        },
        {
          kind: "inline",
          id: "remote",
          type: "http",
          url: "https://x.example/mcp",
        },
      ],
      "/workspace",
      env,
    );
    expect(missing).toEqual([]);
    expect(resolved).toEqual([
      {
        id: "gh",
        type: "stdio",
        command: "gh-mcp",
        args: [],
        url: undefined,
        env: { GITHUB_TOKEN: "ghp_x" },
      },
      {
        id: "remote",
        type: "http",
        command: undefined,
        args: [],
        url: "https://x.example/mcp",
        env: {},
      },
    ]);
    // Discovery is not consulted when there are no refs.
    expect(discoverAllMcps).not.toHaveBeenCalled();
  });

  it("inline: reserved names are never passed through, even when listed", () => {
    const env = {
      GITHUB_TOKEN: "ghp_x",
      DATABASE_URL: "postgres://u:pw@db/daax",
      DAAX_WS_TOKEN_SECRET: "s",
      ANTHROPIC_API_KEY: "sk-ant",
      PATH: "/evil",
    } as unknown as NodeJS.ProcessEnv;
    const { resolved } = resolveMcpServers(
      [
        {
          kind: "inline",
          id: "gh",
          type: "stdio",
          command: "gh-mcp",
          envPassthrough: [
            "GITHUB_TOKEN",
            "DATABASE_URL",
            "DAAX_WS_TOKEN_SECRET",
            "ANTHROPIC_API_KEY",
            "PATH",
          ],
        },
      ],
      "/workspace",
      env,
    );
    expect(resolved[0].env).toEqual({ GITHUB_TOKEN: "ghp_x" });
  });

  it("ref: resolves from discovery, reports missing and invalid-URL refs", () => {
    discoverAllMcps.mockReturnValue({
      mcps: [
        {
          id: "github",
          config: { command: "npx", args: ["gh"], env: { GH_TOKEN: "t" } },
        },
        { id: "remote", config: { url: "https://r.example/mcp" } },
        { id: "badurl", config: { type: "http", url: "ftp://x" } },
        { id: "noconfig" },
      ],
    });
    const { resolved, missing } = resolveMcpServers(
      [
        { kind: "ref", id: "github" },
        { kind: "ref", id: "remote" },
        { kind: "ref", id: "badurl" },
        { kind: "ref", id: "noconfig" },
        { kind: "ref", id: "ghost" },
      ],
      "/workspace/proj",
      {} as unknown as NodeJS.ProcessEnv,
    );
    expect(discoverAllMcps).toHaveBeenCalledWith("/workspace/proj");
    expect(resolved).toEqual([
      {
        id: "github",
        type: "stdio",
        command: "npx",
        args: ["gh"],
        url: undefined,
        env: { GH_TOKEN: "t" },
      },
      {
        id: "remote",
        type: "http",
        command: undefined,
        args: [],
        url: "https://r.example/mcp",
        env: {},
      },
    ]);
    expect(missing).toEqual([
      "badurl (invalid URL)",
      "noconfig (not found in MCP configuration)",
      "ghost (not found in MCP configuration)",
    ]);
  });
});

describe("listServerTools (stdio)", () => {
  const dir = mkdtempSync(join(tmpdir(), "daax-mcp-test-"));
  const server = join(dir, "server.js");
  // A minimal line-delimited JSON-RPC MCP server. Tool names echo the cwd
  // and an env var so the test can see what the child was started with.
  writeFileSync(
    server,
    `const rl = require("readline").createInterface({ input: process.stdin });
rl.on("line", (l) => {
  const m = JSON.parse(l);
  if (process.env.HANG) return;
  if (m.id === 1) process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: 1, result: {} }) + "\\n");
  if (m.id === 2) process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: 2, result: { tools: [
    { name: "task_list" },
    { name: "task_create" },
    { name: "frob", annotations: { readOnlyHint: true } },
    { name: "cwd=" + process.cwd() },
    { name: "token=" + (process.env.MY_TOKEN || "") },
    { nope: 1 },
  ] } }) + "\\n");
});
`,
  );
  const base = {
    id: "fake",
    type: "stdio" as const,
    command: process.execPath,
    args: [server],
  };

  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("lists and classifies tools, in the given cwd, with only the server env", async () => {
    const tools = await listServerTools(
      { ...base, env: { MY_TOKEN: "abc" } },
      { cwd: dir },
    );
    expect(tools).toEqual([
      { name: "task_list", readOnly: true },
      { name: "task_create", readOnly: false },
      { name: "frob", readOnly: true },
      { name: `cwd=${realpathSync(dir)}`, readOnly: false },
      { name: "token=abc", readOnly: false },
    ]);
  });

  it("rejects when aborted", async () => {
    const controller = new AbortController();
    const p = listServerTools(
      { ...base, env: { HANG: "1" } },
      { cwd: dir, signal: controller.signal },
    );
    setTimeout(() => controller.abort(), 200);
    await expect(p).rejects.toThrow();
  });

  it("rejects when the command cannot start", async () => {
    await expect(
      listServerTools({
        ...base,
        command: join(dir, "missing-binary"),
        env: {},
      }),
    ).rejects.toThrow(/failed to start|exited/);
  });
});
import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";

const st = vi.hoisted(() => {
  class RunConflictError extends Error {}
  return {
    RunConflictError,
    cancelQueuedRun: vi.fn(),
    cancelRequestedAmong: vi.fn(),
    countAutomaticRunsSince: vi.fn(),
    createRun: vi.fn(),
    failRunningRun: vi.fn(),
    lastRunsByWorker: vi.fn(),
    listQueuedRuns: vi.fn(),
    listRunningRuns: vi.fn(),
    listWorkers: vi.fn(),
    pruneRuns: vi.fn(),
    requestCancel: vi.fn(),
  };
});
const cli = vi.hoisted(() => ({
  stopHostRunAndWait: vi.fn(async (_id: string, _ref: string) => undefined),
  stopExecutionAndWait: vi.fn(async (_ref: string) => undefined),
  removeLabelledContainers: vi.fn(),
  resolveExecutor: vi.fn(() => "host"),
  stopExecution: vi.fn(),
}));
const { getClient, spawnSync } = vi.hoisted(() => ({
  getClient: vi.fn(),
  spawnSync: vi.fn(),
}));
vi.mock("@/lib/db/pg", () => ({ getClient, query: vi.fn() }));
vi.mock("@/lib/workers/runner", () => ({ executeRun: vi.fn() }));
vi.mock("@/lib/workers/store", () => st);
vi.mock("@/lib/workers/cli-runner", () => cli);
vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return { ...actual, default: { ...actual, spawnSync }, spawnSync };
});

import {
  WorkerScheduler,
  automaticTriggerDue,
  nextCronRun,
  nextRunAt,
} from "@/lib/workers/scheduler";
import type { RunStatus, Worker } from "@/types/workers";

const at = (s: string) => new Date(s);
const sched = {
  enabled: true,
  runMode: "schedule" as const,
  cron: "0 8 * * *",
  cooldownSeconds: 900,
};
const cont = {
  enabled: true,
  runMode: "continuous" as const,
  cron: null,
  cooldownSeconds: 900,
};
const run = (
  status: RunStatus,
  finishedAt: string | null,
  queuedAt = "2026-09-26T07:00:00Z",
) => ({
  status,
  finishedAt,
  queuedAt,
});

describe("nextCronRun", () => {
  it("returns the next UTC fire strictly after `after`, null for invalid", () => {
    expect(
      nextCronRun("0 8 * * *", at("2026-09-26T07:59:00Z"))?.toISOString(),
    ).toBe("2026-09-26T08:00:00.000Z");
    expect(
      nextCronRun("0 8 * * *", at("2026-09-26T08:00:00Z"))?.toISOString(),
    ).toBe("2026-09-27T08:00:00.000Z");
    expect(nextCronRun("garbage", new Date())).toBeNull();
  });
});

describe("automaticTriggerDue", () => {
  it("schedule: due when a fire time falls in (lastEvaluated, now]", () => {
    expect(
      automaticTriggerDue(
        sched,
        null,
        at("2026-09-26T07:59:30Z"),
        at("2026-09-26T08:00:00Z"),
      ),
    ).toBe(true);
    expect(
      automaticTriggerDue(
        sched,
        null,
        at("2026-09-26T07:59:30Z"),
        at("2026-09-26T08:00:10Z"),
      ),
    ).toBe(true);
  });

  it("schedule: not due before the fire time or once it was already evaluated", () => {
    expect(
      automaticTriggerDue(
        sched,
        null,
        at("2026-09-26T07:00:00Z"),
        at("2026-09-26T07:59:59Z"),
      ),
    ).toBe(false);
    expect(
      automaticTriggerDue(
        sched,
        null,
        at("2026-09-26T08:00:00Z"),
        at("2026-09-26T08:00:30Z"),
      ),
    ).toBe(false);
  });

  it("schedule without cron / with invalid cron is never due", () => {
    const now = at("2026-09-26T08:00:00Z");
    const before = at("2026-09-26T07:00:00Z");
    expect(
      automaticTriggerDue({ ...sched, cron: null }, null, before, now),
    ).toBe(false);
    expect(
      automaticTriggerDue({ ...sched, cron: "nope" }, null, before, now),
    ).toBe(false);
  });

  it("disabled workers and adhoc workers are never due", () => {
    const now = at("2026-09-26T08:00:00Z");
    const before = at("2026-09-26T07:00:00Z");
    expect(
      automaticTriggerDue({ ...sched, enabled: false }, null, before, now),
    ).toBe(false);
    expect(
      automaticTriggerDue({ ...cont, enabled: false }, null, before, now),
    ).toBe(false);
    expect(
      automaticTriggerDue({ ...cont, runMode: "adhoc" }, null, before, now),
    ).toBe(false);
  });

  it.each(["queued", "running"] as const)(
    "an active (%s) run blocks both modes",
    (status) => {
      const now = at("2026-09-26T08:00:00Z");
      const before = at("2026-09-26T07:00:00Z");
      expect(automaticTriggerDue(sched, run(status, null), before, now)).toBe(
        false,
      );
      expect(
        automaticTriggerDue(
          cont,
          run(status, null, "2026-09-20T00:00:00Z"),
          before,
          now,
        ),
      ).toBe(false);
    },
  );

  it("continuous: due with no prior run, then after the cooldown", () => {
    const now = at("2026-09-26T08:00:00Z");
    expect(automaticTriggerDue(cont, null, now, now)).toBe(true);
    // finished 14m59s ago, cooldown 15m → not due
    expect(
      automaticTriggerDue(
        cont,
        run("succeeded", "2026-09-26T07:45:01Z"),
        now,
        now,
      ),
    ).toBe(false);
    // exactly 15m → due
    expect(
      automaticTriggerDue(
        cont,
        run("failed", "2026-09-26T07:45:00Z"),
        now,
        now,
      ),
    ).toBe(true);
    // falls back to queuedAt when finishedAt is null
    expect(
      automaticTriggerDue(
        cont,
        run("cancelled", null, "2026-09-26T07:50:00Z"),
        now,
        now,
      ),
    ).toBe(false);
  });
});

describe("nextRunAt", () => {
  const now = at("2026-09-26T07:00:00Z");
  it("schedule → next cron fire; disabled/adhoc → null", () => {
    expect(nextRunAt(sched, null, now)).toBe("2026-09-26T08:00:00.000Z");
    expect(nextRunAt({ ...sched, enabled: false }, null, now)).toBeNull();
    expect(nextRunAt({ ...cont, runMode: "adhoc" }, null, now)).toBeNull();
    expect(nextRunAt({ ...sched, cron: "bad" }, null, now)).toBeNull();
  });
  it("continuous → now with no run, null while active, else finish + cooldown", () => {
    expect(nextRunAt(cont, null, now)).toBe(now.toISOString());
    expect(nextRunAt(cont, run("running", null), now)).toBeNull();
    expect(nextRunAt(cont, run("succeeded", "2026-09-26T06:50:00Z"), now)).toBe(
      "2026-09-26T07:05:00.000Z",
    );
  });
});

type Internals = {
  started: boolean;
  inFlight: Map<string, AbortController>;
  leaderSince: Date;
  tick(): Promise<void>;
  createDueRuns(now: Date): Promise<void>;
};
// Tests drive tick() directly; mark the scheduler started as start() would
// (without the interval timer).
const internals = (s: WorkerScheduler) => {
  const i = s as unknown as Internals;
  i.started = true;
  return i;
};

function lockClient(locked = true) {
  const client = Object.assign(new EventEmitter(), {
    query: vi.fn(async (sql: string) =>
      sql.includes("pg_try_advisory_lock")
        ? { rows: [{ ok: locked }] }
        : { rows: [] },
    ),
    release: vi.fn(),
  });
  getClient.mockResolvedValue(client);
  return client;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  cli.resolveExecutor.mockReturnValue("host");
  st.cancelRequestedAmong.mockResolvedValue([]);
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
});
9:// Dynamic import with SSR disabled - the component is in a separate file

hook: PostToolUse
exec
/bin/zsh -lc 'node node_modules/eslint/bin/eslint.js lib/workers app/api/workers app/workers components/workers migrations/1781568000400_digital-workers.js scripts/workers-cli.ts' in /Users/jasonpoley/prj/dx/src/daax-web
exec
/bin/zsh -lc 'node node_modules/prettier/bin/prettier.cjs --check lib/workers app/api/workers app/workers components/workers migrations/1781568000400_digital-workers.js scripts/workers-cli.ts' in /Users/jasonpoley/prj/dx/src/daax-web
exec
/bin/zsh -lc 'node node_modules/typescript/bin/tsc --noEmit --incremental false' in /Users/jasonpoley/prj/dx/src/daax-web
hook: PostToolUse Completed
 succeeded in 426ms:
All matched files use Prettier code style!

hook: PostToolUse
hook: PostToolUse Completed
 succeeded in 2176ms:
 succeeded in 9337ms:
hook: PreToolUse
hook: PostToolUse
hook: PostToolUse
hook: PreToolUse Completed
hook: PostToolUse Completed
hook: PostToolUse Completed
exec
/bin/zsh -lc "rg -n 'initialized|protocolVersion' node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js node_modules/@modelcontextprotocol/sdk/dist/esm/server/streamableHttp.js; cat components/ui/voice-input.tsx; rg -n 'disabled|startListening' components/ui/voice-input-client.tsx; sed -n '320,440p' tests/lib/workers/scheduler.test.ts; sed -n '805,865p' lib/workers/cli-runner.ts; git diff 8fba44f"'^1..8fba44f --name-only; cat tsconfig.json' in /Users/jasonpoley/prj/dx/src/daax-web
 succeeded in 38ms:
.logs/decisions/agentview.jsonl
.logs/decisions/extra-allowed-origins.jsonl
.logs/decisions/host-shell-admin.jsonl
.logs/decisions/idp-per-host.jsonl
app/api/agentview/[...path]/route.ts
app/api/auth/user/route.ts
app/api/terminal/ticket/route.ts
components/agentview/AgentViewPanel.tsx
components/agentview/BreakIn.tsx
components/agentview/breakin.ts
components/layout/UserMenu.tsx
deploy/docker-compose.yml
deploy/env/README.md
deploy/env/cloud.env
deploy/env/galway.env
deploy/env/kinsale.env
deploy/env/muckross.env
deploy/host/daax-host.service
deploy/host/daax-host.sh
deploy/traefik-daax.yml.tpl
hooks/use-auth-user.ts
instrumentation.ts
lib/agentview/client.ts
lib/agentview/resume.ts
lib/auth-trust.ts
lib/auth-types.ts
lib/auth.ts
lib/host-shell-access.ts
lib/idp-urls.ts
lib/ws-ticket.ts
scripts/auth-audit-lib.ts
scripts/deploy-lib.sh
scripts/deploy.sh
scripts/spiffe-credential-helper.sh
server/config/extra-origins-boot.ts
server/config/origin-allowlist.ts
server/handlers/command-handler.ts
server/handlers/connection-handler.ts
server/handlers/ws-auth.ts
server/sessions/pty-env.ts
server/terminal-server.ts
tests/api/agentview-proxy-route.test.ts
tests/api/auth-user-route.test.ts
tests/api/terminal-ticket-route.test.ts
tests/components/agentview/breakin-container.test.tsx
tests/components/agentview/breakin-ended.test.tsx
tests/components/agentview/breakin-state.test.tsx
tests/components/agentview/breakin.test.tsx
tests/components/agentview/fixtures.ts
tests/components/layout/user-menu.test.tsx
tests/deploy/daax-host-idp.test.ts
tests/deploy/deploy-idp-preflight.test.ts
tests/deploy/deploy-phased.test.ts
tests/deploy/traefik-proxy-secret.test.ts
tests/e2e/agentview-breakin.spec.ts
tests/e2e/auth-navigation.auth.spec.ts
tests/e2e/auth-navigation.noauth.spec.ts
tests/e2e/auth.setup.ts
tests/e2e/fixtures/agentview-daemon.mjs
tests/lib/auth.test.ts
tests/lib/idp-urls.test.ts
tests/lib/no-auth-poley-dev.test.ts
tests/middleware.test.ts
tests/scripts/audit-auth-routes.test.ts
tests/scripts/spiffe-credential-helper.test.ts
tests/server/config/extra-origins-boot.test.ts
tests/server/config/origin-allowlist.test.ts
tests/server/handlers/command-handler.test.ts
tests/server/handlers/connection-command.test.ts
tests/server/handlers/host-shell-admin.test.ts
tests/server/handlers/ws-auth.test.ts
tests/server/sessions/pty-env.test.ts
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts",
    ".next/dev/types/**/*.ts",
    "**/*.mts"
  ],
  "exclude": ["node_modules", "ext-research", "examples", "packages/*/examples", "tests/testcontainers"]
}

hook: PostToolUse
hook: PostToolUse Completed
hook: PreToolUse
hook: PreToolUse Completed
exec
/bin/zsh -lc "node <<'NODE'
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, mocks = {}, extra = {}) {
  const source = fs.readFileSync(file, 'utf8');
  const js = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const module = {exports:{}};
  vm.runInNewContext(js, {module,exports:module.exports,require:(name)=>name in mocks ? mocks[name] : require(name),process,console,URL,Response,AbortSignal,setTimeout,clearTimeout,...extra}, {filename:file});
  return module.exports;
}
(async()=>{
  const requests=[];
  let initialized=false;
  const mcp=load('lib/workers/mcp.ts',{'@/lib/mcp-config':{},'@/lib/mcp-route-helpers':{},'./events':{}},{fetch:async(url,init)=>{
    const msg=JSON.parse(init.body); requests.push(msg.method);
    if(msg.method==='initialize')return new Response(JSON.stringify({jsonrpc:'2.0',id:1,result:{protocolVersion:'2025-06-18',capabilities:{tools:{}}}}),{headers:{'mcp-session-id':'test'}});
    if(msg.method==='notifications/initialized'){initialized=true;return new Response(null,{status:202});}
    return new Response(JSON.stringify(initialized ? {jsonrpc:'2.0',id:2,result:{tools:[{name:'get_status'}]}} : {jsonrpc:'2.0',id:2,error:{code:-32000,message:'Client not initialized'}}));
  }});
  const tools=await mcp.listServerTools({id:'remote',type:'http',url:'https://example.invalid/mcp',env:{}});
  console.log('HTTP discovery:',JSON.stringify({requests,initialized,tools}));
  const React=require('react');
  const hookMock={...React,useEffect:()=>{},useRef:(value)=>({current:value}),useState:(value)=>[value,()=>{}]};
  const ask=load('components/workers/AskBar.tsx',{'react':hookMock,'@/components/ui/button':{Button:'button'},'@/components/ui/textarea':{Textarea:'textarea'},'@/components/ui/voice-input':{VoiceInput:'voice'},'@/types/workers':{TERMINAL_RUN_STATUSES:['succeeded','failed','cancelled','timeout']},'./api':{workersApi:{}},'./RunTimeline':{useRunFollower:()=>({run:{id:'r1',status:'running'},events:[]})},'./Markdown':{Markdown:'markdown'},'./format':{RunStatusBadge:'badge'},'./voice':{}});
  const tree=ask.AskBar({workerId:'w1',workerName:'TPM',enabled:true,brief:null,onChanged:()=>{}});
  const controls=[];
  function walk(e){if("'!e||typeof e!=='"'object')return;if(['textarea','voice','button'].includes(e.type))controls.push({type:e.type,label:e.props['aria-label'],disabled:e.props.disabled});React.Children.forEach(e.props?.children,walk);}
  walk(tree); console.log('Active ask controls:',JSON.stringify(controls));
})();
NODE" in /Users/jasonpoley/prj/dx/src/daax-web
 succeeded in 152ms:
HTTP discovery: {"requests":["initialize","tools/list"],"initialized":false,"tools":[]}
Active ask controls: [{"type":"textarea","label":"Ask the worker","disabled":true},{"type":"voice","disabled":true},{"type":"button","label":"Send","disabled":true},{"type":"button","label":"Read answers aloud"}]

hook: PostToolUse
hook: PostToolUse Completed
codex
Two defects are confirmed: HTTP MCP discovery omits the initialized notification and silently treats a JSON-RPC error as an empty tool list; the ask bar disables typed and voice cancellation while its run is active. Typecheck, scoped lint, and scoped formatting checks passed. A final check is covering CLI event pagination.
hook: PreToolUse
hook: PreToolUse Completed
exec
/bin/zsh -lc "node <<'NODE'
const fs=require('node:fs'); const ts=require('typescript'); const vm=require('node:vm');
const source=fs.readFileSync('scripts/workers-cli.ts','utf8').replace('import.meta.url','\"file:///non-entrypoint.ts\"');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const moduleStub={exports:{}};
vm.runInNewContext(code,{module:moduleStub,exports:moduleStub.exports,require:(n)=>n==='../types/workers'?{TERMINAL_RUN_STATUSES:['succeeded','failed','cancelled','timeout']}:require(n),process,console,URL,Response,setTimeout});
(async()=>{
const paths=[]; const output=[];
const code=await moduleStub.exports.runCli(['logs','11111111-1111-1111-1111-111111111111'],{env:{},sleep:async()=>{},out:(s)=>output.push(s),err:console.error,fetch:async(url)=>{paths.push(url); const second=url.includes('after=499');const events=second?[{seq:500,at:'2026-10-04T00:00:00Z',type:'result',text:'last event'}]:Array.from({length:500},(_,seq)=>({seq,at:'2026-10-04T00:00:00Z',type:'message',text:'event '+seq}));return new Response(JSON.stringify({run:{status:'succeeded'},events,hasMore:"'!second}));}});
console.log(JSON.stringify({exitCode:code,requests:paths,printedEvents:output.join('"'\\n').split('\\n').length,printedLastEvent:output.join('\\n').includes('last event')}));
})();
NODE
nl -ba lib/workers/mcp.ts | sed -n '332,360p'; nl -ba components/workers/AskBar.tsx | sed -n '145,164p'; nl -ba scripts/workers-cli.ts | sed -n '388,410p'; git diff --check origin/main...HEAD -- lib/workers app/api/workers app/workers components/workers migrations/1781568000400_digital-workers.js scripts/workers-cli.ts; git status --short" in /Users/jasonpoley/prj/dx/src/daax-web
 succeeded in 310ms:
{"exitCode":0,"requests":["http://127.0.0.1:4200/api/workers/runs/11111111-1111-1111-1111-111111111111"],"printedEvents":500,"printedLastEvent":false}
   332	    const json = text.trimStart().startsWith("{")
   333	      ? text
   334	      : (text
   335	          .split("\n")
   336	          .find((l) => l.startsWith("data:"))
   337	          ?.slice(5) ?? "{}");
   338	    return {
   339	      json: JSON.parse(json),
   340	      sessionId: res.headers.get("mcp-session-id") ?? sessionId,
   341	    };
   342	  };
   343	  const init = await post({
   344	    jsonrpc: "2.0",
   345	    id: 1,
   346	    method: "initialize",
   347	    params: {
   348	      protocolVersion: "2025-06-18",
   349	      capabilities: {},
   350	      clientInfo: { name: "daax-workers", version: "1" },
   351	    },
   352	  });
   353	  const list = await post(
   354	    { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
   355	    init.sessionId,
   356	  );
   357	  return (list.json?.result?.tools as RawTool[]) ?? [];
   358	}
   359	
   360	/** List and classify a server's tools. Errors propagate to the caller. */
   145	          placeholder={`Ask ${workerName} — e.g. "what's blocking the Postgres work?" — or say "run now", "pause", "status"`}
   146	          className="min-h-[44px] flex-1 resize-none"
   147	          rows={1}
   148	          aria-label="Ask the worker"
   149	          disabled={Boolean(active)}
   150	        />
   151	        <VoiceInput
   152	          onTranscript={(t) => void submit(t, "voice")}
   153	          disabled={Boolean(active)}
   154	        />
   155	        <Button
   156	          onClick={() => void submit(text, "adhoc")}
   157	          disabled={!text.trim() || Boolean(active)}
   158	          aria-label="Send"
   159	        >
   160	          <Send className="h-4 w-4" />
   161	        </Button>
   162	        <Button
   163	          variant="outline"
   164	          onClick={toggleSpeak}
   388	      );
   389	    }
   390	    case "runs": {
   391	      need(args, 1, "runs <worker> [--limit N] [--json]");
   392	      const path = `${w(args[0])}/runs${parseLimit(flags.limit)}`;
   393	      return show<{ runs: WorkerRun[] }>(path, (r) => formatRuns(r.runs));
   394	    }
   395	    case "logs": {
   396	      need(args, 1, "logs <run-id> [--follow]");
   397	      if (flags.follow !== true) {
   398	        return show<RunEvents>(runPath(args[0]), (r) =>
   399	          r.events.map(formatEvent).join("\n"),
   400	        );
   401	      }
   402	      const final = await followRun(c, args[0], {
   403	        sleep: d.sleep,
   404	        onEvent: (e) => d.out(json ? JSON.stringify(e) : formatEvent(e)),
   405	      });
   406	      d.err(`Run ${final.id} ${final.status}`);
   407	      return exitFor(final);
   408	    }
   409	    case "cancel": {
   410	      need(args, 1, "cancel <run-id> [--force]");
 M AGENTS.md
?? .logs/reviews/codex-digital-workers-r13.md
?? .worktrees/
?? "backlog/tasks/task-002 - daax-web-native-OIDC-login-against-the-hosts-Pocket-ID-remove-oauth2-proxy-from-daax.md"

hook: PostToolUse
hook: PostToolUse Completed
codex
Three new P2 findings in the scoped diff:

- **[P2] Complete HTTP MCP initialization before listing tools** — [mcp.ts:353](/Users/jasonpoley/prj/dx/src/daax-web/lib/workers/mcp.ts:353). Discovery skips `notifications/initialized`. Servers requiring it reject `tools/list`; the JSON-RPC error then becomes an empty tool list, silently removing the worker’s tools. Reproduced with a mocked server enforcing initialization.

- **[P2] Keep cancellation accessible during an active question** — [AskBar.tsx:149](/Users/jasonpoley/prj/dx/src/daax-web/components/workers/AskBar.tsx:149). An active run disables the text input, microphone, and Send button, making the implemented “stop”/“cancel” commands unreachable. Cancellation requires navigating to Runs.

- **[P2] Drain event pages for CLI logs without `--follow`** — [workers-cli.ts:397](/Users/jasonpoley/prj/dx/src/daax-web/scripts/workers-cli.ts:397). This branch ignores `hasMore` and returns only the first 500 events. A 501-event reproduction exited successfully while omitting the final event.
hook: Stop
hook: Stop Completed
tokens used
110,573
Three new P2 findings in the scoped diff:

- **[P2] Complete HTTP MCP initialization before listing tools** — [mcp.ts:353](/Users/jasonpoley/prj/dx/src/daax-web/lib/workers/mcp.ts:353). Discovery skips `notifications/initialized`. Servers requiring it reject `tools/list`; the JSON-RPC error then becomes an empty tool list, silently removing the worker’s tools. Reproduced with a mocked server enforcing initialization.

- **[P2] Keep cancellation accessible during an active question** — [AskBar.tsx:149](/Users/jasonpoley/prj/dx/src/daax-web/components/workers/AskBar.tsx:149). An active run disables the text input, microphone, and Send button, making the implemented “stop”/“cancel” commands unreachable. Cancellation requires navigating to Runs.

- **[P2] Drain event pages for CLI logs without `--follow`** — [workers-cli.ts:397](/Users/jasonpoley/prj/dx/src/daax-web/scripts/workers-cli.ts:397). This branch ignores `hasMore` and returns only the first 500 events. A 501-event reproduction exited successfully while omitting the final event.
