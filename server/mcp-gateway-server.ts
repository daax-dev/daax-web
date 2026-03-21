#!/usr/bin/env bun
/**
 * MCP Gateway Server v2 - True MCP Proxy
 *
 * This server acts as a proxy to other MCPs:
 * - MCPs are "adopted" into gateway management (removed from ~/.claude.json)
 * - Gateway dynamically advertises available MCP capabilities
 * - Calls are proxied through gateway_call
 *
 * Tools:
 * - gateway_status: Full status with managed MCPs
 * - gateway_list: List managed MCPs with tools
 * - gateway_call: Proxy a tool call to a managed MCP
 * - gateway_adopt: Adopt MCPs into gateway management
 * - gateway_release: Release MCPs back to direct loading
 * - gateway_list_tools: List all tools for a specific MCP
 * - gateway_refresh: Refresh tool cache for all MCPs
 * - gateway_enable/disable: Enable/disable managed MCPs
 * - gateway_set_lifecycle: Set MCP lifecycle (on-demand vs keep-alive)
 */

import * as readline from "readline";
import {
  readGatewayConfig,
  writeGatewayConfig,
  adoptMcps,
  releaseMcp,
  proxyCall,
  getMcpTools,
  refreshAllToolCaches,
  generateGatewayCallDescription,
  getFullToolList,
} from "../lib/mcp-gateway-proxy";

// MCP Protocol types
interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

// Build tools list dynamically
function buildToolsList(): object[] {
  const gatewayCallDescription = generateGatewayCallDescription();

  return [
    {
      name: "gateway_status",
      description:
        "Get full gateway status including managed MCPs, settings, and statistics",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "gateway_list",
      description:
        "List all managed MCPs with their status, context, and available tools",
      inputSchema: {
        type: "object",
        properties: {
          context: {
            type: "string",
            description:
              "Optional: filter by context (git, testing, security, coding, ui, research, data, general)",
          },
        },
      },
    },
    {
      name: "gateway_call",
      description: gatewayCallDescription,
      inputSchema: {
        type: "object",
        properties: {
          mcp: {
            type: "string",
            description: "The MCP server ID to call",
          },
          tool: {
            type: "string",
            description: "The tool name to invoke",
          },
          args: {
            type: "object",
            description: "Arguments to pass to the tool",
          },
        },
        required: ["mcp", "tool"],
      },
    },
    {
      name: "gateway_adopt",
      description:
        "Adopt MCPs from ~/.claude.json into gateway management. This removes them from Claude Code's direct loading and allows proxying through the gateway. Creates a backup before making changes.",
      inputSchema: {
        type: "object",
        properties: {
          mcpIds: {
            type: "array",
            items: { type: "string" },
            description:
              "Optional: specific MCP IDs to adopt. If not provided, adopts all MCPs except gateway itself.",
          },
        },
      },
    },
    {
      name: "gateway_release",
      description:
        "Release an MCP back to Claude Code direct management. This removes it from gateway and adds it back to ~/.claude.json.",
      inputSchema: {
        type: "object",
        properties: {
          mcpId: {
            type: "string",
            description: "The MCP ID to release",
          },
        },
        required: ["mcpId"],
      },
    },
    {
      name: "gateway_list_tools",
      description: "List all available tools for a specific managed MCP",
      inputSchema: {
        type: "object",
        properties: {
          mcpId: {
            type: "string",
            description: "The MCP ID to list tools for",
          },
          refresh: {
            type: "boolean",
            description: "Force refresh the tool cache",
          },
        },
        required: ["mcpId"],
      },
    },
    {
      name: "gateway_refresh",
      description:
        "Refresh tool cache for all managed MCPs. Use this after MCP updates to get new tool schemas.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "gateway_enable",
      description: "Enable a managed MCP (allows gateway_call to use it)",
      inputSchema: {
        type: "object",
        properties: {
          mcpId: {
            type: "string",
            description: "The MCP ID to enable",
          },
        },
        required: ["mcpId"],
      },
    },
    {
      name: "gateway_disable",
      description:
        "Disable a managed MCP (gateway_call will reject calls to it)",
      inputSchema: {
        type: "object",
        properties: {
          mcpId: {
            type: "string",
            description: "The MCP ID to disable",
          },
        },
        required: ["mcpId"],
      },
    },
    {
      name: "gateway_set_lifecycle",
      description:
        "Set the lifecycle mode for a managed MCP. 'on-demand' spawns per-call (slower but saves memory). 'keep-alive' maintains connection (faster but uses memory).",
      inputSchema: {
        type: "object",
        properties: {
          mcpId: {
            type: "string",
            description: "The MCP ID to configure",
          },
          lifecycle: {
            type: "string",
            enum: ["on-demand", "keep-alive"],
            description: "The lifecycle mode",
          },
        },
        required: ["mcpId", "lifecycle"],
      },
    },
  ];
}

