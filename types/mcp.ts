// MCP (Model Context Protocol) types for Daax

export type McpStatus = "available" | "installed" | "running" | "error";

export interface McpServer {
  id: string;
  name: string;
  description: string;
  version: string;
  status: McpStatus;
  // Where this MCP is installed (host identifier)
  installedOn?: string[];
  // Category for organization
  category: McpCategory;
  // Whether this is a core Daax MCP
  isCore?: boolean;
  // Gateway configuration - if this MCP should route through gateway
  useGateway?: boolean;
  // Tools exposed by this MCP
  tools?: McpTool[];
  // Resources exposed by this MCP
  resources?: McpResource[];
  // Configuration schema
  configSchema?: Record<string, unknown>;
  // Current configuration
  config?: Record<string, unknown>;
  // Inspector launch configuration
  configuration?: McpLaunchConfig;
  // Repository or package source
  source?: string;
  // Last error if status is "error"
  lastError?: string;
}

export type McpCategory =
  | "coordination" // Agent coordination (ask-my-human, pass-to-expert)
  | "observability" // Events, logging, monitoring
  | "tools" // External tool integrations
  | "data" // Data sources and storage
  | "gateway" // Gateway/routing MCPs
  | "custom"; // User-defined

export interface McpTool {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
}

export interface McpResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

// Launch configuration for MCP Inspector
export interface McpLaunchConfig {
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
}

// Alias for components that use a simpler name
export type MCP = McpServer;

// Host represents a machine/environment where MCPs can be installed
export interface McpHost {
  id: string;
  name: string;
  type: "local" | "remote" | "container";
  status: "online" | "offline" | "unknown";
  // MCPs installed on this host
  installedMcps: string[];
  // Gateway endpoint if this host runs the gateway
  gatewayEndpoint?: string;
}

// Event types for the events MCP
export interface McpEvent {
  id: string;
  timestamp: string;
  source: string; // Which MCP/agent emitted this
  type: McpEventType;
  payload: Record<string, unknown>;
  // For ask-my-human: tracks if response received
  responded?: boolean;
  response?: unknown;
}

export type McpEventType =
  | "agent.started"
  | "agent.completed"
  | "agent.error"
  | "human.question" // ask-my-human question
  | "human.response" // human's answer
  | "expert.delegate" // pass-to-expert delegation
  | "expert.result" // expert's result
  | "checkpoint" // regular check-in
  | "direction.change" // human requested direction change
  | "custom";

// Configuration for the MCP Gateway
export interface McpGatewayConfig {
  enabled: boolean;
  endpoint: string;
  // Which MCPs route through gateway
  routedMcps: string[];
  // Authentication for gateway
  auth?: {
    type: "none" | "token" | "mtls";
    token?: string;
  };
}
