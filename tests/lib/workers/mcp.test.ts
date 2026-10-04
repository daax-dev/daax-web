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
