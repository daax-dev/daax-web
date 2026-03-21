/**
 * MCP Gateway Proxy - Core engine for proxying MCP calls
 *
 * This is the "true unloading" implementation:
 * - MCPs are removed from ~/.claude.json
 * - Gateway manages them in its own config
 * - Gateway spawns MCPs on-demand and proxies calls
 */

import { spawn, ChildProcess } from "child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import * as readline from "readline";

// ============================================================================
// PATHS
// ============================================================================

export const GATEWAY_DIR = join(homedir(), ".mcp-gateway");
export const GATEWAY_CONFIG = join(GATEWAY_DIR, "config.json");
export const GATEWAY_BACKUPS = join(GATEWAY_DIR, "backups");
export const CLAUDE_CODE_CONFIG = join(homedir(), ".claude.json");

// ============================================================================
// TYPES
// ============================================================================

export interface McpServerConfig {
  type?: "stdio" | "http";
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
}

export interface McpToolSchema {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface ManagedMcp {
  id: string;
  name: string;
  config: McpServerConfig;
  source: string; // Where it was adopted from
  adoptedAt: string;
  context: string; // git, testing, security, coding, ui, research, data, general
  lifecycle: "on-demand" | "keep-alive";
  toolCache?: McpToolSchema[];
  toolCacheUpdatedAt?: string;
  enabled: boolean;
}

export interface GatewayConfig {
  version: "1.0";
  managed: Record<string, ManagedMcp>;
  settings: {
    defaultLifecycle: "on-demand" | "keep-alive";
    cacheToolSchemas: boolean;
    toolCacheTtlMinutes: number;
  };
  lastUpdated: string;
}

export interface BackupManifest {
  timestamp: string;
  reason: string;
  files: {
    path: string;
    backupName: string;
  }[];
  restorationNotes: string;
}

// ============================================================================
// CONTEXT INFERENCE
// ============================================================================

export function inferContext(mcpId: string): string {
  const id = mcpId.toLowerCase();
  if (id.includes("github") || id.includes("git")) return "git";
  if (id.includes("playwright") || id.includes("test")) return "testing";
  if (id.includes("semgrep") || id.includes("security") || id.includes("trivy"))
    return "security";
  if (id.includes("serena") || id.includes("code")) return "coding";
  if (id.includes("shadcn") || id.includes("ui") || id.includes("figma"))
    return "ui";
  if (id.includes("sequential") || id.includes("think")) return "research";
  if (id.includes("sqlite") || id.includes("postgres") || id.includes("db"))
    return "data";
  return "general";
}

// ============================================================================
// CONFIG MANAGEMENT
// ============================================================================

export function ensureGatewayDir(): void {
  if (!existsSync(GATEWAY_DIR)) {
    mkdirSync(GATEWAY_DIR, { recursive: true });
  }
  if (!existsSync(GATEWAY_BACKUPS)) {
    mkdirSync(GATEWAY_BACKUPS, { recursive: true });
  }
}

export function readGatewayConfig(): GatewayConfig {
  ensureGatewayDir();

  if (!existsSync(GATEWAY_CONFIG)) {
    const defaultConfig: GatewayConfig = {
      version: "1.0",
      managed: {},
      settings: {
        defaultLifecycle: "on-demand",
        cacheToolSchemas: true,
        toolCacheTtlMinutes: 60,
      },
      lastUpdated: new Date().toISOString(),
    };
    writeFileSync(GATEWAY_CONFIG, JSON.stringify(defaultConfig, null, 2));
    return defaultConfig;
  }

  try {
    const content = readFileSync(GATEWAY_CONFIG, "utf-8");
    return JSON.parse(content) as GatewayConfig;
  } catch {
    throw new Error(`Failed to read gateway config: ${GATEWAY_CONFIG}`);
  }
}

export function writeGatewayConfig(config: GatewayConfig): void {
  ensureGatewayDir();
  config.lastUpdated = new Date().toISOString();
  writeFileSync(GATEWAY_CONFIG, JSON.stringify(config, null, 2));
}

// ============================================================================
// BACKUP SYSTEM
// ============================================================================

export function createBackup(reason: string): BackupManifest {
  ensureGatewayDir();

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = join(GATEWAY_BACKUPS, timestamp);
  mkdirSync(backupDir, { recursive: true });

  const files: BackupManifest["files"] = [];

  // Backup ~/.claude.json if exists
  if (existsSync(CLAUDE_CODE_CONFIG)) {
    const backupName = "claude.json";
    const content = readFileSync(CLAUDE_CODE_CONFIG, "utf-8");
    writeFileSync(join(backupDir, backupName), content);
    files.push({ path: CLAUDE_CODE_CONFIG, backupName });
  }

  // Backup gateway config if exists
  if (existsSync(GATEWAY_CONFIG)) {
    const backupName = "gateway-config.json";
    const content = readFileSync(GATEWAY_CONFIG, "utf-8");
    writeFileSync(join(backupDir, backupName), content);
    files.push({ path: GATEWAY_CONFIG, backupName });
  }

  const manifest: BackupManifest = {
    timestamp,
    reason,
    files,
    restorationNotes: generateRestorationNotes(files, reason),
  };

  // Write manifest
  writeFileSync(
    join(backupDir, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );

  // Write human-readable README
  writeFileSync(join(backupDir, "README.md"), generateBackupReadme(manifest));

  return manifest;
}

function generateRestorationNotes(
  files: BackupManifest["files"],
  reason: string,
): string {
  return `To restore this backup:
1. Stop Claude Code if running
2. Copy each backup file to its original location:
${files.map((f) => `   cp "${f.backupName}" "${f.path}"`).join("\n")}
3. Restart Claude Code

Reason for backup: ${reason}`;
}

function generateBackupReadme(manifest: BackupManifest): string {
  return `# MCP Gateway Backup

**Created**: ${manifest.timestamp}
**Reason**: ${manifest.reason}

## What's In This Backup

${manifest.files.map((f) => `- \`${f.backupName}\` → Original: \`${f.path}\``).join("\n")}

## How To Restore

\`\`\`bash
# Stop Claude Code first, then:
${manifest.files.map((f) => `cp "${f.backupName}" "${f.path}"`).join("\n")}
# Restart Claude Code
\`\`\`

## What Was About To Happen

${manifest.reason}

If something went wrong with the operation that triggered this backup,
restoring these files will return your MCP configuration to its previous state.

## Restoration Notes

${manifest.restorationNotes}
`;
}