// Tool handlers
async function handleToolCall(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case "gateway_status": {
      const config = readGatewayConfig();
      const managed = Object.values(config.managed);
      const enabled = managed.filter((m) => m.enabled);
      const disabled = managed.filter((m) => !m.enabled);

      const byContext: Record<
        string,
        { enabled: number; disabled: number; mcps: string[] }
      > = {};
      for (const mcp of managed) {
        if (!byContext[mcp.context]) {
          byContext[mcp.context] = { enabled: 0, disabled: 0, mcps: [] };
        }
        byContext[mcp.context].mcps.push(mcp.id);
        if (mcp.enabled) {
          byContext[mcp.context].enabled++;
        } else {
          byContext[mcp.context].disabled++;
        }
      }

      return {
        version: config.version,
        totalManaged: managed.length,
        enabled: enabled.length,
        disabled: disabled.length,
        byContext,
        settings: config.settings,
        lastUpdated: config.lastUpdated,
        mcps: managed.map((m) => ({
          id: m.id,
          name: m.name,
          context: m.context,
          enabled: m.enabled,
          lifecycle: m.lifecycle,
          toolCount: m.toolCache?.length || 0,
          adoptedAt: m.adoptedAt,
        })),
      };
    }

    case "gateway_list": {
      const config = readGatewayConfig();
      const contextFilter = args.context as string | undefined;

      let mcps = Object.values(config.managed).map((m) => ({
        id: m.id,
        name: m.name,
        context: m.context,
        enabled: m.enabled,
        lifecycle: m.lifecycle,
        toolCount: m.toolCache?.length || 0,
        tools: m.toolCache?.map((t) => t.name).slice(0, 5) || [],
        hasMoreTools: (m.toolCache?.length || 0) > 5,
      }));

      if (contextFilter) {
        mcps = mcps.filter((m) => m.context === contextFilter);
      }

      return {
        total: mcps.length,
        enabled: mcps.filter((m) => m.enabled).length,
        disabled: mcps.filter((m) => !m.enabled).length,
        mcps,
      };
    }

    case "gateway_call": {
      const mcpId = args.mcp as string;
      const toolName = args.tool as string;
      const toolArgs = (args.args || {}) as Record<string, unknown>;

      if (!mcpId || !toolName) {
        throw new Error("Missing required parameters: mcp and tool");
      }

      const result = await proxyCall(mcpId, toolName, toolArgs);

      if (!result.success) {
        throw new Error(result.error || "Proxy call failed");
      }

      return result.result;
    }

    case "gateway_adopt": {
      const mcpIds = args.mcpIds as string[] | undefined;
      const result = await adoptMcps(mcpIds);

      return {
        success: true,
        adopted: result.adopted,
        skipped: result.skipped,
        errors: result.errors,
        backupPath: result.backupPath,
        message:
          result.adopted.length > 0
            ? `Adopted ${result.adopted.length} MCP(s). Restart Claude Code to apply changes. Backup saved to: ${result.backupPath}`
            : "No MCPs were adopted.",
        nextSteps:
          result.adopted.length > 0
            ? [
                "1. Restart Claude Code to unload the adopted MCPs",
                "2. Use gateway_refresh to cache tool schemas",
                "3. Use gateway_call to invoke tools on managed MCPs",
              ]
            : [],
      };
    }

    case "gateway_release": {
      const mcpId = args.mcpId as string;
      const result = releaseMcp(mcpId);

      if (!result.success) {
        throw new Error(result.error || "Release failed");
      }

      return {
        success: true,
        message: `Released ${mcpId} back to Claude Code direct management. Restart Claude Code to apply changes.`,
      };
    }

    case "gateway_list_tools": {
      const mcpId = args.mcpId as string;
      const refresh = args.refresh as boolean | undefined;

      const tools = refresh
        ? await getMcpTools(mcpId, true)
        : getFullToolList(mcpId) || (await getMcpTools(mcpId));

      return {
        mcpId,
        toolCount: tools.length,
        tools: tools.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      };
    }

    case "gateway_refresh": {
      const result = await refreshAllToolCaches();

      return {
        success: result.success.length,
        errors: result.errors,
        message: `Refreshed tool cache for ${result.success.length} MCP(s).`,
      };
    }

    case "gateway_enable": {
      const mcpId = args.mcpId as string;
      const config = readGatewayConfig();

      if (!config.managed[mcpId]) {
        throw new Error(`MCP ${mcpId} is not managed by gateway`);
      }

      config.managed[mcpId].enabled = true;
      writeGatewayConfig(config);

      return {
        success: true,
        message: `Enabled MCP: ${mcpId}`,
      };
    }

    case "gateway_disable": {
      const mcpId = args.mcpId as string;
      const config = readGatewayConfig();

      if (!config.managed[mcpId]) {
        throw new Error(`MCP ${mcpId} is not managed by gateway`);
      }

      config.managed[mcpId].enabled = false;
      writeGatewayConfig(config);

      return {
        success: true,
        message: `Disabled MCP: ${mcpId}`,
      };
    }

    case "gateway_set_lifecycle": {
      const mcpId = args.mcpId as string;
      const lifecycle = args.lifecycle as "on-demand" | "keep-alive";
      const config = readGatewayConfig();

      if (!config.managed[mcpId]) {
        throw new Error(`MCP ${mcpId} is not managed by gateway`);
      }

      config.managed[mcpId].lifecycle = lifecycle;
      writeGatewayConfig(config);

      return {
        success: true,
        message: `Set ${mcpId} lifecycle to: ${lifecycle}`,
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// JSON-RPC response helper
function respond(
  id: number | string | null,
  result?: unknown,
  error?: { code: number; message: string },
): void {
  const response: JsonRpcResponse = {
    jsonrpc: "2.0",
    id,
  };

  if (error) {
    response.error = error;
  } else {
    response.result = result;
  }

  process.stdout.write(JSON.stringify(response) + "\n");
}

// Handle incoming requests
async function handleRequest(request: JsonRpcRequest): Promise<void> {
  const { id, method, params } = request;

  try {
    switch (method) {
      case "initialize":
        respond(id, {
          protocolVersion: "2024-11-05",
          capabilities: {
            tools: {},
          },
          serverInfo: {
            name: "mcp-gateway",
            version: "2.0.0",
          },
        });
        break;

      case "notifications/initialized":
        // No response needed for notifications
        break;

      case "tools/list":
        // Build tools dynamically to include current MCP capabilities
        respond(id, { tools: buildToolsList() });
        break;

      case "tools/call": {
        const toolName = params?.name as string;
        const toolArgs = (params?.arguments || {}) as Record<string, unknown>;

        const result = await handleToolCall(toolName, toolArgs);
        respond(id, {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        });
        break;
      }

      default:
        respond(id, null, {
          code: -32601,
          message: `Method not found: ${method}`,
        });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    respond(id, null, { code: -32000, message });
  }
}

// Main: read JSON-RPC from stdin
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

rl.on("line", async (line) => {
  if (!line.trim()) return;

  try {
    const request = JSON.parse(line) as JsonRpcRequest;
    await handleRequest(request);
  } catch {
    respond(null, null, { code: -32700, message: "Parse error" });
  }
});

// Log to stderr for debugging (doesn't interfere with protocol)
process.stderr.write("MCP Gateway server v2 started (proxy mode)\n");
