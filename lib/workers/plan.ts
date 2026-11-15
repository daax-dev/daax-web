/**
 * Builds everything an engine needs for one run: prompts, the tool allow and
 * deny lists for the worker's autonomy level, and the MCP server set.
 *
 * Write limits are enforced through the engine's own permission controls
 * (Claude `--permission-mode dontAsk` + `--allowedTools`; codex `enabled_tools`
 * + read-only sandbox), never by prompt wording alone.
 */

import type { McpToolInfo, ResolvedMcpServer } from "./mcp";
import type {
  RunTrigger,
  Worker,
  WorkerAutonomy,
  WorkerGoal,
} from "@/types/workers";

/**
 * Built-in tools the agent may use at every autonomy level: file reads and
 * search only. There is deliberately no Bash: prefix rules cannot make a shell
 * read-only (`git diff --output=<file>` writes, `gh ... --body-file` reads and
 * posts). Git and GitHub state reach the agent as project signals collected by
 * daax itself (lib/workers/signals.ts). Writes in `act` go through MCP tools.
 */
export const READ_BUILTINS = ["Read", "Glob", "Grep"] as const;

/** Paths the Read tool may never open (credentials and daax state). */
export const SECRET_PATH_DENY = [
  "Read(**/.env)",
  "Read(**/.env.*)",
  "Read(**/*.pem)",
  "Read(**/*.key)",
  "Read(**/id_rsa*)",
  "Read(**/id_ed25519*)",
  "Read(**/.ssh/**)",
  "Read(**/.aws/**)",
  "Read(**/.config/gh/**)",
  "Read(**/.codex/**)",
  "Read(**/.claude/**)",
  "Read(**/.claude.json)",
  "Read(**/.daax/**)",
  "Read(**/.daax-claude/**)",
  "Read(**/.secrets*)",
  "Read(**/credentials*)",
  "Read(**/.npmrc)",
  "Read(**/.netrc)",
  "Read(**/.git-credentials)",
] as const;

/** Denied at every autonomy level. */
export const ALWAYS_DENIED = [
  "Bash",
  "Edit",
  "Write",
  "NotebookEdit",
  "WebFetch",
  ...SECRET_PATH_DENY,
] as const;

/** MCP tool names that are never allowed, even in `act`. */
const NEVER_MCP =
  /(merge|delete|remove|push|deploy|release|archive|force|drop|destroy)/i;

export interface ToolPolicy {
  /** Claude-format allowed tool names (built-ins + mcp__server__tool). */
  allowed: string[];
  /** Claude-format denied tool names. */
  denied: string[];
  /** Per-server allowed MCP tool names (codex `enabled_tools`). */
  mcpEnabled: Record<string, string[]>;
}

export function claudeToolName(server: string, tool: string): string {
  return `mcp__${server}__${tool}`;
}

export function buildToolPolicy(
  autonomy: WorkerAutonomy,
  serverTools: Record<string, McpToolInfo[]>,
): ToolPolicy {
  const allowed: string[] = [...READ_BUILTINS];
  const denied: string[] = [...ALWAYS_DENIED];
  const mcpEnabled: Record<string, string[]> = {};

  for (const [server, tools] of Object.entries(serverTools)) {
    const enabled: string[] = [];
    for (const t of tools) {
      const permitted =
        !NEVER_MCP.test(t.name) && (t.readOnly || autonomy === "act");
      const name = claudeToolName(server, t.name);
      if (permitted) {
        enabled.push(t.name);
        allowed.push(name);
      } else {
        denied.push(name);
      }
    }
    mcpEnabled[server] = enabled;
  }
  return { allowed, denied, mcpEnabled };
}

const AUTONOMY_RULES: Record<WorkerAutonomy, string> = {
  observe:
    "Autonomy: OBSERVE. Report status only. Do not change anything and do not propose actions.",
  propose:
    "Autonomy: PROPOSE. Read anything you need. Do not change anything outside this report; put every recommended change under 'Next actions' for the operator to approve.",
  act: "Autonomy: ACT. You may use the write tools you have been given (for example creating or editing Backlog.md tasks) when that clearly advances a goal. Never merge, push, deploy, release or delete. Record every change you made under 'Changes made'.",
};

const REPORT_FORMAT = `Write your final answer as a markdown report with these sections, in order:
## Summary — two or three sentences.
## Goals — a table: Goal | Status (on-track / at-risk / blocked / done) | Evidence (links, task ids, PR numbers).
## Blockers and risks — each with its evidence and who can unblock it.
## Decisions needed — questions only the operator can answer.
## Next actions — at most three concrete steps.
Cite evidence you actually read. If a tool failed or data was unavailable, say so instead of guessing.`;

export function formatGoals(goals: WorkerGoal[]): string {
  if (goals.length === 0) {
    return "No goals are set. Report on the projects you can see, and propose goals under 'Decisions needed'.";
  }
  return goals
    .map((g, i) => {
      const parts = [`${i + 1}. ${g.title}`];
      if (g.projectRef) parts.push(`   Project: ${g.projectRef}`);
      if (g.description) parts.push(`   Detail: ${g.description}`);
      if (g.successCriteria) parts.push(`   Done when: ${g.successCriteria}`);
      return parts.join("\n");
    })
    .join("\n");
}