// ============================================================================
// MCP ADOPTION
// ============================================================================

export interface AdoptionResult {
  adopted: string[];
  skipped: string[];
  errors: { id: string; error: string }[];
  backupPath: string;
}

/**
 * Adopt MCPs from ~/.claude.json into the gateway
 * This removes them from Claude Code's config and adds them to gateway management
 */
export async function adoptMcps(
  mcpIds?: string[], // If not provided, adopt all
): Promise<AdoptionResult> {
  // Create backup first
  const backup = createBackup(
    mcpIds
      ? `Adopting specific MCPs: ${mcpIds.join(", ")}`
      : "Adopting all MCPs into gateway management",
  );

  const result: AdoptionResult = {
    adopted: [],
    skipped: [],
    errors: [],
    backupPath: join(GATEWAY_BACKUPS, backup.timestamp),
  };

  // Read current configs
  const claudeConfig = readClaudeCodeConfig();
  if (!claudeConfig) {
    throw new Error("Cannot read ~/.claude.json");
  }

  const gatewayConfig = readGatewayConfig();
  const globalMcps = (claudeConfig.mcpServers || {}) as Record<
    string,
    McpServerConfig
  >;

  // Determine which MCPs to adopt
  const toAdopt = mcpIds || Object.keys(globalMcps);

  for (const mcpId of toAdopt) {
    // Skip the gateway itself
    if (mcpId === "gateway") {
      result.skipped.push(mcpId);
      continue;
    }

    // Skip if already managed
    if (gatewayConfig.managed[mcpId]) {
      result.skipped.push(mcpId);
      continue;
    }

    const config = globalMcps[mcpId];
    if (!config) {
      result.errors.push({
        id: mcpId,
        error: "MCP not found in ~/.claude.json",
      });
      continue;
    }

    // Add to gateway management
    gatewayConfig.managed[mcpId] = {
      id: mcpId,
      name: formatMcpName(mcpId),
      config,
      source: CLAUDE_CODE_CONFIG,
      adoptedAt: new Date().toISOString(),
      context: inferContext(mcpId),
      lifecycle: gatewayConfig.settings.defaultLifecycle,
      enabled: true,
    };

    // Remove from Claude Code global config
    delete globalMcps[mcpId];

    result.adopted.push(mcpId);
  }

  // Save updated configs
  claudeConfig.mcpServers = globalMcps;
  writeFileSync(CLAUDE_CODE_CONFIG, JSON.stringify(claudeConfig, null, 2));
  writeGatewayConfig(gatewayConfig);

  return result;
}

/**
 * Release an MCP back to Claude Code direct management
 */
