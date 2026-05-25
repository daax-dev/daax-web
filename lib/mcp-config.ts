// MCP Config - REAL integration with Claude Code config files
// This actually reads/writes ~/.claude.json to control MCPs
//
// Environment variables for Docker/container deployments:
// - CLAUDE_CODE_CONFIG: Override path to ~/.claude.json (default: ~/.claude.json)
// - CLAUDE_DESKTOP_CONFIG: Override path to Claude Desktop config
// - HOME_MCP_JSON: Override path to ~/.mcp.json

import { readFileSync, writeFileSync, existsSync } from "fs";
import { readdir, stat, access, constants } from "fs/promises";
import { join } from "path";
import { homedir } from "os";

/**
 * Async file existence check using fs/promises.
 * Returns true if file exists and is accessible, false otherwise.
 */
async function fileExistsAsync(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

// Config path getters - computed at REQUEST time, not module load time
// This ensures environment variables set in Docker are properly read
// Exported for testing purposes
export function getClaudeCodeConfigPath(): string {
  return process.env.CLAUDE_CODE_CONFIG || join(homedir(), ".claude.json");
}

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

export function getHomeMcpJsonPath(): string {
  return process.env.HOME_MCP_JSON || join(homedir(), ".mcp.json");
}

// Workspace scan cache to avoid repeated filesystem operations
// Cache TTL: 5 minutes (300000ms)
const WORKSPACE_SCAN_CACHE_TTL = 300000;
interface WorkspaceScanCache {
  result: Array<{ dirPath: string; mcpJsonPath: string }>;
  timestamp: number;
}
let workspaceScanCache: WorkspaceScanCache | null = null;
let backgroundScanPromise: Promise<void> | null = null;

/**
 * Async workspace scanner that populates the cache in the background.
 * Uses async fs operations to avoid blocking the event loop.
 */
async function scanWorkspaceAsync(
  workspacePath: string,
): Promise<Array<{ dirPath: string; mcpJsonPath: string }>> {
  const results: Array<{ dirPath: string; mcpJsonPath: string }> = [];

  const scanForMcpJson = async (dirPath: string) => {
    const mcpJsonPath = join(dirPath, ".mcp.json");
    // Use async access check to avoid blocking on slow filesystems
    if (await fileExistsAsync(mcpJsonPath)) {
      try {
        const fileStat = await stat(mcpJsonPath);
        if (fileStat.isFile()) {
          results.push({ dirPath, mcpJsonPath });
        }
      } catch {
        /* skip */
      }
    }
  };

  try {
    // Scan up to 3 levels: /workspace/*, /workspace/*/* , /workspace/*/*/*
    const level1 = await readdir(workspacePath);
    for (const l1 of level1) {
      if (l1.startsWith(".")) continue; // Skip hidden dirs at top level
      const l1Path = join(workspacePath, l1);
      try {
        const l1Stat = await stat(l1Path);
        if (!l1Stat.isDirectory()) continue;
        await scanForMcpJson(l1Path);

        // Level 2
        const level2 = await readdir(l1Path);
        for (const l2 of level2) {
          if (l2.startsWith(".") && l2 !== ".mcp.json") continue;
          const l2Path = join(l1Path, l2);
          try {
            const l2Stat = await stat(l2Path);
            if (!l2Stat.isDirectory()) continue;
            await scanForMcpJson(l2Path);

            // Level 3
            const level3 = await readdir(l2Path);
            for (const l3 of level3) {
              if (l3.startsWith(".") && l3 !== ".mcp.json") continue;
              const l3Path = join(l2Path, l3);
              try {
                const l3Stat = await stat(l3Path);
                if (l3Stat.isDirectory()) {
                  await scanForMcpJson(l3Path);
                }
              } catch {
                /* skip */
              }
            }
          } catch {
            /* skip */
          }
        }
      } catch {
        /* skip */
      }
    }
  } catch {
    // /workspace not readable, skip
  }

  return results;
}

/**
 * Trigger background workspace scan if cache is stale.
 * This populates the cache asynchronously for subsequent sync reads.
 */
function triggerBackgroundScan(workspacePath: string): void {
  if (backgroundScanPromise) return; // Already scanning

  backgroundScanPromise = scanWorkspaceAsync(workspacePath)
    .then((result) => {
      workspaceScanCache = { result, timestamp: Date.now() };
    })
    .catch((err) => {
      console.warn("[mcp-config] Background workspace scan failed:", err);
    })
    .finally(() => {
      backgroundScanPromise = null;
    });
}

// IMPORTANT: Always use the getter functions below, not hardcoded paths!

// Real MCP server definition from Claude configs
export interface McpServerConfig {
  type?: "stdio" | "http";
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
}

// Project-specific MCP settings from ~/.claude.json
export interface ProjectMcpSettings {
  mcpServers: Record<string, McpServerConfig>;
  disabledMcpServers: string[];
  enabledMcpjsonServers: string[];
  disabledMcpjsonServers: string[];
}

// Transport and security analysis
export interface McpSecurityInfo {
  transport: "local" | "remote"; // stdio = local, http = remote
  authType: "none" | "api_key" | "bearer" | "oauth" | "unknown";
  authEnvVars: string[]; // Which env vars contain auth (e.g., ["API_KEY", "GITHUB_TOKEN"])
  isOfficialMcp: boolean; // From @modelcontextprotocol or @anthropic
  riskLevel: "low" | "medium" | "high"; // Based on transport + auth + source
  riskReasons: string[];
}

// All discovered MCPs across all sources
export interface DiscoveredMcp {
  id: string;
  name: string;
  source:
    | "claude-code-global"
    | "claude-desktop"
    | "claude-code-project"
    | "mcp-json"
    | "active";
  sourcePath?: string;
  config?: McpServerConfig;
  isEnabled: boolean;
  isDisabledInProject: boolean;
  security: McpSecurityInfo;
}

// Diagnostic info for troubleshooting empty MCP page
export interface McpDiagnostics {
  // Paths being checked (resolved from env vars or defaults)
  configPaths: {
    claudeCodeConfig: { path: string; exists: boolean; fromEnvVar: boolean };
    claudeDesktopConfig: { path: string; exists: boolean; fromEnvVar: boolean };
    homeMcpJson: { path: string; exists: boolean; fromEnvVar: boolean };
  };
  // Whether running in container (affects path resolution)
  isContainerMode: boolean;
  // Helpful hints for troubleshooting
  hints: string[];
}

// Full config state
export interface McpConfigState {
  // All discovered MCPs
  mcps: DiscoveredMcp[];

  // Current project path
  currentProject: string | null;

  // Project-specific disabled list
  disabledInProject: string[];

  // Sources checked
  sources: {
    claudeCodeGlobal: { found: boolean; mcpCount: number };
    claudeDesktop: { found: boolean; mcpCount: number };
    claudeCodeProject: { found: boolean; projectCount: number };
    homeMcpJson: { found: boolean; path?: string };
    projectMcpJson: { found: boolean; path?: string };
  };

  // Diagnostic info for troubleshooting
  diagnostics?: McpDiagnostics;
}

// Get diagnostic info for troubleshooting empty MCP page
export function getMcpDiagnostics(): McpDiagnostics {
  // Get paths at request time (not module load time)
  const claudeCodeConfig = getClaudeCodeConfigPath();
  const claudeDesktopConfig = getClaudeDesktopConfigPath();
  const homeMcpJson = getHomeMcpJsonPath();

  // Better container detection: check if home is /root (typical for containers)
  // or if the /host-config directory exists (our mount point)
  const homeDir = homedir();
  const isLikelyContainer =
    homeDir === "/root" ||
    existsSync("/host-config") ||
    !!process.env.CLAUDE_CODE_CONFIG ||
    !!process.env.HOME_MCP_JSON;

  const hints: string[] = [];

  const claudeCodeConfigExists = existsSync(claudeCodeConfig);
  const claudeDesktopConfigExists = existsSync(claudeDesktopConfig);
  const homeMcpJsonExists = existsSync(homeMcpJson);

  // Check if /host-config has the expected files (proper container setup)
  const hostConfigClaudeExists = existsSync("/host-config/.claude.json");
  const hostConfigMcpExists = existsSync("/host-config/.mcp.json");

  // Generate helpful hints based on what's missing
  if (isLikelyContainer) {
    // Running in container - check for proper env var setup
    if (!process.env.CLAUDE_CODE_CONFIG && !process.env.HOME_MCP_JSON) {
      hints.push("⚠️ Running in container but MCP config env vars not set!");
      hints.push(
        "Add to docker-compose.yml environment section:\n" +
          "  - CLAUDE_CODE_CONFIG=/host-config/.claude.json\n" +
          "  - HOME_MCP_JSON=/host-config/.mcp.json",
      );
    }

    if (hostConfigClaudeExists && !process.env.CLAUDE_CODE_CONFIG) {
      hints.push(
        "Found /host-config/.claude.json but CLAUDE_CODE_CONFIG env var not set. " +
          "Set CLAUDE_CODE_CONFIG=/host-config/.claude.json in container environment.",
      );
    }

    if (!hostConfigClaudeExists && !hostConfigMcpExists) {
      hints.push(
        "No config files found at /host-config/. Mount your host configs:\n" +
          "  volumes:\n" +
          "    - ${CLAUDE_CONFIG_PATH}:/host-config/.claude.json:rw\n" +
          "    - ${HOME_MCP_PATH}:/host-config/.mcp.json:ro\n" +
          'Then set: export CLAUDE_CONFIG_PATH="$HOME/.claude.json"',
      );
    }

    if (process.env.CLAUDE_CODE_CONFIG && !claudeCodeConfigExists) {
      hints.push(
        `CLAUDE_CODE_CONFIG="${process.env.CLAUDE_CODE_CONFIG}" but file not found. ` +
          "Check volume mount in docker-compose.yml",
      );
    }
  } else {
    // Not in container - check for local config
    if (
      !claudeCodeConfigExists &&
      !claudeDesktopConfigExists &&
      !homeMcpJsonExists
    ) {
      hints.push(
        "No MCP config files found. Run Claude Code once to generate ~/.claude.json",
      );
    }
  }

  return {
    configPaths: {
      claudeCodeConfig: {
        path: claudeCodeConfig,
        exists: claudeCodeConfigExists,
        fromEnvVar: !!process.env.CLAUDE_CODE_CONFIG,
      },
      claudeDesktopConfig: {
        path: claudeDesktopConfig,
        exists: claudeDesktopConfigExists,
        fromEnvVar: !!process.env.CLAUDE_DESKTOP_CONFIG,
      },
      homeMcpJson: {
        path: homeMcpJson,
        exists: homeMcpJsonExists,
        fromEnvVar: !!process.env.HOME_MCP_JSON,
      },
    },
    isContainerMode: isLikelyContainer,
    hints,
  };
}

// Read Claude Code config (~/.claude.json)
export function readClaudeCodeConfig(): Record<string, unknown> | null {
  if (!existsSync(getClaudeCodeConfigPath())) return null;

  try {
    const content = readFileSync(getClaudeCodeConfigPath(), "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

// Read Claude Desktop config
export function readClaudeDesktopConfig(): Record<
  string,
  McpServerConfig
> | null {
  if (!existsSync(getClaudeDesktopConfigPath())) return null;

  try {
    const content = readFileSync(getClaudeDesktopConfigPath(), "utf-8");
    const config = JSON.parse(content);
    return config.mcpServers || null;
  } catch {
    return null;
  }
}

// Get project settings from Claude Code config
export function getProjectSettings(
  projectPath: string,
): ProjectMcpSettings | null {
  const config = readClaudeCodeConfig();
  if (!config?.projects) return null;

  const projects = config.projects as Record<string, unknown>;
  const project = projects[projectPath] as Record<string, unknown> | undefined;

  if (!project) return null;

  return {
    mcpServers: (project.mcpServers as Record<string, McpServerConfig>) || {},
    disabledMcpServers: (project.disabledMcpServers as string[]) || [],
    enabledMcpjsonServers: (project.enabledMcpjsonServers as string[]) || [],
    disabledMcpjsonServers: (project.disabledMcpjsonServers as string[]) || [],
  };
}

// Update disabled MCPs for a project - THIS IS THE KEY FUNCTION
export function setDisabledMcps(
  projectPath: string,
  disabledIds: string[],
): boolean {
  const config = readClaudeCodeConfig();
  if (!config) return false;

  try {
    // Ensure projects object exists
    if (!config.projects) {
      config.projects = {};
    }

    const projects = config.projects as Record<string, Record<string, unknown>>;

    // Ensure project entry exists
    if (!projects[projectPath]) {
      projects[projectPath] = {
        allowedTools: [],
        mcpContextUris: [],
        mcpServers: {},
        enabledMcpjsonServers: [],
        disabledMcpjsonServers: [],
        hasTrustDialogAccepted: false,
        ignorePatterns: [],
      };
    }

    // Update the disabled list
    projects[projectPath].disabledMcpServers = disabledIds;

    // Write back
    writeFileSync(getClaudeCodeConfigPath(), JSON.stringify(config, null, 2));
    return true;
  } catch (err) {
    console.error("Failed to update Claude Code config:", err);
    return false;
  }
}

// Add an MCP to the disabled list
export function disableMcp(projectPath: string, mcpId: string): boolean {
  const settings = getProjectSettings(projectPath);
  const currentDisabled = settings?.disabledMcpServers || [];

  if (currentDisabled.includes(mcpId)) return true; // Already disabled

  return setDisabledMcps(projectPath, [...currentDisabled, mcpId]);
}

// Remove an MCP from the disabled list (enable it)
export function enableMcp(projectPath: string, mcpId: string): boolean {
  const settings = getProjectSettings(projectPath);
  const currentDisabled = settings?.disabledMcpServers || [];

  if (!currentDisabled.includes(mcpId)) return true; // Already enabled

  return setDisabledMcps(
    projectPath,
    currentDisabled.filter((id) => id !== mcpId),
  );
}

// Discover ALL MCPs from all sources
export function discoverAllMcps(currentProjectPath: string): McpConfigState {
  const mcps: DiscoveredMcp[] = [];
  const seenIds = new Set<string>();

  const sources = {
    claudeCodeGlobal: { found: false, mcpCount: 0 },
    claudeDesktop: { found: false, mcpCount: 0 },
    claudeCodeProject: { found: false, projectCount: 0 },
    homeMcpJson: { found: false, path: undefined as string | undefined },
    projectMcpJson: { found: false, path: undefined as string | undefined },
  };

  // Get project settings to know what's disabled
  const projectSettings = getProjectSettings(currentProjectPath);
  const disabledInProject = projectSettings?.disabledMcpServers || [];

  // 1. Global MCPs from ~/.claude.json root level mcpServers (PRIMARY SOURCE)
  const ccConfig = readClaudeCodeConfig();
  if (ccConfig?.mcpServers) {
    const globalMcps = ccConfig.mcpServers as Record<string, McpServerConfig>;
    sources.claudeCodeGlobal.found = true;
    sources.claudeCodeGlobal.mcpCount = Object.keys(globalMcps).length;

    for (const [id, config] of Object.entries(globalMcps)) {
      if (!seenIds.has(id)) {
        seenIds.add(id);
        mcps.push({
          id,
          name: formatMcpName(id),
          source: "claude-code-global" as const,
          sourcePath: getClaudeCodeConfigPath(),
          config,
          isEnabled: !disabledInProject.includes(id),
          isDisabledInProject: disabledInProject.includes(id),
          security: analyzeMcpSecurity(id, config),
        });
      }
    }
  }

  // 2. Claude Desktop MCPs (secondary global source)
  const desktopMcps = readClaudeDesktopConfig();
  if (desktopMcps) {
    sources.claudeDesktop.found = true;
    sources.claudeDesktop.mcpCount = Object.keys(desktopMcps).length;

    for (const [id, config] of Object.entries(desktopMcps)) {
      if (!seenIds.has(id)) {
        seenIds.add(id);
        mcps.push({
          id,
          name: formatMcpName(id),
          source: "claude-desktop",
          sourcePath: getClaudeDesktopConfigPath(),
          config,
          isEnabled: !disabledInProject.includes(id),
          isDisabledInProject: disabledInProject.includes(id),
          security: analyzeMcpSecurity(id, config),
        });
      }
    }
  }

  // 3. Home-level ~/.mcp.json
  if (existsSync(getHomeMcpJsonPath())) {
    sources.homeMcpJson.found = true;
    sources.homeMcpJson.path = getHomeMcpJsonPath();

    try {
      const content = readFileSync(getHomeMcpJsonPath(), "utf-8");
      const mcpJson = JSON.parse(content);
      const servers = mcpJson.mcpServers || mcpJson.servers || {};

      for (const [id, config] of Object.entries(servers)) {
        if (!seenIds.has(id)) {
          seenIds.add(id);
          mcps.push({
            id,
            name: formatMcpName(id),
            source: "mcp-json",
            sourcePath: getHomeMcpJsonPath(),
            config: config as McpServerConfig,
            isEnabled: !disabledInProject.includes(id),
            isDisabledInProject: disabledInProject.includes(id),
            security: analyzeMcpSecurity(id, config as McpServerConfig),
          });
        }
      }
    } catch {
      // Invalid JSON, skip
    }
  }

  // 4. Claude Code project-specific MCPs
  if (ccConfig?.projects) {
    sources.claudeCodeProject.found = true;
    const projects = ccConfig.projects as Record<
      string,
      Record<string, unknown>
    >;
    sources.claudeCodeProject.projectCount = Object.keys(projects).length;

    // MCPs from current project
    if (projectSettings?.mcpServers) {
      for (const [id, config] of Object.entries(projectSettings.mcpServers)) {
        if (!seenIds.has(id)) {
          seenIds.add(id);
          mcps.push({
            id,
            name: formatMcpName(id),
            source: "claude-code-project",
            sourcePath: currentProjectPath,
            config,
            isEnabled: !disabledInProject.includes(id),
            isDisabledInProject: disabledInProject.includes(id),
            security: analyzeMcpSecurity(id, config),
          });
        }
      }
    }
  }

  // 5. Project-level .mcp.json files (check current project and parent)
  const mcpJsonPaths = [
    join(currentProjectPath, ".mcp.json"),
    join(currentProjectPath, "..", ".mcp.json"),
  ];

  for (const mcpJsonPath of mcpJsonPaths) {
    if (existsSync(mcpJsonPath) && mcpJsonPath !== getHomeMcpJsonPath()) {
      sources.projectMcpJson.found = true;
      sources.projectMcpJson.path = mcpJsonPath;

      try {
        const content = readFileSync(mcpJsonPath, "utf-8");
        const mcpJson = JSON.parse(content);
        const servers = mcpJson.mcpServers || mcpJson.servers || {};

        for (const [id, config] of Object.entries(servers)) {
          if (!seenIds.has(id)) {
            seenIds.add(id);
            mcps.push({
              id,
              name: formatMcpName(id),
              source: "mcp-json",
              sourcePath: mcpJsonPath,
              config: config as McpServerConfig,
              isEnabled: !disabledInProject.includes(id),
              isDisabledInProject: disabledInProject.includes(id),
              security: analyzeMcpSecurity(id, config as McpServerConfig),
            });
          }
        }
      } catch {
        // Invalid JSON, skip
      }
      break; // Only use first found
    }
  }

  // 6. Container mode: Scan /workspace for .mcp.json files (up to 3 levels deep)
  // This handles Docker deployments where projects are mounted at /workspace
  // Uses caching with background async scan to avoid blocking on slow filesystems
  // (e.g., network-mounted volumes). Initial request uses stale cache or empty results,
  // while background scan populates cache for subsequent requests.
  const workspacePath = "/workspace";
  const isContainerMode =
    existsSync(workspacePath) &&
    (existsSync("/host-config") ||
      !!process.env.CLAUDE_CODE_CONFIG ||
      !!process.env.HOME_MCP_JSON);
  if (isContainerMode) {
    // Check cache first
    const now = Date.now();
    let cachedPaths: Array<{ dirPath: string; mcpJsonPath: string }>;

    if (
      workspaceScanCache &&
      now - workspaceScanCache.timestamp < WORKSPACE_SCAN_CACHE_TTL
    ) {
      // Use cached scan results
      cachedPaths = workspaceScanCache.result;
    } else {
      // Cache is stale or empty - trigger background async scan
      // Use stale cache if available, otherwise return empty for this request
      // Background scan will populate cache for subsequent requests
      triggerBackgroundScan(workspacePath);
      cachedPaths = workspaceScanCache?.result || [];
    }

    // Process cached paths to load MCPs
    for (const { mcpJsonPath } of cachedPaths) {
      try {
        const content = readFileSync(mcpJsonPath, "utf-8");
        const mcpJson = JSON.parse(content);
        const servers = mcpJson.mcpServers || mcpJson.servers || {};

        for (const [id, config] of Object.entries(servers)) {
          if (!seenIds.has(id)) {
            seenIds.add(id);
            mcps.push({
              id,
              name: formatMcpName(id),
              source: "mcp-json",
              sourcePath: mcpJsonPath,
              config: config as McpServerConfig,
              isEnabled: !disabledInProject.includes(id),
              isDisabledInProject: disabledInProject.includes(id),
              security: analyzeMcpSecurity(id, config as McpServerConfig),
            });
          }
        }

        if (!sources.projectMcpJson.found) {
          sources.projectMcpJson.found = true;
          sources.projectMcpJson.path = mcpJsonPath;
        }
      } catch {
        // Invalid JSON or can't read, skip
      }
    }
  }

  // Include diagnostics when no MCPs found to help troubleshoot
  const diagnostics = mcps.length === 0 ? getMcpDiagnostics() : undefined;

  return {
    mcps,
    currentProject: currentProjectPath,
    disabledInProject,
    sources,
    diagnostics,
  };
}

// Analyze MCP security characteristics
function analyzeMcpSecurity(
  id: string,
  config?: McpServerConfig,
): McpSecurityInfo {
  const security: McpSecurityInfo = {
    transport: "local",
    authType: "none",
    authEnvVars: [],
    isOfficialMcp: false,
    riskLevel: "low",
    riskReasons: [],
  };

  if (!config) {
    security.riskLevel = "medium";
    security.riskReasons.push("No config available for analysis");
    return security;
  }

  // Determine transport type
  if (config.type === "http" || config.url) {
    security.transport = "remote";
    security.riskReasons.push("Remote MCP (HTTP transport)");
  }

  // Check for official MCPs
  const args = config.args?.join(" ") || "";
  const command = config.command || "";
  const fullCommand = `${command} ${args}`.toLowerCase();

  if (
    fullCommand.includes("@modelcontextprotocol/") ||
    fullCommand.includes("@anthropic/") ||
    fullCommand.includes("@playwright/")
  ) {
    security.isOfficialMcp = true;
  }

  // Detect auth from env vars
  const authPatterns = [
    { pattern: /api[_-]?key/i, type: "api_key" as const },
    { pattern: /token/i, type: "bearer" as const },
    { pattern: /bearer/i, type: "bearer" as const },
    { pattern: /secret/i, type: "api_key" as const },
    { pattern: /password/i, type: "api_key" as const },
    { pattern: /oauth/i, type: "oauth" as const },
    { pattern: /client[_-]?id/i, type: "oauth" as const },
  ];

  if (config.env) {
    for (const [key, value] of Object.entries(config.env)) {
      for (const { pattern, type } of authPatterns) {
        if (pattern.test(key)) {
          security.authEnvVars.push(key);
          if (security.authType === "none") {
            security.authType = type;
          }
          break;
        }
      }
      // Check if value looks like a token/key (but don't expose it)
      // The 20-character threshold is chosen because:
      // - Most API keys/tokens are at least 20 characters (e.g., GitHub tokens are 40+, AWS keys are 20+)
      // - Short values are more likely to be non-sensitive identifiers or flags
      // - Combined with the alphanumeric pattern, this reduces false positives while catching most real tokens
      if (
        value &&
        typeof value === "string" &&
        value.length > 20 &&
        /^[A-Za-z0-9_-]+$/.test(value)
      ) {
        if (!security.authEnvVars.includes(key)) {
          security.authEnvVars.push(key);
          if (security.authType === "none") {
            security.authType = "unknown";
          }
        }
      }
    }
  }

  // Calculate risk level
  let riskScore = 0;

  if (security.transport === "remote") {
    riskScore += 2;
  }

  if (!security.isOfficialMcp) {
    riskScore += 1;
    security.riskReasons.push("Non-official MCP source");
  }

  if (security.authType !== "none" && security.authEnvVars.length > 0) {
    riskScore += 1;
    security.riskReasons.push(`Uses auth: ${security.authEnvVars.join(", ")}`);
  }

  // Check for potentially risky commands
  if (command === "bash" || command === "sh" || command.includes("eval")) {
    riskScore += 2;
    security.riskReasons.push("Executes shell commands");
  }

  if (riskScore === 0) {
    security.riskLevel = "low";
  } else if (riskScore <= 2) {
    security.riskLevel = "medium";
  } else {
    security.riskLevel = "high";
  }

  return security;
}

// Format MCP ID to friendly name
function formatMcpName(id: string): string {
  return id
    .replace(/-/g, " ")
    .replace(/_/g, " ")
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// Get count of enabled vs disabled
export function getMcpCounts(projectPath: string): {
  total: number;
  enabled: number;
  disabled: number;
} {
  const state = discoverAllMcps(projectPath);
  const enabled = state.mcps.filter((m) => m.isEnabled).length;
  return {
    total: state.mcps.length,
    enabled,
    disabled: state.mcps.length - enabled,
  };
}

// Estimate context token savings
export function estimateTokenSavings(projectPath: string): {
  totalMcps: number;
  enabledMcps: number;
  estimatedTokensPerMcp: number;
  estimatedSavings: number;
  savingsPercent: number;
} {
  const counts = getMcpCounts(projectPath);
  const TOKENS_PER_MCP = 500; // Rough estimate: each MCP adds ~500 tokens to context

  return {
    totalMcps: counts.total,
    enabledMcps: counts.enabled,
    estimatedTokensPerMcp: TOKENS_PER_MCP,
    estimatedSavings: counts.disabled * TOKENS_PER_MCP,
    savingsPercent:
      counts.total > 0 ? Math.round((counts.disabled / counts.total) * 100) : 0,
  };
}

// ============================================================================
// CRUD Operations for MCP Servers
// ============================================================================

/**
 * Add a new MCP server to the config
 * @param id - MCP identifier (e.g., "my-mcp")
 * @param config - MCP server configuration
 * @param scope - "global" for ~/.claude.json root mcpServers, "project" for project-specific
 * @param projectPath - Required if scope is "project"
 */
export function addMcpServer(
  id: string,
  config: McpServerConfig,
  scope: "global" | "project",
  projectPath?: string,
): { success: boolean; error?: string } {
  const claudeConfig = readClaudeCodeConfig();
  if (!claudeConfig) {
    return { success: false, error: "Could not read ~/.claude.json" };
  }

  try {
    if (scope === "global") {
      // Add to root mcpServers
      if (!claudeConfig.mcpServers) {
        claudeConfig.mcpServers = {};
      }
      const mcpServers = claudeConfig.mcpServers as Record<
        string,
        McpServerConfig
      >;

      if (mcpServers[id]) {
        return {
          success: false,
          error: `MCP "${id}" already exists in global config`,
        };
      }

      mcpServers[id] = config;
    } else {
      // Add to project-specific mcpServers
      if (!projectPath) {
        return {
          success: false,
          error: "projectPath required for project scope",
        };
      }

      if (!claudeConfig.projects) {
        claudeConfig.projects = {};
      }

      const projects = claudeConfig.projects as Record<
        string,
        Record<string, unknown>
      >;

      if (!projects[projectPath]) {
        projects[projectPath] = {
          allowedTools: [],
          mcpContextUris: [],
          mcpServers: {},
          enabledMcpjsonServers: [],
          disabledMcpjsonServers: [],
          disabledMcpServers: [],
          hasTrustDialogAccepted: false,
          ignorePatterns: [],
        };
      }

      if (!projects[projectPath].mcpServers) {
        projects[projectPath].mcpServers = {};
      }

      const projectMcps = projects[projectPath].mcpServers as Record<
        string,
        McpServerConfig
      >;

      if (projectMcps[id]) {
        return {
          success: false,
          error: `MCP "${id}" already exists in project config`,
        };
      }

      projectMcps[id] = config;
    }

    writeFileSync(
      getClaudeCodeConfigPath(),
      JSON.stringify(claudeConfig, null, 2),
    );
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: `Failed to add MCP: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Update an existing MCP server config
 * @param id - MCP identifier
 * @param config - New MCP server configuration
 * @param sourcePath - Path to the source file containing this MCP
 */
export function updateMcpServer(
  id: string,
  config: McpServerConfig,
  sourcePath: string,
): { success: boolean; error?: string } {
  // Determine which config file to update based on sourcePath
  if (
    sourcePath === getClaudeCodeConfigPath() ||
    sourcePath.includes(".claude.json")
  ) {
    const claudeConfig = readClaudeCodeConfig();
    if (!claudeConfig) {
      return { success: false, error: "Could not read ~/.claude.json" };
    }

    try {
      // Check global mcpServers first
      if (claudeConfig.mcpServers) {
        const globalMcps = claudeConfig.mcpServers as Record<
          string,
          McpServerConfig
        >;
        if (globalMcps[id]) {
          globalMcps[id] = config;
          writeFileSync(
            getClaudeCodeConfigPath(),
            JSON.stringify(claudeConfig, null, 2),
          );
          return { success: true };
        }
      }

      // Check project mcpServers
      if (claudeConfig.projects) {
        const projects = claudeConfig.projects as Record<
          string,
          Record<string, unknown>
        >;
        for (const projectConfig of Object.values(projects)) {
          const projectMcps = projectConfig.mcpServers as
            | Record<string, McpServerConfig>
            | undefined;
          if (projectMcps && projectMcps[id]) {
            projectMcps[id] = config;
            writeFileSync(
              getClaudeCodeConfigPath(),
              JSON.stringify(claudeConfig, null, 2),
            );
            return { success: true };
          }
        }
      }

      return {
        success: false,
        error: `MCP "${id}" not found in ~/.claude.json`,
      };
    } catch (err) {
      return {
        success: false,
        error: `Failed to update MCP: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  } else if (sourcePath === getClaudeDesktopConfigPath()) {
    // Update Claude Desktop config
    if (!existsSync(getClaudeDesktopConfigPath())) {
      return { success: false, error: "Claude Desktop config not found" };
    }

    try {
      const content = readFileSync(getClaudeDesktopConfigPath(), "utf-8");
      const desktopConfig = JSON.parse(content);

      if (!desktopConfig.mcpServers || !desktopConfig.mcpServers[id]) {
        return {
          success: false,
          error: `MCP "${id}" not found in Claude Desktop config`,
        };
      }

      desktopConfig.mcpServers[id] = config;
      writeFileSync(
        getClaudeDesktopConfigPath(),
        JSON.stringify(desktopConfig, null, 2),
      );
      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: `Failed to update Claude Desktop config: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  } else if (sourcePath.endsWith(".mcp.json")) {
    // Update .mcp.json file
    if (!existsSync(sourcePath)) {
      return { success: false, error: `File not found: ${sourcePath}` };
    }

    try {
      const content = readFileSync(sourcePath, "utf-8");
      const mcpJson = JSON.parse(content);
      const servers = mcpJson.mcpServers || mcpJson.servers || {};

      if (!servers[id]) {
        return {
          success: false,
          error: `MCP "${id}" not found in ${sourcePath}`,
        };
      }

      servers[id] = config;

      // Preserve original key name (mcpServers vs servers)
      if (mcpJson.mcpServers) {
        mcpJson.mcpServers = servers;
      } else {
        mcpJson.servers = servers;
      }

      writeFileSync(sourcePath, JSON.stringify(mcpJson, null, 2));
      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: `Failed to update ${sourcePath}: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  return { success: false, error: `Unknown source path: ${sourcePath}` };
}

/**
 * Delete an MCP server from the config
 * @param id - MCP identifier
 * @param sourcePath - Path to the source file containing this MCP
 */
export function deleteMcpServer(
  id: string,
  sourcePath: string,
): { success: boolean; error?: string } {
  // Determine which config file to update based on sourcePath
  if (
    sourcePath === getClaudeCodeConfigPath() ||
    sourcePath.includes(".claude.json")
  ) {
    const claudeConfig = readClaudeCodeConfig();
    if (!claudeConfig) {
      return { success: false, error: "Could not read ~/.claude.json" };
    }

    try {
      let deleted = false;

      // Check global mcpServers first
      if (claudeConfig.mcpServers) {
        const globalMcps = claudeConfig.mcpServers as Record<
          string,
          McpServerConfig
        >;
        if (globalMcps[id]) {
          delete globalMcps[id];
          deleted = true;
        }
      }

      // Check project mcpServers
      if (!deleted && claudeConfig.projects) {
        const projects = claudeConfig.projects as Record<
          string,
          Record<string, unknown>
        >;
        for (const [, projectConfig] of Object.entries(projects)) {
          const projectMcps = projectConfig.mcpServers as
            | Record<string, McpServerConfig>
            | undefined;
          if (projectMcps && projectMcps[id]) {
            delete projectMcps[id];
            deleted = true;
            break;
          }
        }
      }

      if (!deleted) {
        return {
          success: false,
          error: `MCP "${id}" not found in ~/.claude.json`,
        };
      }

      writeFileSync(
        getClaudeCodeConfigPath(),
        JSON.stringify(claudeConfig, null, 2),
      );
      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: `Failed to delete MCP: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  } else if (sourcePath === getClaudeDesktopConfigPath()) {
    // Delete from Claude Desktop config
    if (!existsSync(getClaudeDesktopConfigPath())) {
      return { success: false, error: "Claude Desktop config not found" };
    }

    try {
      const content = readFileSync(getClaudeDesktopConfigPath(), "utf-8");
      const desktopConfig = JSON.parse(content);

      if (!desktopConfig.mcpServers || !desktopConfig.mcpServers[id]) {
        return {
          success: false,
          error: `MCP "${id}" not found in Claude Desktop config`,
        };
      }

      delete desktopConfig.mcpServers[id];
      writeFileSync(
        getClaudeDesktopConfigPath(),
        JSON.stringify(desktopConfig, null, 2),
      );
      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: `Failed to delete from Claude Desktop config: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  } else if (sourcePath.endsWith(".mcp.json")) {
    // Delete from .mcp.json file
    if (!existsSync(sourcePath)) {
      return { success: false, error: `File not found: ${sourcePath}` };
    }

    try {
      const content = readFileSync(sourcePath, "utf-8");
      const mcpJson = JSON.parse(content);
      const serversKey = mcpJson.mcpServers ? "mcpServers" : "servers";
      const servers = mcpJson[serversKey] || {};

      if (!servers[id]) {
        return {
          success: false,
          error: `MCP "${id}" not found in ${sourcePath}`,
        };
      }

      delete servers[id];
      mcpJson[serversKey] = servers;

      writeFileSync(sourcePath, JSON.stringify(mcpJson, null, 2));
      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: `Failed to delete from ${sourcePath}: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  return { success: false, error: `Unknown source path: ${sourcePath}` };
}

/**
 * Get the path where a new MCP would be added based on scope
 */
export function getMcpConfigPath(
  scope: "global" | "project",
  projectPath?: string,
): string {
  return scope === "global"
    ? getClaudeCodeConfigPath()
    : projectPath || getClaudeCodeConfigPath();
}
