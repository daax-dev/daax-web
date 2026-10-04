/**
 * Runs the CLI engines (`claude -p`, `codex exec`) as child processes, on the
 * host (host dev) or in the daax agent image (container mode), and streams
 * their JSON-lines output through the engine-neutral mappers.
 *
 * - Child env is minimal and explicit: app secrets (DATABASE_URL,
 *   DAAX_WS_TOKEN_SECRET, ...) are never passed to an agent. MCP server
 *   credentials go only into that server's config (mode 0600, deleted after
 *   the run), never into the agent's own environment.
 * - Host runs get their own process group so cancel/timeout stops the agent
 *   and everything it started; container runs are labelled with the run id so
 *   a new scheduler leader can remove orphans.
 */

import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import {
  CONTAINER_WORKSPACE_PATH,
  DEFAULT_CONTAINER_IMAGE,
  DOCKER_NETWORK,
  HOST_WORKSPACE_PATH,
} from "@/server/config/constants";
import { getClaudeAuthHostPath } from "@/server/docker/auth-paths";
import {
  CodexAccumulator,
  LineTail,
  mapClaudeMessage,
  mapCodexMessage,
  type ParsedLine,
} from "./events";
import type { ResolvedMcpServer } from "./mcp";
import {
  claudeCommand,
  claudeMcpConfig,
  codexCommand,
  codexConfigToml,
  type RunPrompts,
  type ToolPolicy,
} from "./plan";
import type { RunEvent, WorkerEngine, WorkerExecutor } from "@/types/workers";

export type Final = NonNullable<ParsedLine["final"]>;

export interface CliRunInput {
  runId: string;
  engine: Exclude<WorkerEngine, "agent-sdk">;
  executor: WorkerExecutor;
  model: string | null;
  workingDir: string;
  prompts: RunPrompts;
  policy: ToolPolicy;
  servers: ResolvedMcpServer[];
  timeoutMs: number;
  signal: AbortSignal;
  onEvent: (e: RunEvent) => Promise<void>;
  /** Records where the run executes ("container:<name>" / host ref). */
  onExecutor?: (ref: string) => Promise<void>;
  /** Fresh random UUID for this execution: the recovery marker. */
  nonce: string;
}

export interface CliRunResult {
  final: Final;
  timedOut: boolean;
  cancelled: boolean;
}

/**
 * The engine exited but its execution could not be verified as stopped
 * (e.g. Docker could not remove the container). The run must stay active so
 * the leader's reconciliation keeps retrying the cleanup.
 */
/** An executor reference without its secret nonce, safe to show or store. */
export function publicRef(ref: string): string {
  return ref.split("#")[0];
}

export class ExecutionCleanupError extends Error {
  constructor(
    public readonly ref: string,
    cause: string,
  ) {
    super(
      `execution ${publicRef(ref)} could not be verified as stopped: ${cause}`,
    );
    this.name = "ExecutionCleanupError";
  }
}

/** Container label carrying the run id (orphan cleanup). */
export const RUN_LABEL = "daax.worker.run";

/** Env vars a CLI needs to find itself and its login. Nothing else is inherited. */
const BASE_ENV_KEYS = [
  "PATH",
  "HOME",
  "USER",
  "LOGNAME",
  "LANG",
  "LC_ALL",
  "SHELL",
  "TMPDIR",
  "TERM",
];