export function releaseMcp(mcpId: string): {
  success: boolean;
  error?: string;
} {
  const backup = createBackup(`Releasing MCP: ${mcpId} back to Claude Code`);

  const gatewayConfig = readGatewayConfig();
  const managed = gatewayConfig.managed[mcpId];

  if (!managed) {
    return { success: false, error: `MCP ${mcpId} is not managed by gateway` };
  }

  // Read Claude Code config
  const claudeConfig = readClaudeCodeConfig();
  if (!claudeConfig) {
    return { success: false, error: "Cannot read ~/.claude.json" };
  }

  // Add back to Claude Code
  if (!claudeConfig.mcpServers) {
    claudeConfig.mcpServers = {};
  }
  (claudeConfig.mcpServers as Record<string, McpServerConfig>)[mcpId] =
    managed.config;

  // Remove from gateway
  delete gatewayConfig.managed[mcpId];

  // Save
  writeFileSync(CLAUDE_CODE_CONFIG, JSON.stringify(claudeConfig, null, 2));
  writeGatewayConfig(gatewayConfig);

  return { success: true };
}

// ============================================================================
// MCP SPAWNING & COMMUNICATION
// ============================================================================

interface McpConnection {
  process: ChildProcess;
  rl: readline.Interface;
  requestId: number;
  pendingRequests: Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
    }
  >;
}

// Active connections (for keep-alive mode)
const activeConnections = new Map<string, McpConnection>();

/**
 * Spawn an MCP process and establish JSON-RPC communication
 */
async function spawnMcp(
  mcpId: string,
  config: McpServerConfig,
): Promise<McpConnection> {
  if (!config.command) {
    throw new Error(`MCP ${mcpId} has no command configured`);
  }

  const proc = spawn(config.command, config.args || [], {
    env: { ...process.env, ...config.env },
    stdio: ["pipe", "pipe", "pipe"],
  });

  const connection: McpConnection = {
    process: proc,
    rl: readline.createInterface({ input: proc.stdout!, crlfDelay: Infinity }),
    requestId: 0,
    pendingRequests: new Map(),
  };

  // Handle responses
  connection.rl.on("line", (line) => {
    if (!line.trim()) return;
    try {
      const response = JSON.parse(line);
      const pending = connection.pendingRequests.get(response.id);
      if (pending) {
        connection.pendingRequests.delete(response.id);
        if (response.error) {
          pending.reject(new Error(response.error.message));
        } else {
          pending.resolve(response.result);
        }
      }
    } catch {
      // Ignore parse errors
    }
  });

  // Initialize the MCP
  await sendRequest(connection, "initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "mcp-gateway", version: "1.0.0" },
  });

  // Send initialized notification
  proc.stdin!.write(
    JSON.stringify({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    }) + "\n",
  );

  return connection;
}

async function sendRequest(
  connection: McpConnection,
  method: string,
  params?: Record<string, unknown>,
): Promise<unknown> {
  const id = ++connection.requestId;

  return new Promise((resolve, reject) => {
    connection.pendingRequests.set(id, { resolve, reject });

    const request = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    };

    connection.process.stdin!.write(JSON.stringify(request) + "\n");

    // Timeout after 30 seconds
    setTimeout(() => {
      if (connection.pendingRequests.has(id)) {
        connection.pendingRequests.delete(id);
        reject(new Error(`Request ${method} timed out`));
      }
    }, 30000);
  });
}

function closeMcpConnection(mcpId: string): void {
  const conn = activeConnections.get(mcpId);
  if (conn) {
    conn.rl.close();
    conn.process.kill();
    activeConnections.delete(mcpId);
  }
}

/**
 * Get or create a connection to an MCP
 */
async function getMcpConnection(mcpId: string): Promise<McpConnection> {
  const config = readGatewayConfig();
  const managed = config.managed[mcpId];

  if (!managed) {
    throw new Error(`MCP ${mcpId} is not managed by gateway`);
  }

  if (!managed.enabled) {
    throw new Error(`MCP ${mcpId} is disabled`);
  }

  // Check for existing connection (keep-alive mode)
  if (managed.lifecycle === "keep-alive") {
    const existing = activeConnections.get(mcpId);
    if (existing && !existing.process.killed) {
      return existing;
    }
  }

  // Spawn new connection
  const connection = await spawnMcp(mcpId, managed.config);

  if (managed.lifecycle === "keep-alive") {
    activeConnections.set(mcpId, connection);
  }

  return connection;
}

// ============================================================================
// TOOL DISCOVERY
// ============================================================================

/**
 * Get tools from an MCP (with caching)
 */
