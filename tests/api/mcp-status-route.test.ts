/**
 * Tests for GET /api/mcp/status
 *
 * Mocks node:fs so tests are deterministic regardless of host filesystem.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoist mock factories before imports
// ---------------------------------------------------------------------------

const { mockExistsSync, mockReadFileSync } = vi.hoisted(() => ({
  mockExistsSync: vi.fn<(p: string) => boolean>(),
  mockReadFileSync: vi.fn<(p: string, encoding: string) => string>(),
}));

vi.mock("node:fs", () => ({
  default: { existsSync: mockExistsSync, readFileSync: mockReadFileSync },
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
}));

// Import after mocks
import { GET } from "@/app/api/mcp/status/route";

describe("GET /api/mcp/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no files exist; no env overrides
    mockExistsSync.mockReturnValue(false);
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
        !p.includes("claude_desktop_config"),
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
  // DoD: empty mcpServers → {servers:[]}
  // -------------------------------------------------------------------------
  it("returns servers:[] for empty mcpServers object", async () => {
    mockExistsSync.mockImplementation((p: string) => p.endsWith(".mcp.json"));
    mockReadFileSync.mockReturnValue(JSON.stringify({ mcpServers: {} }));

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.servers).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Supports alternative `servers` key in .mcp.json (Copilot finding #3/#4)
  // -------------------------------------------------------------------------
  it("supports the `servers` key in .mcp.json (alternative format)", async () => {
    mockExistsSync.mockImplementation((p: string) => p.endsWith(".mcp.json"));
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ servers: { toolA: {}, toolB: {} } }),
    );

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.servers.sort()).toEqual(["toolA", "toolB"].sort());
  });

  // -------------------------------------------------------------------------
  // Falls back to Claude Desktop config (macOS path)
  // -------------------------------------------------------------------------
  it("falls back to Claude Desktop config (macOS path) when .mcp.json is absent", async () => {
    // Only the Claude Desktop macOS path exists
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
  // Falls back to Linux Claude Desktop path (Copilot finding #1 on PR #78)
  // -------------------------------------------------------------------------
  it("uses Linux Claude Desktop path (~/.config/claude/) when macOS path absent", async () => {
    // Only the Linux path exists, not macOS
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
  // Honours HOME_MCP_JSON env var (Copilot finding #1)
  // -------------------------------------------------------------------------
  it("honours HOME_MCP_JSON env var for Docker deployments", async () => {
    vi.stubEnv("HOME_MCP_JSON", "/host-config/.mcp.json");
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
  // Honours CLAUDE_DESKTOP_CONFIG env var (Copilot finding #2)
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
  // Type guard: mcpServers is not a plain object (Copilot finding #1)
  // -------------------------------------------------------------------------
  it("returns servers:[] when mcpServers is an array (not a plain object)", async () => {
    mockExistsSync.mockImplementation((p: string) => p.endsWith(".mcp.json"));
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ mcpServers: ["server1", "server2"] }),
    );

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.servers).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Cache-Control header (Copilot finding #2)
  // -------------------------------------------------------------------------
  it("sets Cache-Control: no-store header", async () => {
    mockExistsSync.mockReturnValue(false);

    const res = await GET();

    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  // -------------------------------------------------------------------------
  // Returns [] when mcpServers key is missing from config
  // -------------------------------------------------------------------------
  it("returns servers:[] when mcpServers key is missing entirely", async () => {
    mockExistsSync.mockImplementation((p: string) => p.endsWith(".mcp.json"));
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
