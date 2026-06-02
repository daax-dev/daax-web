/**
 * Tests for GET /api/mcp/status
 *
 * Mocks node:fs and lib/mcp-config so tests are deterministic regardless
 * of host filesystem.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoist mock factories before imports
// ---------------------------------------------------------------------------

const { mockExistsSync, mockReadFileSync } = vi.hoisted(() => ({
  mockExistsSync: vi.fn<(p: string) => boolean>(),
  mockReadFileSync: vi.fn<(p: string, encoding: string) => string>(),
}));

const { mockGetHomeMcpJsonPath } = vi.hoisted(() => ({
  mockGetHomeMcpJsonPath: vi.fn<() => string>(),
}));

vi.mock("node:fs", () => ({
  default: { existsSync: mockExistsSync, readFileSync: mockReadFileSync },
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
}));

vi.mock("@/lib/mcp-config", () => ({
  getHomeMcpJsonPath: mockGetHomeMcpJsonPath,
}));

// Import after mocks
import { GET } from "@/app/api/mcp/status/route";

describe("GET /api/mcp/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no files exist; home path is somewhere unlikely to collide with cwd
    mockExistsSync.mockReturnValue(false);
    mockGetHomeMcpJsonPath.mockReturnValue("/home/user/.mcp.json");
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  // -------------------------------------------------------------------------
  // DoD: reads .mcp.json → {servers:["fs","gh"]}
  // -------------------------------------------------------------------------
  it("reads .mcp.json and returns server names", async () => {
    mockExistsSync.mockImplementation(
      (p: string) =>
        p.endsWith(".mcp.json") &&
        !p.includes("Application Support") &&
        !p.includes(".config") &&
        !p.includes("/home/user"),
    );
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ mcpServers: { fs: {}, gh: {} } }),
    );

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.servers.sort()).toEqual(["fs", "gh"].sort());
  });

  // -------------------------------------------------------------------------
  // DoD: no config → 200 {servers:[]}
  // -------------------------------------------------------------------------
  it("returns HTTP 200 with servers:[] when no config file exists", async () => {
    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.servers).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // DoD: empty mcpServers → {servers:[]} — project .mcp.json is authoritative
  // -------------------------------------------------------------------------
  it("returns servers:[] for empty mcpServers — project file is authoritative", async () => {
    // Project-root .mcp.json exists but has no servers
    mockExistsSync.mockImplementation(
      (p: string) => p.endsWith(".mcp.json") && !p.includes("/home/user"),
    );
    mockReadFileSync.mockReturnValue(JSON.stringify({ mcpServers: {} }));

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.servers).toEqual([]);
    // IMPORTANT: does NOT fall through to home/desktop configs
  });

  // -------------------------------------------------------------------------
  // Supports alternative `servers` key in .mcp.json
  // -------------------------------------------------------------------------
  it("supports the `servers` key in .mcp.json (alternative format)", async () => {
    mockExistsSync.mockImplementation(
      (p: string) => p.endsWith(".mcp.json") && !p.includes("/home/user"),
    );
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ servers: { toolA: {}, toolB: {} } }),
    );

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.servers.sort()).toEqual(["toolA", "toolB"].sort());
  });

  // -------------------------------------------------------------------------
  // Home-level .mcp.json (HOME_MCP_JSON via getHomeMcpJsonPath)
  // -------------------------------------------------------------------------
  it("uses home .mcp.json when project .mcp.json is absent", async () => {
    mockGetHomeMcpJsonPath.mockReturnValue("/home/user/.mcp.json");
    mockExistsSync.mockImplementation(
      (p: string) => p === "/home/user/.mcp.json",
    );
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ mcpServers: { home_mcp: {} } }),
    );

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.servers).toEqual(["home_mcp"]);
  });

  // -------------------------------------------------------------------------
  // HOME_MCP_JSON env override (Docker deployments via getHomeMcpJsonPath)
  // -------------------------------------------------------------------------
  it("honours HOME_MCP_JSON env var for Docker deployments", async () => {
    // Simulate lib/mcp-config.ts returning the env-var path
    mockGetHomeMcpJsonPath.mockReturnValue("/host-config/.mcp.json");
    mockExistsSync.mockImplementation(
      (p: string) => p === "/host-config/.mcp.json",
    );
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ mcpServers: { docker_mcp: {} } }),
    );

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.servers).toEqual(["docker_mcp"]);
  });

  // -------------------------------------------------------------------------
  // Falls back to Claude Desktop config (macOS path)
  // -------------------------------------------------------------------------
  it("falls back to Claude Desktop config (macOS path) when .mcp.json absent", async () => {
    mockExistsSync.mockImplementation(
      (p: string) =>
        p.includes("Application Support") &&
        p.includes("claude_desktop_config.json"),
    );
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ mcpServers: { playwright: {} } }),
    );

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.servers).toEqual(["playwright"]);
  });

  // -------------------------------------------------------------------------
  // Linux Claude Desktop path
  // -------------------------------------------------------------------------
  it("uses Linux Claude Desktop path (~/.config/claude/) when macOS path absent", async () => {
    mockExistsSync.mockImplementation(
      (p: string) =>
        p.includes(".config") &&
        p.includes("claude") &&
        p.includes("claude_desktop_config.json"),
    );
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ mcpServers: { linux_mcp: {} } }),
    );

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.servers).toEqual(["linux_mcp"]);
  });

  // -------------------------------------------------------------------------
  // CLAUDE_DESKTOP_CONFIG env var override
  // -------------------------------------------------------------------------
  it("honours CLAUDE_DESKTOP_CONFIG env var override", async () => {
    vi.stubEnv("CLAUDE_DESKTOP_CONFIG", "/host-config/desktop.json");
    mockExistsSync.mockImplementation(
      (p: string) => p === "/host-config/desktop.json",
    );
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ mcpServers: { desktop_mcp: {} } }),
    );

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.servers).toEqual(["desktop_mcp"]);
  });

  // -------------------------------------------------------------------------
  // Type guard: mcpServers is not a plain object
  // -------------------------------------------------------------------------
  it("returns servers:[] when mcpServers is an array (not a plain object)", async () => {
    mockExistsSync.mockImplementation(
      (p: string) => p.endsWith(".mcp.json") && !p.includes("/home/user"),
    );
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ mcpServers: ["server1", "server2"] }),
    );

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.servers).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Cache-Control header
  // -------------------------------------------------------------------------
  it("sets Cache-Control: no-store header", async () => {
    const res = await GET();

    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  // -------------------------------------------------------------------------
  // Returns [] when mcpServers key is missing from config
  // -------------------------------------------------------------------------
  it("returns servers:[] when mcpServers key is missing entirely", async () => {
    mockExistsSync.mockImplementation(
      (p: string) => p.endsWith(".mcp.json") && !p.includes("/home/user"),
    );
    mockReadFileSync.mockReturnValue(JSON.stringify({ other: "data" }));

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.servers).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Graceful handling of invalid JSON
  // -------------------------------------------------------------------------
  it("returns servers:[] when JSON is invalid (safety net)", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue("NOT_JSON{{{");

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.servers).toEqual([]);
  });
});
