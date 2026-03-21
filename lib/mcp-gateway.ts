// MCP Gateway - manages dynamic MCP routing and state
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import type { DiscoveredMcp, McpSource } from "./mcp-discovery";

const DATA_DIR = join(process.cwd(), "data");
const GATEWAY_STATE_FILE = join(DATA_DIR, "mcp-gateway-state.json");

// MCP enabled/disabled state
export interface McpState {
  id: string;
  enabled: boolean;
  priority: number; // Lower = higher priority (for ordering)
  contextTags: string[]; // Tags for context-aware filtering (e.g., "coding", "research", "git")
  lastUsed?: string;
  usageCount: number;
}

// Gateway configuration
export interface GatewayConfig {
  // Auto-discovery settings
  autoDiscovery: boolean;
  discoveryPaths: string[];

  // Context filtering
  activeContext: string | null; // Current context tag

  // Connection settings
  maxConcurrentConnections: number;
  connectionTimeout: number;
}

// Full gateway state
export interface GatewayState {
  mcpStates: Record<string, McpState>;
  config: GatewayConfig;
  lastUpdated: string;
  version: string;
}

// Default configuration
const DEFAULT_CONFIG: GatewayConfig = {
  autoDiscovery: true,
  discoveryPaths: [],
  activeContext: null,
  maxConcurrentConnections: 10,
  connectionTimeout: 30000,
};

// Default MCP context tags based on common patterns
const DEFAULT_CONTEXT_TAGS: Record<string, string[]> = {
  // Version control
  github: ["coding", "git", "collaboration"],
  git: ["coding", "git"],

  // File operations
  filesystem: ["coding", "files"],
  serena: ["coding", "files", "analysis"],

  // Web/Research
  "brave-search": ["research", "web"],
  firecrawl: ["research", "web", "scraping"],
  fetch: ["research", "web"],

  // Databases
  postgres: ["data", "database"],
  sqlite: ["data", "database"],

  // Code analysis
  semgrep: ["coding", "security", "analysis"],
  trivy: ["coding", "security"],

  // Testing
  playwright: ["coding", "testing"],
  "playwright-test": ["coding", "testing"],

  // UI/Design
  shadcn: ["coding", "ui"],
  figma: ["design", "ui"],

  // AI/Documentation
  context7: ["coding", "documentation"],

  // Default for unknown
  default: ["general"],
};

// Get context tags for an MCP
function getContextTags(mcpId: string): string[] {
  // Check for exact match
  if (DEFAULT_CONTEXT_TAGS[mcpId]) {
    return DEFAULT_CONTEXT_TAGS[mcpId];
  }

  // Check for partial matches
  for (const [key, tags] of Object.entries(DEFAULT_CONTEXT_TAGS)) {
    if (mcpId.toLowerCase().includes(key.toLowerCase())) {
      return tags;
    }
  }

  return DEFAULT_CONTEXT_TAGS.default;
}

// Ensure data directory exists
function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

