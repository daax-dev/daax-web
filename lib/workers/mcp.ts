/**
 * Worker MCP servers: resolve a worker's server list to concrete launch
 * configs, list each server's tools, and classify them read vs write so the
 * engine can be given an exact allow-list for the worker's autonomy level.
 *
 * Secrets: `ref` servers are resolved from the /mcp discovery sources at run
 * time (their env never touches the DB); `inline` servers get only the env
 * vars they name in `envPassthrough`, read from the daax process env.
 */

import { spawn } from "node:child_process";
import { discoverAllMcps } from "@/lib/mcp-config";
import { buildChildEnv, isAllowedRemoteUrl } from "@/lib/mcp-route-helpers";
import { LineTail } from "./events";
import type { WorkerMcpServer } from "@/types/workers";

/**
 * Environment variables that belong to daax itself or to the engines. They are
 * never passed through to a worker's MCP servers, whatever a worker requests.
 */
const RESERVED_ENV =
  /^(DATABASE_URL|PG[A-Z_]*|DAAX_[A-Z0-9_]*|WORKERS_[A-Z0-9_]*|ANTHROPIC_[A-Z0-9_]*|CLAUDE_[A-Z0-9_]*|CODEX_[A-Z0-9_]*|OPENAI_[A-Z0-9_]*|NEXT_[A-Z0-9_]*|NODE_OPTIONS|PATH|HOME|SHELL|LD_[A-Z_]*|DYLD_[A-Z_]*|HOST_WORKSPACE_PATH)$/;

export function isReservedEnvName(name: string): boolean {
  return RESERVED_ENV.test(name);
}

export interface ResolvedMcpServer {
  id: string;
  type: "stdio" | "http";
  command?: string;
  args?: string[];
  url?: string;
  env: Record<string, string>;
}

export interface McpToolInfo {
  name: string;
  readOnly: boolean;
}

const READ_WORDS = new Set([
  "get",
  "list",
  "search",
  "view",
  "read",
  "fetch",
  "describe",
  "show",
  "find",
  "count",
  "lookup",
  "inspect",
  "status",
  "diff",
  "log",
  "logs",
  "compare",
  "check",
  "overview",
  "guide",
  "info",
]);

const WRITE_WORDS = new Set([
  // Words that execute arbitrary operations make a tool a write even when a
  // read word is present (execute_query, run_sql, call_api).
  "execute",
  "exec",
  "sql",
  "eval",
  "call",
  "invoke",
  "apply",
  "mutate",
  "mutation",
  "insert",
  "upsert",
  "patch",
  "put",
  "save",
  "store",
  "import",
  "sync",
  "publish",
  "share",
  "grant",
  "revoke",
  "reset",
  "revert",
  "rollback",
  "restart",
  "stop",
  "start",
  "kill",
  "command",
  "shell",
  "script",
  "create",
  "add",
  "edit",
  "update",
  "set",
  "write",
  "delete",
  "remove",
  "rename",
  "archive",
  "complete",
  "close",
  "reopen",
  "merge",
  "push",
  "move",
  "assign",
  "comment",
  "post",
  "send",
  "submit",
  "approve",
  "run",
  "trigger",
  "dispatch",
  "cancel",
  "fork",
  "upload",
  "install",
  "enable",
  "disable",
  "lock",
  "unlock",
]);

/** Split snake_case, kebab-case, dotted and camelCase names into words. */
export function nameWords(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[\s_.\-/]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());
}

/**
 * A tool is read-only when the server annotates it `readOnlyHint: true`.
 * Without annotations, its name must contain a read word and no write word
 * (`task_list`, `get_file` → read; `task_create`, `list_and_delete` → write).
 * Unknown names are writes (fail closed). An explicit `readOnlyHint: false`
 * or `destructiveHint: true` always means write.
 */
export function isReadOnlyTool(tool: {
  name: string;
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean };
}): boolean {
  const a = tool.annotations;
  if (a?.destructiveHint === true || a?.readOnlyHint === false) return false;
  if (a?.readOnlyHint === true) return true;
  const words = nameWords(tool.name);
  if (words.some((w) => WRITE_WORDS.has(w))) return false;
  return words.some((w) => READ_WORDS.has(w));
}

/**
 * Resolve worker servers to launch configs. Unknown refs and invalid remote
 * URLs are returned as `missing` (recorded as run warnings, not fatal).
 */
export function resolveMcpServers(
  servers: WorkerMcpServer[],
  projectPath: string,
  env: NodeJS.ProcessEnv = process.env,
): { resolved: ResolvedMcpServer[]; missing: string[] } {
  const resolved: ResolvedMcpServer[] = [];
  const missing: string[] = [];
  const hasRefs = servers.some((s) => s.kind === "ref");
  const discovered = hasRefs ? discoverAllMcps(projectPath).mcps : [];

  for (const s of servers) {
    if (s.kind === "ref") {
      const found = discovered.find((d) => d.id === s.id && d.config);
      const cfg = found?.config;
      if (!cfg) {
        missing.push(`${s.id} (not found in MCP configuration)`);
        continue;
      }
      const type =
        cfg.type === "http" || (!cfg.command && cfg.url) ? "http" : "stdio";
      if (type === "http" && !isAllowedRemoteUrl(cfg.url)) {
        missing.push(`${s.id} (invalid URL)`);
        continue;
      }
      const cfgEnv = cfg.env ?? {};
      resolved.push({
        id: s.id,
        type,
        command: cfg.command,
        args: cfg.args ?? [],
        url: cfg.url,
        env: cfgEnv,
      });
      continue;
    }
    const passthrough: Record<string, string> = {};
    for (const name of s.envPassthrough ?? []) {
      if (isReservedEnvName(name)) continue;
      const v = env[name];
      if (typeof v === "string") passthrough[name] = v;
    }
    resolved.push({
      id: s.id,
      type: s.type,
      command: s.command,
      args: s.args ?? [],
      url: s.url,
      env: passthrough,
    });
  }
  return { resolved, missing };
}

const LIST_TIMEOUT_MS =
  Number(process.env.WORKERS_MCP_LIST_TIMEOUT_MS) || 30_000;

type RawTool = {
  name: string;
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean };
};

function listViaStdio(
  server: ResolvedMcpServer,
  cwd: string | undefined,
  signal: AbortSignal | undefined,
): Promise<RawTool[]> {
  return new Promise((resolve, reject) => {
    // Same directory the engine will start the server in: some servers (e.g.
    // Backlog.md) expose tools based on the project they find there.
    const proc = spawn(server.command!, server.args ?? [], {
      cwd,
      env: buildChildEnv(server.env) as NodeJS.ProcessEnv,
      stdio: ["pipe", "pipe", "pipe"],
      signal,
    });
    let settled = false;
    let buffer = "";
    const stderrTail = new LineTail(4_000);
    const done = (err: Error | null, tools?: RawTool[]) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      proc.kill();
      if (err) reject(err);
      else resolve(tools ?? []);
    };
    const timer = setTimeout(
      () => done(new Error("timed out listing tools")),
      LIST_TIMEOUT_MS,
    );
    const send = (msg: object) => proc.stdin.write(`${JSON.stringify(msg)}\n`);

    proc.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        let msg: {
          id?: number;
          result?: { tools?: RawTool[] };
          error?: { message?: string };
        };
        try {
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