export async function getMcpTools(
  mcpId: string,
  forceRefresh = false,
): Promise<McpToolSchema[]> {
  const config = readGatewayConfig();
  const managed = config.managed[mcpId];

  if (!managed) {
    throw new Error(`MCP ${mcpId} is not managed by gateway`);
  }

  // Check cache
  if (!forceRefresh && managed.toolCache && managed.toolCacheUpdatedAt) {
    const cacheAge =
      Date.now() - new Date(managed.toolCacheUpdatedAt).getTime();
    const ttl = config.settings.toolCacheTtlMinutes * 60 * 1000;
    if (cacheAge < ttl) {
      return managed.toolCache;
    }
  }

  // Fetch tools from MCP
  const connection = await getMcpConnection(mcpId);
  const result = (await sendRequest(connection, "tools/list")) as {
    tools: McpToolSchema[];
  };

  // Close if on-demand
  if (managed.lifecycle === "on-demand") {
    closeMcpConnection(mcpId);
  }

  // Update cache
  managed.toolCache = result.tools;
  managed.toolCacheUpdatedAt = new Date().toISOString();
  writeGatewayConfig(config);

  return result.tools;
}

/**
 * Refresh tool cache for all managed MCPs
 */
export async function refreshAllToolCaches(): Promise<{
  success: string[];
  errors: { id: string; error: string }[];
}> {
  const config = readGatewayConfig();
  const result = {
    success: [] as string[],
    errors: [] as { id: string; error: string }[],
  };

  for (const mcpId of Object.keys(config.managed)) {
    try {
      await getMcpTools(mcpId, true);
      result.success.push(mcpId);
    } catch (err) {
      result.errors.push({
        id: mcpId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}

// ============================================================================
// PROXY CALL
// ============================================================================

export interface ProxyCallResult {
  success: boolean;
  result?: unknown;
  error?: string;
}

/**
 * Proxy a tool call to a managed MCP
 */
export async function proxyCall(
  mcpId: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<ProxyCallResult> {
  try {
    const connection = await getMcpConnection(mcpId);

    const result = await sendRequest(connection, "tools/call", {
      name: toolName,
      arguments: args,
    });

    // Close if on-demand
    const config = readGatewayConfig();
    if (config.managed[mcpId]?.lifecycle === "on-demand") {
      closeMcpConnection(mcpId);
    }

    return { success: true, result };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ============================================================================
// DYNAMIC TOOL DESCRIPTION
// ============================================================================

/**
 * Generate the dynamic description for gateway_call tool
 * This is what gets advertised to the model
 */
export function generateGatewayCallDescription(): string {
  const config = readGatewayConfig();
  const mcps = Object.values(config.managed).filter((m) => m.enabled);

  if (mcps.length === 0) {
    return "Proxy calls to managed MCP servers. No MCPs currently managed - use gateway_adopt to add MCPs.";
  }

  const lines = [
    "Proxy calls to managed MCP servers.",
    "",
    "Available MCPs and their tools:",
  ];

  for (const mcp of mcps) {
    const toolNames = mcp.toolCache?.map((t) => t.name).slice(0, 10) || [
      "(tools not cached)",
    ];
    const toolList = toolNames.join(", ");
    const suffix =
      (mcp.toolCache?.length || 0) > 10
        ? `, ... (+${mcp.toolCache!.length - 10} more)`
        : "";
    lines.push(`- ${mcp.id} [${mcp.context}]: ${toolList}${suffix}`);
  }

  lines.push("");
  lines.push(
    'Use: gateway_call(mcp="<mcp_id>", tool="<tool_name>", args={...})',
  );

  return lines.join("\n");
}

/**
 * Get full tool list for gateway_list_tools response
 */
export function getFullToolList(mcpId: string): McpToolSchema[] | null {
  const config = readGatewayConfig();
  const managed = config.managed[mcpId];
  return managed?.toolCache || null;
}

// ============================================================================
// HELPERS
// ============================================================================

function formatMcpName(id: string): string {
  return id
    .replace(/-/g, " ")
    .replace(/_/g, " ")
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function readClaudeCodeConfig(): Record<string, unknown> | null {
  if (!existsSync(CLAUDE_CODE_CONFIG)) return null;
  try {
    const content = readFileSync(CLAUDE_CODE_CONFIG, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

// ============================================================================
// CLEANUP
// ============================================================================

export function cleanupAllConnections(): void {
  for (const [mcpId] of activeConnections) {
    closeMcpConnection(mcpId);
  }
}

// Handle process exit
process.on("exit", cleanupAllConnections);
process.on("SIGINT", () => {
  cleanupAllConnections();
  process.exit(0);
});
process.on("SIGTERM", () => {
  cleanupAllConnections();
  process.exit(0);
});
