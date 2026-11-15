import { describe, it, expect } from "vitest";
import {
  ALWAYS_DENIED,
  READ_BUILTINS,
  SECRET_PATH_DENY,
  buildPrompts,
  buildToolPolicy,
  claudeCommand,
  claudeMcpConfig,
  codexCommand,
  codexConfigToml,
  formatGoals,
} from "@/lib/workers/plan";
import type { ResolvedMcpServer } from "@/lib/workers/mcp";
import type { WorkerGoal } from "@/types/workers";

const tools = {
  backlog: [
    { name: "task_list", readOnly: true },
    { name: "task_create", readOnly: false },
    { name: "task_edit", readOnly: false },
    { name: "task_archive", readOnly: false },
  ],
  github: [
    { name: "get_pull_request", readOnly: true },
    { name: "merge_pull_request", readOnly: false },
    { name: "delete_branch", readOnly: false },
    { name: "add_issue_comment", readOnly: false },
  ],
};

describe("buildToolPolicy", () => {
  it.each(["observe", "propose"] as const)(
    "%s denies MCP writes, allows MCP reads",
    (autonomy) => {
      const p = buildToolPolicy(autonomy, tools);
      expect(p.allowed).toContain("mcp__backlog__task_list");
      expect(p.allowed).toContain("mcp__github__get_pull_request");
      for (const w of [
        "mcp__backlog__task_create",
        "mcp__backlog__task_edit",
        "mcp__backlog__task_archive",
        "mcp__github__merge_pull_request",
        "mcp__github__add_issue_comment",
      ]) {
        expect(p.allowed).not.toContain(w);
        expect(p.denied).toContain(w);
      }
      expect(p.mcpEnabled).toEqual({
        backlog: ["task_list"],
        github: ["get_pull_request"],
      });
    },
  );

  it("act allows writes except NEVER_MCP names (merge/delete/archive…)", () => {
    const p = buildToolPolicy("act", tools);
    expect(p.allowed).toEqual(
      expect.arrayContaining([
        "mcp__backlog__task_create",
        "mcp__backlog__task_edit",
        "mcp__github__add_issue_comment",
      ]),
    );
    for (const never of [
      "mcp__backlog__task_archive",
      "mcp__github__merge_pull_request",
      "mcp__github__delete_branch",
    ]) {
      expect(p.allowed).not.toContain(never);
      expect(p.denied).toContain(never);
    }
    expect(p.mcpEnabled).toEqual({
      backlog: ["task_list", "task_create", "task_edit"],
      github: ["get_pull_request", "add_issue_comment"],
    });
  });

  it.each(["observe", "propose", "act"] as const)(
    "%s always includes read built-ins and every ALWAYS_DENIED entry",
    (autonomy) => {
      const p = buildToolPolicy(autonomy, {});
      expect(p.allowed).toEqual(["Read", "Glob", "Grep"]);
      expect(p.denied).toEqual([...ALWAYS_DENIED]);
      for (const d of ["Bash", "Edit", "Write", "NotebookEdit", "WebFetch"]) {
        expect(p.denied).toContain(d);
      }
      for (const d of SECRET_PATH_DENY) expect(p.denied).toContain(d);
      // No shell at any level, not even prefix-scoped.
      expect(p.allowed.some((a) => a.startsWith("Bash"))).toBe(false);
      expect(p.mcpEnabled).toEqual({});
    },
  );

  it("READ_BUILTINS has no Bash; secret paths are denied for Read", () => {
    expect([...READ_BUILTINS]).toEqual(["Read", "Glob", "Grep"]);
    for (const p of [
      "Read(**/.env)",
      "Read(**/.env.*)",
      "Read(**/.ssh/**)",
      "Read(**/.claude.json)",
      "Read(**/.daax/**)",
      "Read(**/.git-credentials)",
    ]) {
      expect(SECRET_PATH_DENY).toContain(p);
    }
    expect(SECRET_PATH_DENY.every((p) => p.startsWith("Read("))).toBe(true);
  });

  it("a server with no tools gets an empty enabled list", () => {
    expect(buildToolPolicy("act", { empty: [] }).mcpEnabled).toEqual({
      empty: [],
    });
  });
});

const goal = (over: Partial<WorkerGoal>): WorkerGoal => ({
  id: "g",
  workerId: "w",
  title: "Ship v1",
  description: "",
  projectRef: null,
  successCriteria: "",
  status: "active",
  priority: 0,
  createdAt: "",
  updatedAt: "",
  ...over,
});

