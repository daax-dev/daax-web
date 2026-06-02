import { NextResponse } from "next/server";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

/** Shape accepted by both .mcp.json and claude_desktop_config.json */
interface McpConfig {
  mcpServers?: Record<string, unknown>;
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

// GET /api/mcp/status
// Reads .mcp.json from the project root; falls back to
// ~/.claude/claude_desktop_config.json when .mcp.json is absent.
// Returns { servers: string[] } (HTTP 200) always — never 404/500.
export async function GET(): Promise<NextResponse> {
  try {
    // Primary: project-root .mcp.json
    const primaryConfig = tryReadConfig(join(process.cwd(), ".mcp.json"));

    // Fallback: Claude Desktop config
    const fallbackConfig =
      primaryConfig === null
        ? tryReadConfig(
            join(homedir(), ".claude", "claude_desktop_config.json"),
          )
        : null;

    const cfg = primaryConfig ?? fallbackConfig;
    const servers = cfg?.mcpServers ? Object.keys(cfg.mcpServers) : [];

    return NextResponse.json({ servers });
  } catch {
    // Safety net: always return 200 with empty servers
    return NextResponse.json({ servers: [] });
  }
}