export function baseChildEnv(
  env: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of BASE_ENV_KEYS) {
    const v = env[k];
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

/**
 * Host-mode CLI path. WORKERS_CLAUDE_BIN / WORKERS_CODEX_BIN (absolute paths)
 * override PATH lookup, for hosts where PATH resolves to a wrapper that needs
 * environment the runner deliberately does not pass.
 */
export function hostBinary(
  command: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const override =
    command === "claude"
      ? env.WORKERS_CLAUDE_BIN
      : command === "codex"
        ? env.WORKERS_CODEX_BIN
        : undefined;
  return override && override.startsWith("/") ? override : command;
}

/** Container mode = daax itself runs in a container with the workspace mounted. */
export function resolveExecutor(
  executor: WorkerExecutor,
): "host" | "container" {
  if (executor !== "auto") return executor;
  return HOST_WORKSPACE_PATH ? "container" : "host";
}

/** Workspace path as seen by the web process → path on the Docker host. */
function toHostPath(localPath: string): string {
  if (localPath === CONTAINER_WORKSPACE_PATH) return HOST_WORKSPACE_PATH;
  if (localPath.startsWith(`${CONTAINER_WORKSPACE_PATH}/`)) {
    return (
      HOST_WORKSPACE_PATH + localPath.slice(CONTAINER_WORKSPACE_PATH.length)
    );
  }
  throw new Error(`path ${localPath} is outside the mounted workspace`);
}

const IN_CONTAINER_RUN_DIR = "/run/daax-worker";

interface RunDir {
  local: string;
  /** How the engine process sees the directory. */
  engineView: string;
  /** Host path to bind-mount (container executor only). */
  host?: string;
}

function makeRunDir(runId: string, mode: "host" | "container"): RunDir {
  if (mode === "host") {
    const local = mkdtempSync(
      join(tmpdir(), `daax-worker-${runId.slice(0, 8)}-`),
    );
    chmodSync(local, 0o700);
    return { local, engineView: local };
  }
  // Must be on the mounted workspace so the Docker host can bind-mount it.
  const local = join(CONTAINER_WORKSPACE_PATH, ".daax", "workers", runId);
  mkdirSync(local, { recursive: true, mode: 0o700 });
  return { local, engineView: IN_CONTAINER_RUN_DIR, host: toHostPath(local) };
}

function writeSecret(path: string, content: string): void {
  writeFileSync(path, content, { mode: 0o600 });
}

/** Where codex's login lives for each executor. */
function codexAuthSource(mode: "host" | "container"): string {
  return mode === "host"
    ? join(process.env.CODEX_HOME || join(homedir(), ".codex"), "auth.json")
    : join(CONTAINER_WORKSPACE_PATH, ".daax", "codex", "auth.json");
}

interface Prepared {
  command: string;
  args: string[];
  /** Engine env on top of the base env (never MCP credentials). */
  env: Record<string, string>;
  lastMessagePath?: string;
  afterRun: () => void;
}

function prepare(
  input: CliRunInput,
  mode: "host" | "container",
  dir: RunDir,
): Prepared {
  if (input.engine === "claude-cli") {
    writeSecret(
      join(dir.local, "mcp.json"),
      JSON.stringify(claudeMcpConfig(input.servers)),
    );
    const cmd = claudeCommand({
      nonce: input.nonce,
      prompts: input.prompts,
      mcpConfigPath: join(dir.engineView, "mcp.json"),
      policy: input.policy,
      model: input.model,
    });
    return { ...cmd, env: {}, afterRun: () => undefined };
  }

  // codex: an isolated CODEX_HOME holding only this worker's MCP servers.
  const codexHome = join(dir.local, "codex-home");
  mkdirSync(codexHome, { mode: 0o700 });
  writeSecret(
    join(codexHome, "config.toml"),
    codexConfigToml(input.servers, input.policy.mcpEnabled, input.model),
  );
  const authSrc = codexAuthSource(mode);
  if (!existsSync(authSrc)) {
    throw new Error(
      mode === "host"
        ? `codex is not logged in (${authSrc} missing): run \`codex login\``
        : `codex login for workers not found at <workspace>/.daax/codex/auth.json`,
    );
  }
  const authDst = join(codexHome, "auth.json");
  let afterRun = () => undefined as void;
  if (mode === "host") {
    // Symlink so a token refresh by codex writes through to the real login.
    symlinkSync(authSrc, authDst);
  } else {
    copyFileSync(authSrc, authDst);
    const before = statSync(authDst).mtimeMs;
    afterRun = () => {
      if (existsSync(authDst) && statSync(authDst).mtimeMs !== before) {
        copyFileSync(authDst, authSrc);
      }
    };
  }
  const cmd = codexCommand({
    prompts: input.prompts,
    workingDir: input.workingDir,
    lastMessagePath: join(dir.engineView, "last-message.txt"),
  });
  return {
    ...cmd,
    env: { CODEX_HOME: join(dir.engineView, "codex-home") },
    lastMessagePath: join(dir.local, "last-message.txt"),
    afterRun,
  };
}

function dockerArgs(
  runId: string,
  containerName: string,
  dir: RunDir,
  workingDir: string,
  prepared: Prepared,
): string[] {
  const args = [
    "run",
    "--rm",
    "-i",
    "--name",
    containerName,
    "--label",
    `${RUN_LABEL}=${runId}`,
    "--network",
    DOCKER_NETWORK,
    "-u",
    "vscode",
    "-v",
    `${HOST_WORKSPACE_PATH}:${CONTAINER_WORKSPACE_PATH}`,
    "-v",
    `${getClaudeAuthHostPath()}:/home/vscode/.claude`,
    "-v",
    `${dir.host}:${IN_CONTAINER_RUN_DIR}`,
    "-e",
    "CLAUDE_CONFIG_DIR=/home/vscode/.claude",
    "-e",
    "HOME=/home/vscode",
    "-w",
    workingDir,
  ];
  // Values stay in the docker client's env; only names appear in argv.
  for (const name of Object.keys(prepared.env)) args.push("-e", name);
  args.push(DEFAULT_CONTAINER_IMAGE, prepared.command, ...prepared.args);
  return args;
}

/** A process's start time as `ps` reports it, or null when unavailable. */
export function processStartTime(pid: number): string | null {
  const ps = spawnSync("ps", ["-o", "lstart=", "-p", String(pid)], {
    encoding: "utf8",
  });
  const out = (ps.stdout ?? "").trim();
  return ps.status === 0 && out ? out : null;
}

/**
 * Host executor refs: `host:pending#<nonce>` (recorded before spawn) and
 * `host:<pgid>|<start time>#<nonce>` (after spawn). The nonce is a fresh
 * random UUID per execution, stored only here, and is the recovery marker.
 */
export function parseHostRef(
  ref: string,
): { pgid: number | null; start: string | null; nonce: string | null } | null {
  if (!ref.startsWith("host:")) return null;
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
}

/**
 * Recovery for a host run left by a dead leader. The agent is found by its
 * command-line marker (not by a pid that may have been reused), its process
 * groups are stopped and verified gone. If no marked process exists but the
 * recorded group id is still alive, ownership cannot be proven either way:
 * nothing is signalled and the run stays locked (AmbiguousExecutionError)
 * until an operator force-releases it.
 */
export async function stopHostRunAndWait(
  runId: string,
  ref: string,
  deps: {
    find?: (nonce: string) => { pid: number; pgid: number }[];
    alive?: (pgid: number) => boolean;
    kill?: (pgid: number, sig: NodeJS.Signals) => void;
    sleep?: (ms: number) => Promise<void>;
  } = {},
): Promise<void> {
  const find = deps.find ?? ((n) => findMarkedProcesses(n));
  const alive = deps.alive ?? groupAlive;
  const kill =
    deps.kill ??
    ((pgid, sig) => {
      try {
        process.kill(-pgid, sig);
      } catch {
        // already gone
      }
    });
  const sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));

  const parsed = parseHostRef(ref);
  if (!parsed?.nonce) {
    // Without its nonce the execution cannot be identified: never signal.
    throw new AmbiguousExecutionError(
      `run ${runId} has no execution marker recorded; force-release once confirmed stopped`,
    );
  }
  const nonce = parsed.nonce;
  const marked = find(nonce);
  if (marked.length === 0) {
    if (!parsed.pgid) {
      // Recorded before spawn: the agent may have started and exited,
      // leaving unmarked descendants in a group whose id was never recorded.
      throw new AmbiguousExecutionError(
        `run ${runId} was starting when daax stopped and its process group is unknown; force-release once confirmed stopped`,
      );
    }
    if (alive(parsed.pgid)) {
      throw new AmbiguousExecutionError(
        `process group ${parsed.pgid} is alive but carries no marker for run ${runId}; not signalled — force-release the run once it is confirmed stopped`,
      );
    }
    return;
  }
  const groups = [...new Set(marked.map((p) => p.pgid))].filter((g) => g > 1);
  for (const g of groups) kill(g, "SIGTERM");
  for (let waited = 0; waited < 15_000; waited += 250) {
    if (find(nonce).length === 0 && groups.every((g) => !alive(g))) return;
    if (waited === 10_000) for (const g of groups) kill(g, "SIGKILL");
    await sleep(250);
  }
  throw new Error(`run ${runId} processes did not exit`);
}

