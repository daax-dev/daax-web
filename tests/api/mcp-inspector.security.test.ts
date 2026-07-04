/**
 * Security regression tests for POST /api/plugins/mcp-inspector (#182).
 *
 * The route used to build an `npx @modelcontextprotocol/inspector <command>`
 * invocation from a client-supplied command/args/env and spawn it with no auth
 * — an unauthenticated RCE. These tests assert that:
 *  - an unauthenticated request is rejected (401) and never spawns;
 *  - a registered mcpId resolves its command SERVER-side; a client-smuggled
 *    exploit command is ignored;
 *  - an ad-hoc (unregistered) launch with a shell/arbitrary command is rejected
 *    (400) and never spawns;
 *  - an ad-hoc launch with an allowlisted launcher (npx) is permitted;
 *  - the spawned child gets an explicit minimal env (no app secrets leaked).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
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

// Deterministic, instant port allocation (no real sockets).
vi.mock("net", () => {
  const createServer = () =>
    Object.assign(new EventEmitter(), {
      _port: 6274,
      listen(port: number, cb: () => void) {
        this._port = port;
        cb();
      },
      address() {
        return { port: this._port };
      },
      close(cb: () => void) {
        cb();
      },
    });
  return { default: { createServer }, createServer };
});

// Import route AFTER mocks are set up
import { POST, GET } from "@/app/api/plugins/mcp-inspector/route";

function makeFakeProc() {
  return Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    pid: 4242,
    kill: vi.fn(),
  });
}

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/plugins/mcp-inspector", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const EXPLOIT_CMD = "/bin/sh";
const EXPLOIT_ARGS = ["-c", "touch /tmp/pwned"];

describe("POST /api/plugins/mcp-inspector — security (#182)", () => {
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
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    // Restore env: drop keys added during the test, reset any modified values.
    for (const key of Object.keys(process.env)) {
      if (!(key in envSnapshot)) delete process.env[key];
    }
    Object.assign(process.env, envSnapshot);
  });

  // Drives a handler call that reaches the post-spawn 2s startup wait.
  async function runToCompletion(req: NextRequest) {
    const p = POST(req);
    await vi.advanceTimersByTimeAsync(2100);
    return p;
  }

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

    const res = await POST(
      makeRequest({
        mcpId: "custom-1",
        command: EXPLOIT_CMD,
        args: EXPLOIT_ARGS,
      }),
    );

    expect(res.status).toBe(401);
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it("ad-hoc shell command is rejected (400) and never spawns", async () => {
    mockDiscoverAllMcps.mockReturnValue({ mcps: [] });

    const res = await POST(
      makeRequest({
        mcpId: "custom-2",
        command: EXPLOIT_CMD,
        args: EXPLOIT_ARGS,
      }),
    );

    expect(res.status).toBe(400);
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it("ad-hoc launch with an absolute path to an allowlisted name is rejected", async () => {
    mockDiscoverAllMcps.mockReturnValue({ mcps: [] });

    const res = await POST(
      makeRequest({ mcpId: "custom-3", command: "/usr/bin/npx" }),
    );

    expect(res.status).toBe(400);
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it("unknown mcpId with no command → 403 and never spawns", async () => {
    mockDiscoverAllMcps.mockReturnValue({ mcps: [] });

    const res = await POST(makeRequest({ mcpId: "ghost" }));

    expect(res.status).toBe(403);
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it("discovery uses the SERVER-default path; a client-supplied projectPath is ignored", async () => {
    // Force a deterministic server default: with CLAUDE_CODE_CONFIG set,
    // getDefaultProjectPath() short-circuits to "/workspace" (no fs probe).
    process.env.CLAUDE_CODE_CONFIG = "/some/claude/config";
    mockDiscoverAllMcps.mockReturnValue({
      mcps: [{ id: "default-path-mcp", config: { command: "npx", args: [] } }],
    });

    const res = await runToCompletion(
      // Attacker tries to redirect registry discovery at a path they control
      // (e.g. one with an attacker-authored .mcp.json) — must be ignored.
      makeRequest({
        mcpId: "default-path-mcp",
        projectPath: "/attacker/writable",
      }),
    );

    expect(res.status).toBe(200);
    expect(mockDiscoverAllMcps).toHaveBeenCalledTimes(1);
    // Discovery scoped to the SERVER default, NOT the client-supplied path.
    expect(mockDiscoverAllMcps.mock.calls[0][0]).toBe("/workspace");
    expect(mockDiscoverAllMcps.mock.calls[0][0]).not.toBe("/attacker/writable");
    // env restored by afterEach (env snapshot restore).
  });

  it("GET reflects the full remote inspector url (transport/serverUrl), not just localhost:port", async () => {
    mockDiscoverAllMcps.mockReturnValue({
      mcps: [
        {
          id: "get-remote",
          config: { type: "http", url: "http://localhost:9999/mcp" },
        },
      ],
    });

    // Launch a registered REMOTE (SSE/HTTP) inspector, then read the mgmt list.
    await runToCompletion(
      makeRequest({ mcpId: "get-remote", transport: "http" }),
    );

    const res = await GET();
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      running: { id: string; url: string }[];
    };
    const entry = data.running.find((r) => r.id === "get-remote");
    expect(entry).toBeDefined();
    // GET surfaces the stored launch URL with the server-resolved target, not a
    // bare http://localhost:<port>.
    expect(entry!.url).toContain(
      `serverUrl=${encodeURIComponent("http://localhost:9999/mcp")}`,
    );
    expect(entry!.url).toContain("transport=streamable-http");
  });

  it("registered mcpId resolves command SERVER-side; client command ignored", async () => {
    mockDiscoverAllMcps.mockReturnValue({
      mcps: [
        {
          id: "real-mcp",
          config: {
            command: "npx",
            args: ["-y", "@scope/real-mcp"],
            env: { MY_MCP_KEY: "v" },
          },
        },
      ],
    });

    const res = await runToCompletion(
      makeRequest({
        mcpId: "real-mcp",
        // Attacker tries to smuggle a shell for a known id — must be ignored.
        command: EXPLOIT_CMD,
        args: EXPLOIT_ARGS,
      }),
    );

    expect(res.status).toBe(200);
    expect(mockSpawn).toHaveBeenCalledTimes(1);

    const [cmd, args] = mockSpawn.mock.calls[0];
    expect(cmd).toBe("npx");
    // Inspector wraps the SERVER-resolved MCP command, never "/bin/sh".
    expect(args).toEqual([
      "@modelcontextprotocol/inspector",
      "npx",
      "-y",
      "@scope/real-mcp",
    ]);
    expect((args as string[]).join(" ")).not.toContain("/bin/sh");
  });

  it("ad-hoc launch with an allowlisted launcher (npx) is permitted", async () => {
    mockDiscoverAllMcps.mockReturnValue({ mcps: [] });

    const res = await runToCompletion(
      makeRequest({
        mcpId: "custom-ok",
        command: "npx",
        args: ["-y", "@scope/some-mcp"],
      }),
    );

    expect(res.status).toBe(200);
    expect(mockSpawn).toHaveBeenCalledTimes(1);
    const [cmd, args] = mockSpawn.mock.calls[0];
    expect(cmd).toBe("npx");
    expect(args).toEqual([
      "@modelcontextprotocol/inspector",
      "npx",
      "-y",
      "@scope/some-mcp",
    ]);
  });

  it("spawns with an explicit minimal env (no app secrets leaked)", async () => {
    process.env.GITHUB_TOKEN = "super-secret";
    process.env.DATABASE_URL = "postgres://leak";
    mockDiscoverAllMcps.mockReturnValue({
      mcps: [
        {
          id: "real-mcp2",
          config: { command: "npx", args: [], env: { MY_MCP_KEY: "v" } },
        },
      ],
    });

    const res = await runToCompletion(makeRequest({ mcpId: "real-mcp2" }));
    expect(res.status).toBe(200);

    const opts = mockSpawn.mock.calls[0][2] as { env: Record<string, string> };
    expect(opts.env.GITHUB_TOKEN).toBeUndefined();
    expect(opts.env.DATABASE_URL).toBeUndefined();
    expect(opts.env.MY_MCP_KEY).toBe("v");
    // Port overrides are still injected.
    expect(opts.env.CLIENT_PORT).toBeDefined();
    expect(opts.env.SERVER_PORT).toBeDefined();
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

  it("registered MCP with neither command nor url → 400 and never spawns", async () => {
    mockDiscoverAllMcps.mockReturnValue({
      mcps: [
        {
          id: "empty-cfg",
          // Misconfigured registered MCP: no usable command and no URL.
          config: { env: { FOO: "bar" } },
        },
      ],
    });

    const res = await POST(makeRequest({ mcpId: "empty-cfg" }));

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

    const res = await runToCompletion(makeRequest({ mcpId: "mixed-args" }));

    expect(res.status).toBe(200);
    expect(mockSpawn).toHaveBeenCalledTimes(1);
    const [cmd, args] = mockSpawn.mock.calls[0];
    expect(cmd).toBe("npx");
    // Non-string entries dropped; inspector wraps only the string args.
    expect(args).toEqual([
      "@modelcontextprotocol/inspector",
      "npx",
      "-y",
      "@scope/x",
    ]);
  });

  it("registered REMOTE mcpId resolves URL SERVER-side; client serverUrl ignored", async () => {
    mockDiscoverAllMcps.mockReturnValue({
      mcps: [
        {
          id: "remote-mcp",
          config: { type: "http", url: "http://localhost:9999/mcp" },
        },
      ],
    });

    const res = await runToCompletion(
      makeRequest({
        mcpId: "remote-mcp",
        transport: "http",
        command: undefined,
        // Attacker tries to point the inspector at their URL — must be ignored.
        serverUrl: "http://attacker.example/steal",
      }),
    );

    expect(res.status).toBe(200);
    // Remote launch never spawns a command from the URL: the inspector is
    // launched BARE (no positional command/args after the inspector package).
    expect(mockSpawn).toHaveBeenCalledTimes(1);
    const [cmd, args] = mockSpawn.mock.calls[0];
    expect(cmd).toBe("npx");
    expect(args).toEqual(["@modelcontextprotocol/inspector"]);

    // The returned UI URL carries the SERVER-resolved target, not the client's.
    const data = (await res.json()) as { url: string };
    expect(data.url).toContain(
      `serverUrl=${encodeURIComponent("http://localhost:9999/mcp")}`,
    );
    expect(data.url).toContain("transport=streamable-http");
    expect(data.url).not.toContain("attacker.example");
  });

  it("registered REMOTE mcpId with a file: url → 400 and never spawns", async () => {
    mockDiscoverAllMcps.mockReturnValue({
      mcps: [
        {
          id: "remote-bad",
          // Malformed registry entry parsed from JSON: a non-http(s) URL must
          // not be handed to the inspector — reject with a controlled 400.
          config: { type: "http", url: "file:///etc/passwd" },
        },
      ],
    });

    const res = await POST(
      makeRequest({ mcpId: "remote-bad", transport: "http" }),
    );

    expect(res.status).toBe(400);
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it("registered REMOTE mcpId with a data: url → 400 and never spawns", async () => {
    mockDiscoverAllMcps.mockReturnValue({
      mcps: [
        {
          id: "remote-bad",
          config: { type: "http", url: "data:text/plain;base64,aGk=" },
        },
      ],
    });

    const res = await POST(
      makeRequest({ mcpId: "remote-bad", transport: "http" }),
    );

    expect(res.status).toBe(400);
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it("ad-hoc SSE launch with a valid http(s) serverUrl is permitted (bare inspector)", async () => {
    mockDiscoverAllMcps.mockReturnValue({ mcps: [] });

    const res = await runToCompletion(
      makeRequest({
        mcpId: "custom-remote",
        transport: "sse",
        command: undefined,
        serverUrl: "http://localhost:3000/sse",
      }),
    );

    expect(res.status).toBe(200);
    expect(mockSpawn).toHaveBeenCalledTimes(1);
    const [, args] = mockSpawn.mock.calls[0];
    // No command spawned from the URL — inspector launched bare.
    expect(args).toEqual(["@modelcontextprotocol/inspector"]);
    const data = (await res.json()) as { url: string };
    expect(data.url).toContain("transport=sse");
    expect(data.url).toContain(
      `serverUrl=${encodeURIComponent("http://localhost:3000/sse")}`,
    );
  });

  it("ad-hoc SSE/HTTP launch with a non-http serverUrl is rejected (400) and never spawns", async () => {
    mockDiscoverAllMcps.mockReturnValue({ mcps: [] });

    const res = await POST(
      makeRequest({
        mcpId: "custom-bad-url",
        transport: "http",
        command: undefined,
        serverUrl: "file:///etc/passwd",
      }),
    );

    expect(res.status).toBe(400);
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it("ad-hoc SSE/HTTP launch with a missing serverUrl is rejected (400) and never spawns", async () => {
    mockDiscoverAllMcps.mockReturnValue({ mcps: [] });

    const res = await POST(
      makeRequest({
        mcpId: "custom-no-url",
        transport: "sse",
        command: undefined,
      }),
    );

    expect(res.status).toBe(400);
    expect(mockSpawn).not.toHaveBeenCalled();
  });
});
