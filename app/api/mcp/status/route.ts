import { NextResponse } from "next/server";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

/**
 * Shape accepted by .mcp.json (supports both `mcpServers` and `servers` keys
 * matching the rest of the MCP readers in this repo).
 */
interface McpConfig {
  mcpServers?: Record<string, unknown>;
  servers?: Record<string, unknown>;
}

/** Attempt to read and parse an MCP config file, returning null on any failure. */
function tryReadConfig(filePath: string): McpConfig | null {
  try {
    if (!existsSync(filePath)) return null;
    const raw = readFileSync(filePath, "utf8");
    return JSON.parse(raw) as McpConfig;
  } catch {
    return null;
  }
}

/** Extract server names from a parsed config (supports both key variants). */
function extractServerNames(cfg: McpConfig): string[] {
  const map = cfg.mcpServers ?? cfg.servers;
  return map ? Object.keys(map) : [];
}

/**
 * Resolve the path to the primary .mcp.json.
 * Honours HOME_MCP_JSON env var used in Docker/container deployments
 * (matches lib/mcp-config.ts getHomeMcpJsonPath convention).
 * Treats empty string as unset.
 */
function getPrimaryMcpJsonPath(): string {
  return process.env.HOME_MCP_JSON || join(process.cwd(), ".mcp.json");
}

/**
 * Resolve the Claude Desktop config path.
 * Honours CLAUDE_DESKTOP_CONFIG env var (matches lib/mcp-config.ts convention).
 * Treats empty string as unset.
 * Default: macOS path (~/Library/Application Support/Claude/claude_desktop_config.json).
 */
function getClaudeDesktopConfigPath(): string {
  return (
    process.env.CLAUDE_DESKTOP_CONFIG ||
    join(
      homedir(),
      "Library",
      "Application Support",
      "Claude",
      "claude_desktop_config.json",
    )
  );
}

// GET /api/mcp/status
// Reads the primary .mcp.json (or HOME_MCP_JSON override); falls back to the
// Claude Desktop config (or CLAUDE_DESKTOP_CONFIG override) when .mcp.json is absent.
// Supports both `mcpServers` and `servers` keys.
// Returns { servers: string[] } (HTTP 200) always — never 404/500.
export async function GET(): Promise<NextResponse> {
  try {
    // Primary: project-root .mcp.json (or HOME_MCP_JSON env override)
    const primaryConfig = tryReadConfig(getPrimaryMcpJsonPath());

    // Fallback: Claude Desktop config (or CLAUDE_DESKTOP_CONFIG env override)
    const fallbackConfig =
      primaryConfig === null
        ? tryReadConfig(getClaudeDesktopConfigPath())
        : null;

    const cfg = primaryConfig ?? fallbackConfig;
    const servers = cfg ? extractServerNames(cfg) : [];

    return NextResponse.json({ servers });
  } catch {
    // Safety net: always return 200 with empty servers
    return NextResponse.json({ servers: [] });
  }
}
