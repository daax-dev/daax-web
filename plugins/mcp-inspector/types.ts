/**
 * MCP Inspector Plugin - Types
 */

export interface RunningInspector {
  id: string;
  port: number;
  url: string;
  startedAt: string;
}

export interface InspectorLaunchRequest {
  mcpId: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  transport?: "stdio" | "sse" | "http";
  serverUrl?: string;
}

export interface InspectorLaunchResponse {
  status: "started" | "already_running";
  mcpId: string;
  port: number;
  serverPort?: number;
  url: string;
  pid?: number;
  startedAt?: string;
}

export interface InspectorStatusResponse {
  running: RunningInspector[];
  count: number;
}

export interface InspectorStopResponse {
  status: "stopped";
  mcpId: string;
}

/**
 * MCP data needed by the inspector (subset of full MCP type)
 */
export interface InspectorMcp {
  id: string;
  name: string;
  isCore?: boolean;
  configuration?: {
    command?: string;
    args?: string[];
    url?: string;
    env?: Record<string, string>;
  };
}
