/**
 * Security regression tests for POST /api/mcp/tools (#182).
 *
 * Guards against the unauthenticated-RCE / command-injection primitive that
 * previously existed: the route used to pass a client-supplied
 * command/args/env straight to child_process.spawn. These tests assert that:
 *  - an unauthenticated request is rejected (401) and never spawns;
 *  - an unknown mcpId is rejected (403) and never spawns;
 *  - a request smuggling a `command` in the body is IGNORED — the server
 *    resolves the command from the registered MCP config, and the exploit
 *    payload is never spawned;
 *  - a legit registered mcpId still resolves and spawns the SERVER-resolved
 *    command with an explicit minimal env (no app secrets leaked).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "events";

const { mockSpawn, mockRequireAuth, mockDiscoverAllMcps } = vi.hoisted(() => ({
  mockSpawn: vi.fn(),
  mockRequireAuth: vi.fn(),
  mockDiscoverAllMcps: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireAuth: mockRequireAuth }));

vi.mock("@/lib/mcp-config", () => ({
  discoverAllMcps: mockDiscoverAllMcps,
}));

vi.mock("child_process", async () => {
  const actual =
    await vi.importActual<typeof import("child_process")>("child_process");
  return {
    ...actual,
    default: { ...actual, spawn: mockSpawn },
    spawn: mockSpawn,
  };
});

// Import route AFTER mocks are set up
import { POST } from "@/app/api/mcp/tools/route";

// A fake child process that emits a valid tools/list response so
// fetchToolsViaStdio resolves quickly without real I/O.
function makeFakeProc() {
  const proc = Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    stdin: { write: vi.fn() },
    kill: vi.fn(),
  });
  setImmediate(() => {
    proc.stdout.emit(
      "data",
      Buffer.from(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          result: { tools: [{ name: "tool_a" }] },
        }) + "\n",
      ),
    );
  });
  return proc;
}

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/mcp/tools", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const EXPLOIT = { command: "/bin/sh", args: ["-c", "id"] };

describe("POST /api/mcp/tools — security (#182)", () => {
  // Snapshot env so per-test mutations are always restored in afterEach, even
  // if an assertion throws early (prevents order-dependent leakage).
  let envSnapshot: NodeJS.ProcessEnv;

  beforeEach(() => {
    envSnapshot = { ...process.env };
    mockSpawn.mockReturnValue(makeFakeProc() as never);
    mockRequireAuth.mockResolvedValue({
      authenticated: true,
      user: {
        username: "tester",
        email: null,
        groups: [],
        authenticated: true,
        pictureUrl: null,
      },
    });
    mockDiscoverAllMcps.mockReturnValue({ mcps: [] });
  });

  afterEach(() => {
    // Always restore stubbed globals (e.g. fetch) and env, even if a prior
    // assertion threw — inline cleanup would otherwise leak into later tests.
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    for (const key of Object.keys(process.env)) {
      if (!(key in envSnapshot)) delete process.env[key];
    }
    Object.assign(process.env, envSnapshot);
  });

  it("unauthenticated → 401 and never spawns", async () => {
    mockRequireAuth.mockResolvedValue({
      authenticated: false,
      response: new Response(
        JSON.stringify({ error: "Authentication required" }),
        {
          status: 401,
        },
      ),
    });

    const res = await POST(makeRequest({ mcpId: "anything", config: EXPLOIT }));

    expect(res.status).toBe(401);
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it("unknown mcpId → 403 and never spawns", async () => {
    mockDiscoverAllMcps.mockReturnValue({ mcps: [] });

    const res = await POST(makeRequest({ mcpId: "does-not-exist" }));

    expect(res.status).toBe(403);
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it("smuggled command for an UNKNOWN mcpId is ignored → 403, never spawns exploit", async () => {
    mockDiscoverAllMcps.mockReturnValue({ mcps: [] });

    const res = await POST(makeRequest({ mcpId: "attacker", config: EXPLOIT }));

    expect(res.status).toBe(403);
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it("discovery uses the SERVER-default path; a client-supplied projectPath is ignored", async () => {
    // Force a deterministic server default: with CLAUDE_CODE_CONFIG set,
    // getDefaultProjectPath() short-circuits to "/workspace" (no fs probe).
    process.env.CLAUDE_CODE_CONFIG = "/some/claude/config";
    mockDiscoverAllMcps.mockReturnValue({
      mcps: [{ id: "my-mcp", config: { command: "npx", args: [] } }],
    });

    const res = await POST(
      // Attacker tries to redirect registry discovery at a path they control
      // (e.g. one with an attacker-authored .mcp.json) — must be ignored.
      makeRequest({ mcpId: "my-mcp", projectPath: "/attacker/writable" }),
    );

    expect(res.status).toBe(200);
    expect(mockDiscoverAllMcps).toHaveBeenCalledTimes(1);
    // Discovery scoped to the SERVER default, NOT the client-supplied path.
    expect(mockDiscoverAllMcps.mock.calls[0][0]).toBe("/workspace");
    expect(mockDiscoverAllMcps.mock.calls[0][0]).not.toBe("/attacker/writable");
    // env restored by afterEach (env snapshot restore).
  });

  it("registered stdio mcpId resolves SERVER-side; client command is ignored", async () => {
    mockDiscoverAllMcps.mockReturnValue({
      mcps: [
        {
          id: "my-mcp",
          config: {
            command: "npx",
            args: ["-y", "@scope/real-mcp"],
            env: { MY_MCP_KEY: "v" },
          },
        },
      ],
    });

    const res = await POST(
      // Client attempts to smuggle the exploit command for a KNOWN id.
      makeRequest({ mcpId: "my-mcp", config: EXPLOIT }),
    );

    expect(res.status).toBe(200);
    expect(mockSpawn).toHaveBeenCalledTimes(1);

    const [cmd, args] = mockSpawn.mock.calls[0];
    // SERVER-resolved command, NOT the client's "/bin/sh".
    expect(cmd).toBe("npx");
    expect(args).toEqual(["-y", "@scope/real-mcp"]);
    expect(cmd).not.toBe("/bin/sh");
  });

  it("spawns with an explicit minimal env (no app secrets leaked)", async () => {
    process.env.GITHUB_TOKEN = "super-secret";
    process.env.DATABASE_URL = "postgres://leak";
    mockDiscoverAllMcps.mockReturnValue({
      mcps: [
        {
          id: "my-mcp",
          config: { command: "npx", args: [], env: { MY_MCP_KEY: "v" } },
        },
      ],
    });

    const res = await POST(makeRequest({ mcpId: "my-mcp" }));
    expect(res.status).toBe(200);

    const opts = mockSpawn.mock.calls[0][2] as { env: Record<string, string> };
    expect(opts.env.GITHUB_TOKEN).toBeUndefined();
    expect(opts.env.DATABASE_URL).toBeUndefined();
    expect(opts.env.MY_MCP_KEY).toBe("v"); // registered MCP's own env kept
    // env cleanup handled by afterEach (env snapshot restore).
  });

  it("registered stdio with a non-string command → 400 and never spawns", async () => {
    mockDiscoverAllMcps.mockReturnValue({
      mcps: [
        {
          id: "bad-cmd",
          // Malformed config parsed from JSON: command is not a string.
          config: { command: 12345, args: ["-y", "@scope/x"] },
        },
      ],
    });

    const res = await POST(makeRequest({ mcpId: "bad-cmd" }));

    expect(res.status).toBe(400);
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it("registered stdio with non-string args entries filters them before spawn", async () => {
    mockDiscoverAllMcps.mockReturnValue({
      mcps: [
        {
          id: "mixed-args",
          // Malformed config: args mixes strings and non-strings.
          config: { command: "npx", args: ["-y", 42, "@scope/x", null, true] },
        },
      ],
    });

    const res = await POST(makeRequest({ mcpId: "mixed-args" }));

    expect(res.status).toBe(200);
    expect(mockSpawn).toHaveBeenCalledTimes(1);
    const [cmd, args] = mockSpawn.mock.calls[0];
    expect(cmd).toBe("npx");
    // Non-string entries are dropped; only strings survive.
    expect(args).toEqual(["-y", "@scope/x"]);
  });

  it("registered stdio with a missing command and no url → 400 and never spawns", async () => {
    mockDiscoverAllMcps.mockReturnValue({
      mcps: [
        {
          id: "no-cmd",
          config: { args: ["-y", "@scope/x"] },
        },
      ],
    });

    const res = await POST(makeRequest({ mcpId: "no-cmd" }));

    expect(res.status).toBe(400);
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it("registered MCP with a file: url → 400, never fetches or spawns", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock as never);
    mockDiscoverAllMcps.mockReturnValue({
      mcps: [{ id: "bad-url", config: { url: "file:///etc/passwd" } }],
    });

    const res = await POST(makeRequest({ mcpId: "bad-url" }));

    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it("registered MCP with a data: url → 400, never fetches or spawns", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock as never);
    mockDiscoverAllMcps.mockReturnValue({
      mcps: [{ id: "bad-url", config: { url: "data:text/plain;base64,aGk=" } }],
    });

    const res = await POST(makeRequest({ mcpId: "bad-url" }));

    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it("registered MCP with a non-string url → 400, never fetches or spawns", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock as never);
    mockDiscoverAllMcps.mockReturnValue({
      // Malformed config parsed from JSON: url is not a string, and there is no
      // usable stdio command to fall back to.
      mcps: [{ id: "bad-url", config: { url: 12345 } }],
    });

    const res = await POST(makeRequest({ mcpId: "bad-url" }));

    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it("registered MCP with an empty-string url → 400, never fetches or spawns", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock as never);
    mockDiscoverAllMcps.mockReturnValue({
      mcps: [{ id: "bad-url", config: { url: "" } }],
    });

    const res = await POST(makeRequest({ mcpId: "bad-url" }));

    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it("registered HTTP mcpId resolves URL from registry, not the client body", async () => {
    const fetchMock = vi.fn(async (_url: unknown, _init?: unknown) => ({
      json: async () => ({ result: { tools: [{ name: "http_tool" }] } }),
    }));
    vi.stubGlobal("fetch", fetchMock as never);

    mockDiscoverAllMcps.mockReturnValue({
      mcps: [{ id: "http-mcp", config: { url: "http://localhost:9999/mcp" } }],
    });

    const res = await POST(
      // Client tries to point us at an attacker URL (SSRF) — must be ignored.
      makeRequest({
        mcpId: "http-mcp",
        config: { url: "http://attacker.example/steal" },
      }),
    );

    expect(res.status).toBe(200);
    expect(mockSpawn).not.toHaveBeenCalled();
    for (const call of fetchMock.mock.calls) {
      expect(call[0]).toBe("http://localhost:9999/mcp");
    }
    // fetch stub cleanup handled by afterEach (vi.unstubAllGlobals()).
  });
});
