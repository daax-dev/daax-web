// MCP Discovery - finds and aggregates MCPs from various sources
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { McpServer, McpTool, McpResource } from "@/types/mcp";

// Discovered MCP with source tracking
export interface DiscoveredMcp {
  id: string;
  name: string;
  description: string;
  source: McpSource;
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  tools?: McpTool[];
  resources?: McpResource[];
  enabled: boolean;
  disabled: boolean; // Explicitly disabled in config
  lastSeen: string;
}

export type McpSource =
  | { type: "claude-desktop"; path: string }
  | { type: "claude-code"; path: string; project?: string }
  | { type: "claude-project"; path: string }
  | { type: "mcp-json"; path: string }
  | { type: "active-session" }
  | { type: "registry" }
  | { type: "manual" };

// Claude Desktop config structure
interface ClaudeDesktopConfig {
  mcpServers?: Record<string, ClaudeMcpServer>;
}

interface ClaudeMcpServer {
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
}

// Claude project config (.claude.json)
interface ClaudeProjectConfig {
  mcpServers?: Record<string, ClaudeMcpServer>;
}

// .mcp.json config
interface McpJsonConfig {
  mcpServers?: Record<string, ClaudeMcpServer>;
  servers?: Record<string, ClaudeMcpServer>; // Alternative key
}

// Claude Code ~/.claude.json config
interface ClaudeCodeConfig {
  projects?: Record<string, ClaudeCodeProject>;
}

interface ClaudeCodeProject {
  mcpServers?: Record<string, ClaudeMcpServer>;
  disabledMcpServers?: string[];
  enabledMcpjsonServers?: string[];
  disabledMcpjsonServers?: string[];
}

// Active session MCPs (known from tool names in current session)
const KNOWN_ACTIVE_MCPS = [
  { id: "github", name: "GitHub", description: "GitHub repository operations" },
  {
    id: "sequential",
    name: "Sequential Thinking",
    description: "Step-by-step problem solving",
  },
  { id: "playwright", name: "Playwright", description: "Browser automation" },
  {
    id: "playwright-test",
    name: "Playwright Test",
    description: "Test generation and debugging",
  },
  { id: "shadcn", name: "Shadcn UI", description: "UI component library" },
  { id: "semgrep", name: "Semgrep", description: "Security code scanning" },
  { id: "serena", name: "Serena", description: "Semantic code analysis" },
];

// Discovery result
export interface McpDiscoveryResult {
  discovered: DiscoveredMcp[];
  sources: {
    name: string;
    type: McpSource["type"];
    path?: string;
    mcpCount: number;
    status: "found" | "not_found" | "error";
    error?: string;
  }[];
  timestamp: string;
}

// Known paths for MCP configs
const CONFIG_PATHS = {
  claudeDesktop: () => {
    const home = homedir();
    // macOS path
    const macPath = join(
      home,
      "Library",
      "Application Support",
      "Claude",
      "claude_desktop_config.json",
    );
    // Linux/Windows fallback
    const linuxPath = join(
      home,
      ".config",
      "claude",
      "claude_desktop_config.json",
    );
    return existsSync(macPath) ? macPath : linuxPath;
  },
  claudeCode: () => join(homedir(), ".claude.json"),
  claudeProject: (projectRoot: string) => join(projectRoot, ".claude.json"),
  mcpJson: (projectRoot: string) => join(projectRoot, ".mcp.json"),
};

// Parse MCP server to DiscoveredMcp
function parseMcpServer(
  id: string,
  server: ClaudeMcpServer,
  source: McpSource,
  isDisabled = false,
): DiscoveredMcp {
  // Generate a friendly name from the ID
  const name = id
    .replace(/-/g, " ")
    .replace(/_/g, " ")
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

  // Generate description based on command/url
  let description = `MCP server: ${id}`;
  if (server.command) {
    description = `CLI-based MCP: ${server.command}`;
  } else if (server.url) {
    description = `Remote MCP: ${server.url}`;
  }

  return {
    id,
    name,
    description,
    source,
    command: server.command,
    args: server.args,
    url: server.url,
    env: server.env,
    enabled: !isDisabled,
    disabled: isDisabled,
    lastSeen: new Date().toISOString(),
  };
}