describe("formatGoals / buildPrompts", () => {
  const worker = {
    name: "TPM",
    instructions: "  Be brief.  ",
    autonomy: "propose" as const,
  };
  const now = new Date("2026-09-26T08:00:00.000Z");

  it("renders goals with optional project, detail and done-when lines", () => {
    const text = formatGoals([
      goal({
        title: "A",
        projectRef: "/workspace/a",
        description: "d",
        successCriteria: "sc",
      }),
      goal({ title: "B" }),
    ]);
    expect(text).toBe(
      "1. A\n   Project: /workspace/a\n   Detail: d\n   Done when: sc\n2. B",
    );
    expect(formatGoals([])).toMatch(/No goals are set/);
  });

  it("system prompt carries name, trimmed instructions, autonomy rule and report format", () => {
    const { system } = buildPrompts(worker, [], "adhoc", "", now);
    expect(system).toContain(
      'You are "TPM", a digital worker running inside daax.',
    );
    expect(system).toContain("\n\nBe brief.\n\n");
    expect(system).toContain("Autonomy: PROPOSE.");
    expect(system).toContain("## Next actions");
  });

  it.each([
    ["observe", "Autonomy: OBSERVE."],
    ["act", "Never merge, push, deploy, release or delete."],
  ] as const)("autonomy %s rule", (autonomy, needle) => {
    expect(
      buildPrompts({ ...worker, autonomy }, [], "adhoc", "", now).system,
    ).toContain(needle);
  });

  it("scheduled and continuous triggers get the check-in default ask", () => {
    for (const t of ["schedule", "continuous"] as const) {
      expect(buildPrompts(worker, [], t, "", now).user).toContain(
        `Request (${t}): Scheduled check-in: review every active goal`,
      );
    }
    expect(buildPrompts(worker, [], "adhoc", "", now).user).toContain(
      "Request (adhoc): Produce the status report for the active goals.",
    );
    expect(
      buildPrompts(worker, [], "voice", "what's blocked?", now).user,
    ).toContain("Request (voice): what's blocked?");
  });

  it("user prompt has the time, goals, and a missing-servers line only when needed", () => {
    const withGoals = buildPrompts(
      worker,
      [goal({ title: "G1" })],
      "adhoc",
      "",
      now,
      ["github (not found in MCP configuration)"],
    );
    expect(withGoals.user).toContain(
      "Current time (UTC): 2026-09-26T08:00:00.000Z",
    );
    expect(withGoals.user).toContain("Active goals:\n1. G1");
    expect(withGoals.user).toContain(
      "Unavailable tools this run: github (not found in MCP configuration).",
    );
    expect(buildPrompts(worker, [], "adhoc", "", now).user).not.toContain(
      "Unavailable tools",
    );
  });

  it("renders project signals only when provided, before the request", () => {
    const signals = "### git status\n## main";
    const { user } = buildPrompts(worker, [], "adhoc", "hi", now, [], signals);
    expect(user).toContain(
      "Project signals (collected by daax just now; you have no shell):\n\n### git status\n## main",
    );
    expect(user.indexOf("Project signals")).toBeLessThan(
      user.indexOf("Request (adhoc)"),
    );
    expect(buildPrompts(worker, [], "adhoc", "", now).user).not.toContain(
      "Project signals",
    );
    expect(
      buildPrompts(worker, [], "adhoc", "", now, [], "").user,
    ).not.toContain("Project signals");
  });
});

const stdio: ResolvedMcpServer = {
  id: "backlog",
  type: "stdio",
  command: "backlog",
  args: ["mcp", "start"],
  env: { GITHUB_TOKEN: "ghp_SECRETVALUE" },
};
const http: ResolvedMcpServer = {
  id: "remote",
  type: "http",
  url: "https://r.example/mcp",
  env: {},
};