/**
 * Send one signal to a run's execution: remove its container, or signal its
 * host process group. Escalation and verification are the caller's job, so
 * no timer can outlive a verified cleanup and hit a reused group.
 */
export function signalExecution(ref: string, sig: NodeJS.Signals): void {
  if (ref.startsWith("container:")) {
    spawnSync("docker", ["rm", "-f", ref.slice("container:".length)], {
      stdio: "ignore",
    });
    return;
  }
  const pgid = parseHostRef(ref)?.pgid;
  if (!pgid) return;
  try {
    process.kill(-pgid, sig);
  } catch {
    // already gone
  }
}

/**
 * In-run stop control: SIGTERM now, SIGKILL after 10 s unless the run's
 * cleanup has been verified first. After `settle()` nothing is signalled
 * again, so a late callback or timer can never reach a reused group.
 */
export function stopController(getRef: () => string | null, kill: () => void) {
  let settled = false;
  let escalation: NodeJS.Timeout | undefined;
  return {
    stop() {
      if (settled) return;
      const ref = getRef();
      if (ref) signalExecution(ref, "SIGTERM");
      kill();
      escalation ??= setTimeout(() => {
        const r = getRef();
        if (!settled && r) signalExecution(r, "SIGKILL");
      }, 10_000);
      escalation.unref();
    },
    settle() {
      settled = true;
      if (escalation) clearTimeout(escalation);
    },
    get settled() {
      return settled;
    },
  };
}

/**
 * Remove every container carrying the worker-run label (leader recovery).
 * Throws if Docker cannot list or remove them, so recovery fails and the
 * interrupted runs stay locked until a later attempt succeeds.
 */
export function removeLabelledContainers(): number {
  const ls = spawnSync(
    "docker",
    ["ps", "-aq", "--filter", `label=${RUN_LABEL}`],
    { encoding: "utf8" },
  );
  if (ls.status !== 0) {
    throw new Error(
      `cannot list worker containers: ${(ls.stderr || ls.error?.message || "docker ps failed").trim()}`,
    );
  }
  const ids = (ls.stdout ?? "").split("\n").filter(Boolean);
  if (ids.length) {
    const rm = spawnSync("docker", ["rm", "-f", ...ids], { encoding: "utf8" });
    if (rm.status !== 0) {
      throw new Error(
        `cannot remove worker containers: ${(rm.stderr || "docker rm failed").trim()}`,
      );
    }
  }
  return ids.length;
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