export interface RunPrompts {
  system: string;
  user: string;
}

export function buildPrompts(
  worker: Pick<Worker, "name" | "instructions" | "autonomy">,
  goals: WorkerGoal[],
  trigger: RunTrigger,
  input: string,
  now: Date,
  missingServers: string[] = [],
  signals = "",
): RunPrompts {
  const system = [
    `You are "${worker.name}", a digital worker running inside daax.`,
    worker.instructions.trim(),
    AUTONOMY_RULES[worker.autonomy],
    REPORT_FORMAT,
  ]
    .filter(Boolean)
    .join("\n\n");

  const ask =
    input ||
    (trigger === "schedule" || trigger === "continuous"
      ? "Scheduled check-in: review every active goal and produce the status report."
      : "Produce the status report for the active goals.");

  const user = [
    `Current time (UTC): ${now.toISOString()}`,
    `Active goals:\n${formatGoals(goals)}`,
    missingServers.length
      ? `Unavailable tools this run: ${missingServers.join(", ")}.`
      : "",
    signals
      ? `Project signals (collected by daax just now; you have no shell):\n\n${signals}`
      : "",
    `Request (${trigger}): ${ask}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  return { system, user };
}

/** Claude `--mcp-config` document for the resolved servers. */
export function claudeMcpConfig(servers: ResolvedMcpServer[]): {
  mcpServers: Record<string, unknown>;
} {
  const mcpServers: Record<string, unknown> = {};
  for (const s of servers) {
    mcpServers[s.id] =
      s.type === "http"
        ? { type: "http", url: s.url }
        : { type: "stdio", command: s.command, args: s.args ?? [], env: s.env };
  }
  return { mcpServers };
}

function tomlString(s: string): string {
  return JSON.stringify(s);
}

function tomlArray(items: string[]): string {
  return `[${items.map(tomlString).join(", ")}]`;
}

/**
 * Codex `config.toml` for an isolated, per-run CODEX_HOME (mode 0600, deleted
 * after the run): only the worker's MCP servers, each restricted to its
 * enabled tools, with its own env table — so one server's credentials reach
 * that server only, never codex itself or other servers.
 */
export function codexConfigToml(
  servers: ResolvedMcpServer[],
  mcpEnabled: Record<string, string[]>,
  model: string | null,
): string {
  const lines: string[] = [];
  if (model) lines.push(`model = ${tomlString(model)}`);
  lines.push('approval_policy = "never"', 'sandbox_mode = "read-only"', "");
  for (const s of servers) {
    lines.push(`[mcp_servers.${tomlString(s.id)}]`);
    if (s.type === "http") {
      lines.push(`url = ${tomlString(s.url ?? "")}`);
    } else {
      lines.push(`command = ${tomlString(s.command ?? "")}`);
      lines.push(`args = ${tomlArray(s.args ?? [])}`);
      const env = Object.entries(s.env);
      if (env.length) {
        lines.push(
          `env = { ${env.map(([k, v]) => `${tomlString(k)} = ${tomlString(v)}`).join(", ")} }`,
        );
      }
    }
    // Only enabled_tools are exposed, so they are pre-approved: with
    // approval_policy "never", codex would otherwise refuse every MCP call.
    lines.push(
      `enabled_tools = ${tomlArray(mcpEnabled[s.id] ?? [])}`,
      'default_tools_approval_mode = "approve"',
      "",
    );
  }
  return lines.join("\n");
}

export interface EngineCommand {
  command: string;
  args: string[];
}

export function claudeCommand(opts: {
  /** Execution nonce: the recovery marker on the command line (--session-id). */
  nonce?: string;
  prompts: RunPrompts;
  mcpConfigPath: string;
  policy: ToolPolicy;
  model: string | null;
}): EngineCommand {
  const args = [
    "-p",
    opts.prompts.user,
    "--output-format",
    "stream-json",
    "--verbose",
    "--append-system-prompt",
    opts.prompts.system,
    "--setting-sources",
    "",
    "--mcp-config",
    opts.mcpConfigPath,
    "--strict-mcp-config",
    "--permission-mode",
    "dontAsk",
    "--allowedTools",
    ...opts.policy.allowed,
    "--disallowedTools",
    ...opts.policy.denied,
  ];
  if (opts.model) args.push("--model", opts.model);
  if (opts.nonce) args.push("--session-id", opts.nonce);
  return { command: "claude", args };
}

export function codexCommand(opts: {
  prompts: RunPrompts;
  workingDir: string;
  lastMessagePath: string;
}): EngineCommand {
  return {
    command: "codex",
    args: [
      "exec",
      "--json",
      "--skip-git-repo-check",
      "--sandbox",
      "read-only",
      "-C",
      opts.workingDir,
      "-o",
      opts.lastMessagePath,
      // codex has no separate system prompt flag for exec; the role and rules
      // lead the prompt.
      `${opts.prompts.system}\n\n---\n\n${opts.prompts.user}`,
    ],
  };
}
