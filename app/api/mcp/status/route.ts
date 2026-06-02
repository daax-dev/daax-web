import { NextResponse } from "next/server";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { getHomeMcpJsonPath } from "@/lib/mcp-config";

/**
 * Shape accepted by .mcp.json (supports both `mcpServers` and `servers` keys
 * matching the rest of the MCP readers in this repo — see lib/mcp-discovery.ts).
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
 * Honours CLAUDE_DESKTOP_CONFIG env var (treats empty string as unset).
 * Path resolution matches lib/mcp-discovery.ts CONFIG_PATHS.claudeDesktop:
 * checks macOS path first, falls back to Linux ~/.config/claude/ path.
 */
function getClaudeDesktopConfigPath(): string {
  if (process.env.CLAUDE_DESKTOP_CONFIG) {
    return process.env.CLAUDE_DESKTOP_CONFIG;
  }
  const home = homedir();
  const macPath = join(
    home,
    "Library",
    "Application Support",
    "Claude",
    "claude_desktop_config.json",
  );
  const linuxPath = join(
    home,
    ".config",
    "claude",
    "claude_desktop_config.json",
  );
  return existsSync(macPath) ? macPath : linuxPath;
}

const NO_STORE = { headers: { "Cache-Control": "no-store" } };

// GET /api/mcp/status
// Reads MCP server names from config sources in priority order:
//  1. process.cwd()/.mcp.json    (project-root; authoritative if file exists)
//  2. getHomeMcpJsonPath()        (home-level .mcp.json per lib/mcp-config.ts)
//  3. Claude Desktop config      (CLAUDE_DESKTOP_CONFIG or platform default)
// Returns { servers: string[] } (HTTP 200, Cache-Control: no-store) always.
export async function GET(): Promise<NextResponse> {
  try {
    // 1. Project-root .mcp.json — treat as authoritative if the file exists.
    //    An empty or invalid/unparseable config still means "project-root wins":
    //    do not fall through to home/desktop sources and show their servers.
    const projectMcpPath = join(process.cwd(), ".mcp.json");
    if (existsSync(projectMcpPath)) {
      const projectConfig = tryReadConfig(projectMcpPath);
      return NextResponse.json(
        { servers: projectConfig ? extractServerNames(projectConfig) : [] },
        NO_STORE,
      );
    }

    // 2. Home-level .mcp.json (or HOME_MCP_JSON env override per lib/mcp-config.ts).
    //    getHomeMcpJsonPath() resolves HOME_MCP_JSON || ~/.mcp.json.
    const homeMcpPath = getHomeMcpJsonPath();
    const homeConfig = tryReadConfig(homeMcpPath);
    if (homeConfig !== null) {
      return NextResponse.json(
        { servers: extractServerNames(homeConfig) },
        NO_STORE,
      );
    }

    // 3. Claude Desktop config fallback.
    const desktopConfig = tryReadConfig(getClaudeDesktopConfigPath());
    return NextResponse.json(
      { servers: desktopConfig ? extractServerNames(desktopConfig) : [] },
      NO_STORE,
    );
  } catch {
    // Safety net: always return 200 with empty servers
    return NextResponse.json({ servers: [] }, NO_STORE);
  }
}