// Discover MCPs from Claude Desktop config
function discoverClaudeDesktop(): {
  mcps: DiscoveredMcp[];
  status: "found" | "not_found" | "error";
  path: string;
  error?: string;
} {
  const path = CONFIG_PATHS.claudeDesktop();

  if (!existsSync(path)) {
    return { mcps: [], status: "not_found", path };
  }

  try {
    const content = readFileSync(path, "utf-8");
    const config: ClaudeDesktopConfig = JSON.parse(content);

    if (!config.mcpServers) {
      return { mcps: [], status: "found", path };
    }

    const mcps = Object.entries(config.mcpServers).map(([id, server]) =>
      parseMcpServer(id, server, { type: "claude-desktop", path }),
    );

    return { mcps, status: "found", path };
  } catch (err) {
    return {
      mcps: [],
      status: "error",
      path,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

// Discover MCPs from Claude project config
function discoverClaudeProject(projectRoot: string): {
  mcps: DiscoveredMcp[];
  status: "found" | "not_found" | "error";
  path: string;
  error?: string;
} {
  const path = CONFIG_PATHS.claudeProject(projectRoot);

  if (!existsSync(path)) {
    return { mcps: [], status: "not_found", path };
  }

  try {
    const content = readFileSync(path, "utf-8");
    const config: ClaudeProjectConfig = JSON.parse(content);

    if (!config.mcpServers) {
      return { mcps: [], status: "found", path };
    }

    const mcps = Object.entries(config.mcpServers).map(([id, server]) =>
      parseMcpServer(id, server, { type: "claude-project", path }),
    );

    return { mcps, status: "found", path };
  } catch (err) {
    return {
      mcps: [],
      status: "error",
      path,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

// Discover MCPs from .mcp.json
function discoverMcpJson(projectRoot: string): {
  mcps: DiscoveredMcp[];
  status: "found" | "not_found" | "error";
  path: string;
  error?: string;
} {
  const path = CONFIG_PATHS.mcpJson(projectRoot);

  if (!existsSync(path)) {
    return { mcps: [], status: "not_found", path };
  }

  try {
    const content = readFileSync(path, "utf-8");
    const config: McpJsonConfig = JSON.parse(content);

    const servers = config.mcpServers || config.servers;
    if (!servers) {
      return { mcps: [], status: "found", path };
    }

    const mcps = Object.entries(servers).map(([id, server]) =>
      parseMcpServer(id, server, { type: "mcp-json", path }),
    );

    return { mcps, status: "found", path };
  } catch (err) {
    return {
      mcps: [],
      status: "error",
      path,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

// Main discovery function
export function discoverAllMcps(
  projectRoots: string[] = [],
): McpDiscoveryResult {
  const sources: McpDiscoveryResult["sources"] = [];
  const allMcps: DiscoveredMcp[] = [];
  const seenIds = new Set<string>();

  // 1. Discover from Claude Desktop
  const claudeDesktop = discoverClaudeDesktop();
  sources.push({
    name: "Claude Desktop",
    type: "claude-desktop",
    path: claudeDesktop.path,
    mcpCount: claudeDesktop.mcps.length,
    status: claudeDesktop.status,
    error: claudeDesktop.error,
  });
  for (const mcp of claudeDesktop.mcps) {
    if (!seenIds.has(mcp.id)) {
      seenIds.add(mcp.id);
      allMcps.push(mcp);
    }
  }

  // 2. Discover from project roots
  for (const root of projectRoots) {
    // Claude project config
    const claudeProject = discoverClaudeProject(root);
    if (claudeProject.status !== "not_found") {
      sources.push({
        name: `Claude Project (${root})`,
        type: "claude-project",
        path: claudeProject.path,
        mcpCount: claudeProject.mcps.length,
        status: claudeProject.status,
        error: claudeProject.error,
      });
      for (const mcp of claudeProject.mcps) {
        if (!seenIds.has(mcp.id)) {
          seenIds.add(mcp.id);
          allMcps.push(mcp);
        }
      }
    }

    // .mcp.json
    const mcpJson = discoverMcpJson(root);
    if (mcpJson.status !== "not_found") {
      sources.push({
        name: `.mcp.json (${root})`,
        type: "mcp-json",
        path: mcpJson.path,
        mcpCount: mcpJson.mcps.length,
        status: mcpJson.status,
        error: mcpJson.error,
      });
      for (const mcp of mcpJson.mcps) {
        if (!seenIds.has(mcp.id)) {
          seenIds.add(mcp.id);
          allMcps.push(mcp);
        }
      }
    }
  }

  return {
    discovered: allMcps,
    sources,
    timestamp: new Date().toISOString(),
  };
}

// Get MCP by ID from discovery results
export function getDiscoveredMcpById(
  result: McpDiscoveryResult,
  id: string,
): DiscoveredMcp | undefined {
  return result.discovered.find((mcp) => mcp.id === id);
}

// Filter discovered MCPs by source type
export function filterBySourceType(
  result: McpDiscoveryResult,
  type: McpSource["type"],
): DiscoveredMcp[] {
  return result.discovered.filter((mcp) => mcp.source.type === type);
}
