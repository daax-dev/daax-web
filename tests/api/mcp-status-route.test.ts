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
    // Default: no files exist
    mockExistsSync.mockReturnValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // DoD: reads .mcp.json → {servers:["fs","gh"]}
  // -------------------------------------------------------------------------
  it("reads .mcp.json and returns server names", async () => {
    // Project-root .mcp.json exists; desktop fallback does not
    mockExistsSync.mockImplementation(
      (p: string) =>
        p.endsWith(".mcp.json") && !p.includes("claude_desktop_config"),
    );
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ mcpServers: { fs: {}, gh: {} } }),
    );

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    // Sort to avoid insertion-order flakiness
    expect(data.servers.sort()).toEqual(["fs", "gh"].sort());
  });

  // -------------------------------------------------------------------------
  // DoD: no config → 200 {servers:[]}
  // -------------------------------------------------------------------------
  it("returns HTTP 200 with servers:[] when no config file exists", async () => {
    // mockExistsSync already returns false by default

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
  // Falls back to Claude Desktop config when .mcp.json is absent
  // -------------------------------------------------------------------------
  it("falls back to claude_desktop_config.json when .mcp.json is absent", async () => {
    mockExistsSync.mockImplementation((p: string) =>
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
