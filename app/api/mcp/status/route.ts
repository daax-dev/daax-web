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
  // Guard: only call Object.keys on a plain object (not null, array, or primitive)
  if (!map || typeof map !== "object" || Array.isArray(map)) return [];
  return Object.keys(map);
}

/**
 * Resolve the Claude Desktop config path.
 * Honours CLAUDE_DESKTOP_CONFIG env var.
 * Checks macOS path first; falls back to Linux path (`~/.config/claude/...`).
 * Matches the convention in lib/mcp-discovery.ts CONFIG_PATHS.claudeDesktop.
 */
function getClaudeDesktopConfigPath(): string {
  // Env override (treats empty string as unset)
  if (process.env.CLAUDE_DESKTOP_CONFIG) {
    return process.env.CLAUDE_DESKTOP_CONFIG;
  }
  const home = homedir();
  // macOS path
  const macPath = join(
    home,
    "Library",
    "Application Support",
    "Claude",
    "claude_desktop_config.json",
  );
  // Linux fallback — return the first that exists, or macPath as default
  const linuxPath = join(
    home,
    ".config",
    "claude",
    "claude_desktop_config.json",
  );
  return existsSync(macPath) ? macPath : linuxPath;
}

// GET /api/mcp/status
// Reads MCP server names from config sources in priority order:
//  1. process.cwd()/.mcp.json    (project-root)
//  2. HOME_MCP_JSON path         (home-level .mcp.json, Docker override)
//  3. Claude Desktop config      (CLAUDE_DESKTOP_CONFIG or platform default)
// Stops at the first source that returns servers.
// Returns { servers: string[] } (HTTP 200) always — never 404/500.
export async function GET(): Promise<NextResponse> {
  const noStore = { headers: { "Cache-Control": "no-store" } };
  try {
    // 1. Project-root .mcp.json
    const projectConfig = tryReadConfig(join(process.cwd(), ".mcp.json"));
    if (projectConfig) {
      const servers = extractServerNames(projectConfig);
      if (servers.length > 0) {
        return NextResponse.json({ servers }, noStore);
      }
    }

    // 2. Home-level .mcp.json (or HOME_MCP_JSON override — semantic as in lib/mcp-config.ts)
    const homeMcpPath =
      process.env.HOME_MCP_JSON || join(homedir(), ".mcp.json");
    if (homeMcpPath !== join(process.cwd(), ".mcp.json")) {
      const homeConfig = tryReadConfig(homeMcpPath);
      if (homeConfig) {
        const servers = extractServerNames(homeConfig);
        if (servers.length > 0) {
          return NextResponse.json({ servers }, noStore);
        }
      }
    }

    // 3. Claude Desktop config fallback
    const desktopConfig = tryReadConfig(getClaudeDesktopConfigPath());
    const servers = desktopConfig ? extractServerNames(desktopConfig) : [];
    return NextResponse.json({ servers }, noStore);
  } catch {
    // Safety net: always return 200 with empty servers
    return NextResponse.json({ servers: [] }, noStore);
  }
}