// Load gateway state
export function loadGatewayState(): GatewayState {
  ensureDataDir();

  if (!existsSync(GATEWAY_STATE_FILE)) {
    const defaultState = getDefaultState();
    saveGatewayState(defaultState);
    return defaultState;
  }

  try {
    const data = readFileSync(GATEWAY_STATE_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    const defaultState = getDefaultState();
    saveGatewayState(defaultState);
    return defaultState;
  }
}

// Save gateway state
export function saveGatewayState(state: GatewayState): void {
  ensureDataDir();
  state.lastUpdated = new Date().toISOString();
  writeFileSync(GATEWAY_STATE_FILE, JSON.stringify(state, null, 2));
}

// Get default state
function getDefaultState(): GatewayState {
  return {
    mcpStates: {},
    config: DEFAULT_CONFIG,
    lastUpdated: new Date().toISOString(),
    version: "1.0.0",
  };
}

// Update or create MCP state
export function setMcpState(id: string, updates: Partial<McpState>): McpState {
  const state = loadGatewayState();

  const existing = state.mcpStates[id];
  const newState: McpState = {
    id,
    enabled: updates.enabled ?? existing?.enabled ?? true,
    priority: updates.priority ?? existing?.priority ?? 100,
    contextTags:
      updates.contextTags ?? existing?.contextTags ?? getContextTags(id),
    lastUsed: updates.lastUsed ?? existing?.lastUsed,
    usageCount: updates.usageCount ?? existing?.usageCount ?? 0,
  };

  state.mcpStates[id] = newState;
  saveGatewayState(state);

  return newState;
}

// Enable an MCP
export function enableMcp(id: string): McpState {
  return setMcpState(id, { enabled: true });
}

// Disable an MCP
export function disableMcp(id: string): McpState {
  return setMcpState(id, { enabled: false });
}

// Toggle MCP enabled state
export function toggleMcp(id: string): McpState {
  const state = loadGatewayState();
  const current = state.mcpStates[id];
  return setMcpState(id, { enabled: !current?.enabled });
}

// Get MCP state
export function getMcpState(id: string): McpState | undefined {
  const state = loadGatewayState();
  return state.mcpStates[id];
}

// Get all enabled MCPs
export function getEnabledMcps(): McpState[] {
  const state = loadGatewayState();
  return Object.values(state.mcpStates)
    .filter((mcp) => mcp.enabled)
    .sort((a, b) => a.priority - b.priority);
}

// Get MCPs filtered by context
export function getMcpsByContext(context: string): McpState[] {
  const state = loadGatewayState();
  return Object.values(state.mcpStates)
    .filter((mcp) => mcp.enabled && mcp.contextTags.includes(context))
    .sort((a, b) => a.priority - b.priority);
}

// Record MCP usage (for smart prioritization)
export function recordMcpUsage(id: string): void {
  const state = loadGatewayState();
  const mcpState = state.mcpStates[id];

  if (mcpState) {
    mcpState.lastUsed = new Date().toISOString();
    mcpState.usageCount = (mcpState.usageCount || 0) + 1;
    saveGatewayState(state);
  }
}

// Update gateway config
export function updateGatewayConfig(
  updates: Partial<GatewayConfig>,
): GatewayConfig {
  const state = loadGatewayState();
  state.config = { ...state.config, ...updates };
  saveGatewayState(state);
  return state.config;
}

// Set active context
export function setActiveContext(context: string | null): void {
  updateGatewayConfig({ activeContext: context });
}

// Get active context
export function getActiveContext(): string | null {
  const state = loadGatewayState();
  return state.config.activeContext;
}

// Sync discovered MCPs with gateway state
export function syncDiscoveredMcps(discovered: DiscoveredMcp[]): void {
  const state = loadGatewayState();

  for (const mcp of discovered) {
    if (!state.mcpStates[mcp.id]) {
      // New MCP discovered - add with default state
      state.mcpStates[mcp.id] = {
        id: mcp.id,
        enabled: mcp.enabled,
        priority: 100,
        contextTags: getContextTags(mcp.id),
        usageCount: 0,
      };
    }
  }

  saveGatewayState(state);
}

// Get recommended MCPs for current context
export function getRecommendedMcps(context?: string): McpState[] {
  const state = loadGatewayState();
  const activeContext = context || state.config.activeContext;

  let mcps = Object.values(state.mcpStates).filter((mcp) => mcp.enabled);

  if (activeContext) {
    // Prioritize MCPs that match the active context
    mcps = mcps.sort((a, b) => {
      const aMatch = a.contextTags.includes(activeContext) ? 0 : 1;
      const bMatch = b.contextTags.includes(activeContext) ? 0 : 1;
      if (aMatch !== bMatch) return aMatch - bMatch;
      return a.priority - b.priority;
    });
  } else {
    mcps = mcps.sort((a, b) => a.priority - b.priority);
  }

  return mcps;
}

// Bulk enable/disable MCPs
export function bulkSetMcpEnabled(ids: string[], enabled: boolean): void {
  const state = loadGatewayState();

  for (const id of ids) {
    if (state.mcpStates[id]) {
      state.mcpStates[id].enabled = enabled;
    } else {
      state.mcpStates[id] = {
        id,
        enabled,
        priority: 100,
        contextTags: getContextTags(id),
        usageCount: 0,
      };
    }
  }

  saveGatewayState(state);
}

// Enable only MCPs for a specific context (disable others)
export function enableContextOnly(context: string): void {
  const state = loadGatewayState();

  for (const mcp of Object.values(state.mcpStates)) {
    mcp.enabled = mcp.contextTags.includes(context);
  }

  state.config.activeContext = context;
  saveGatewayState(state);
}

// Reset to all enabled
export function resetToAllEnabled(): void {
  const state = loadGatewayState();

  for (const mcp of Object.values(state.mcpStates)) {
    mcp.enabled = true;
  }

  state.config.activeContext = null;
  saveGatewayState(state);
}

// Available context tags
export const AVAILABLE_CONTEXTS = [
  {
    id: "coding",
    label: "Coding",
    description: "Development and programming tools",
  },
  {
    id: "research",
    label: "Research",
    description: "Web search and information gathering",
  },
  { id: "git", label: "Git/VCS", description: "Version control operations" },
  { id: "testing", label: "Testing", description: "Test automation tools" },
  {
    id: "security",
    label: "Security",
    description: "Security scanning and analysis",
  },
  { id: "data", label: "Data", description: "Database and data operations" },
  { id: "ui", label: "UI/Design", description: "Design and component tools" },
  { id: "general", label: "General", description: "General purpose tools" },
];