describe("claudeCommand / claudeMcpConfig", () => {
  const policy = buildToolPolicy("propose", {
    backlog: [{ name: "task_list", readOnly: true }],
  });
  const prompts = { system: "SYS", user: "USER" };

  it("locks the engine down: dontAsk, strict MCP config, no setting sources", () => {
    const { command, args } = claudeCommand({
      prompts,
      mcpConfigPath: "/tmp/mcp.json",
      policy,
      model: null,
    });
    expect(command).toBe("claude");
    const at = (flag: string) => args[args.indexOf(flag) + 1];
    expect(args[0]).toBe("-p");
    expect(args[1]).toBe("USER");
    expect(at("--permission-mode")).toBe("dontAsk");
    expect(args).toContain("--strict-mcp-config");
    expect(at("--setting-sources")).toBe("");
    expect(at("--mcp-config")).toBe("/tmp/mcp.json");
    expect(at("--append-system-prompt")).toBe("SYS");
    expect(at("--output-format")).toBe("stream-json");
    expect(args).not.toContain("--model");
    expect(args).not.toContain("--dangerously-skip-permissions");
    const allowedAt = args.indexOf("--allowedTools");
    const deniedAt = args.indexOf("--disallowedTools");
    expect(args.slice(allowedAt + 1, deniedAt)).toEqual(policy.allowed);
    expect(args.slice(deniedAt + 1)).toEqual(policy.denied);
  });

  it("passes --model only when set", () => {
    const { args } = claudeCommand({
      prompts,
      mcpConfigPath: "/m",
      policy,
      model: "opus",
    });
    expect(args.slice(-2)).toEqual(["--model", "opus"]);
  });

  it("builds the --mcp-config document", () => {
    expect(claudeMcpConfig([stdio, http])).toEqual({
      mcpServers: {
        backlog: {
          type: "stdio",
          command: "backlog",
          args: ["mcp", "start"],
          env: { GITHUB_TOKEN: "ghp_SECRETVALUE" },
        },
        remote: { type: "http", url: "https://r.example/mcp" },
      },
    });
  });
});

describe("codexConfigToml / codexCommand", () => {
  it("never-approve, read-only sandbox, enabled_tools, per-server env table", () => {
    const toml = codexConfigToml(
      [stdio, http],
      { backlog: ["task_list"], remote: [] },
      "gpt-5.5",
    );
    expect(toml).toContain('model = "gpt-5.5"');
    expect(toml).toContain('approval_policy = "never"');
    expect(toml).toContain('sandbox_mode = "read-only"');
    expect(toml).toContain('[mcp_servers."backlog"]');
    expect(toml).toContain('command = "backlog"');
    expect(toml).toContain('args = ["mcp", "start"]');
    expect(toml).toContain('env = { "GITHUB_TOKEN" = "ghp_SECRETVALUE" }');
    expect(toml).not.toContain("env_vars");
    expect(toml).toContain('enabled_tools = ["task_list"]');
    expect(toml).toContain('[mcp_servers."remote"]');
    expect(toml).toContain('url = "https://r.example/mcp"');
    expect(toml).toContain("enabled_tools = []");
    expect(toml.match(/default_tools_approval_mode = "approve"/g)).toHaveLength(
      2,
    );
    // The env table belongs to the backlog section only, not to remote or top level.
    const [top, backlog, remote] = toml.split(/^\[mcp_servers\./m);
    expect(top).not.toContain("GITHUB_TOKEN");
    expect(backlog).toContain("GITHUB_TOKEN");
    expect(remote).not.toContain("GITHUB_TOKEN");
    expect(remote).not.toMatch(/^env =/m);
  });

  it("omits model when null and defaults missing enabled lists to empty", () => {
    const toml = codexConfigToml([stdio], {}, null);
    expect(toml).not.toMatch(/^model =/m);
    expect(toml).toContain("enabled_tools = []");
  });

  it("escapes quotes in TOML strings", () => {
    const toml = codexConfigToml(
      [{ ...stdio, id: "x", args: ['a"b'], env: { K: 'v"\n' } }],
      {},
      null,
    );
    expect(toml).toContain('args = ["a\\"b"]');
    expect(toml).toContain('env = { "K" = "v\\"\\n" }');
    const noEnv = codexConfigToml([{ ...stdio, env: {} }], {}, null);
    expect(noEnv).not.toMatch(/^env =/m);
  });

  it("codex exec is read-only, JSON, confined to the working dir", () => {
    const { command, args } = codexCommand({
      prompts: { system: "S", user: "U" },
      workingDir: "/workspace/p",
      lastMessagePath: "/tmp/last.txt",
    });
    expect(command).toBe("codex");
    expect(args.slice(0, 2)).toEqual(["exec", "--json"]);
    expect(args[args.indexOf("--sandbox") + 1]).toBe("read-only");
    expect(args[args.indexOf("-C") + 1]).toBe("/workspace/p");
    expect(args[args.indexOf("-o") + 1]).toBe("/tmp/last.txt");
    expect(args.at(-1)).toBe("S\n\n---\n\nU");
  });
});
