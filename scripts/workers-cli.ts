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
        return show<RunEvents>(runPath(args[0]), (r) =>
          r.events.map(formatEvent).join("\n"),
        );
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
  try {
    const parsed = parseArgs(argv);
    if (parsed.command === "help") {
      deps.out(HELP);
      return 0;
    }
    const client = new Client(
      resolveBaseUrl(deps.env.DAAX_URL),
      parseAuthHeader(deps.env.DAAX_AUTH_HEADER),
      deps.fetch,
    );
    return await execute(parsed, client, deps);
  } catch (err) {
    if (err instanceof UsageError) {
      deps.err(err.message);
      return 2;
    }
    if (err instanceof ApiError) {
      if (err.status === 401 || err.status === 403) {
        deps.err(
          `Not authorized (${err.status}): ${err.message}. Sign in or set DAAX_AUTH_HEADER.`,
        );
        return 2;
      }
      deps.err(
        err.status ? `Error (${err.status}): ${err.message}` : err.message,
      );
      return 1;
    }
    deps.err(`Error: ${errText(err)}`);
    return 1;
  }
}

function isEntrypoint(): boolean {
  const self = fileURLToPath(import.meta.url);
  try {
    return realpathSync(process.argv[1] ?? "") === realpathSync(self);
  } catch {
    return false;
  }
}

if (isEntrypoint()) {
  runCli(process.argv.slice(2), {
    env: process.env,
    fetch: (url, init) => fetch(url, init),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    out: (s) => process.stdout.write(`${s}\n`),
    err: (s) => process.stderr.write(`${s}\n`),
  }).then((code) => process.exit(code));
}
