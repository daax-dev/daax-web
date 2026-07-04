// MCP Config API - REAL Claude Code config integration
// Reads/writes ~/.claude.json to actually control MCPs
//
// SECURITY: POST operations require authentication via requireAuth()

import { NextResponse } from "next/server";
import {
  discoverAllMcps,
  setDisabledMcps,
  enableMcp,
  disableMcp,
  estimateTokenSavings,
  addMcpServer,
  updateMcpServer,
  deleteMcpServer,
  type McpServerConfig,
} from "@/lib/mcp-config";
import { requireAuth } from "@/lib/auth";
import { getDefaultProjectPath } from "@/lib/mcp-route-helpers";

/**
 * Validate MCP server config structure at runtime.
 * Returns null if valid, or an error message if invalid.
 */
function validateMcpConfig(config: unknown): string | null {
  if (!config || typeof config !== "object") {
    return "config must be an object";
  }

  const c = config as Record<string, unknown>;

  // Must have either command (stdio) or url (http)
  if (!c.command && !c.url) {
    return "config must have either 'command' (stdio) or 'url' (http)";
  }

  // If command is provided, it must be a string
  if (c.command !== undefined && typeof c.command !== "string") {
    return "config.command must be a string";
  }

  // If url is provided, it must be a string
  if (c.url !== undefined && typeof c.url !== "string") {
    return "config.url must be a string";
  }

  // If args is provided, it must be an array of strings
  if (c.args !== undefined) {
    if (!Array.isArray(c.args)) {
      return "config.args must be an array";
    }
    if (!c.args.every((arg) => typeof arg === "string")) {
      return "config.args must contain only strings";
    }
  }

  // If env is provided, it must be an object with string values
  if (c.env !== undefined) {
    if (typeof c.env !== "object" || c.env === null || Array.isArray(c.env)) {
      return "config.env must be an object";
    }
    for (const [key, value] of Object.entries(
      c.env as Record<string, unknown>,
    )) {
      if (typeof value !== "string") {
        return `config.env.${key} must be a string`;
      }
    }
  }

  return null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectPath = searchParams.get("project") || getDefaultProjectPath();

  try {
    const state = discoverAllMcps(projectPath);
    const savings = estimateTokenSavings(projectPath);

    return NextResponse.json({
      success: true,
      mcps: state.mcps,
      currentProject: state.currentProject,
      disabledInProject: state.disabledInProject,
      sources: state.sources,
      tokenSavings: savings,
      // Include diagnostics when no MCPs found (helps troubleshoot empty page)
      ...(state.diagnostics && { diagnostics: state.diagnostics }),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Discovery failed",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  // Require authentication for all config modifications
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  try {
    const body = await request.json();
    const { action, projectPath, mcpId, mcpIds, config, scope, sourcePath } =
      body;

    const project = projectPath || getDefaultProjectPath();

    switch (action) {
      // ========== CRUD Operations ==========
      case "add": {
        if (!mcpId) {
          return NextResponse.json(
            { success: false, error: "mcpId required" },
            { status: 400 },
          );
        }
        if (!config) {
          return NextResponse.json(
            { success: false, error: "config required" },
            { status: 400 },
          );
        }
        const configValidationError = validateMcpConfig(config);
        if (configValidationError) {
          return NextResponse.json(
            { success: false, error: configValidationError },
            { status: 400 },
          );
        }
        const mcpScope = scope || "global";
        const result = addMcpServer(
          mcpId,
          config as McpServerConfig,
          mcpScope,
          mcpScope === "project" ? project : undefined,
        );
        if (!result.success) {
          return NextResponse.json(
            { success: false, error: result.error },
            { status: 400 },
          );
        }
        return NextResponse.json({
          success: true,
          message: `Added ${mcpId}. Restart Claude Code for changes to take effect.`,
          state: discoverAllMcps(project),
        });
      }

      case "update": {
        if (!mcpId) {
          return NextResponse.json(
            { success: false, error: "mcpId required" },
            { status: 400 },
          );
        }
        if (!config) {
          return NextResponse.json(
            { success: false, error: "config required" },
            { status: 400 },
          );
        }
        if (!sourcePath) {
          return NextResponse.json(
            { success: false, error: "sourcePath required" },
            { status: 400 },
          );
        }
        const configValidationError = validateMcpConfig(config);
        if (configValidationError) {
          return NextResponse.json(
            { success: false, error: configValidationError },
            { status: 400 },
          );
        }
        const result = updateMcpServer(
          mcpId,
          config as McpServerConfig,
          sourcePath,
        );
        if (!result.success) {
          return NextResponse.json(
            { success: false, error: result.error },
            { status: 400 },
          );
        }
        return NextResponse.json({
          success: true,
          message: `Updated ${mcpId}. Restart Claude Code for changes to take effect.`,
          state: discoverAllMcps(project),
        });
      }

      case "delete": {
        if (!mcpId) {
          return NextResponse.json(
            { success: false, error: "mcpId required" },
            { status: 400 },
          );
        }
        if (!sourcePath) {
          return NextResponse.json(
            { success: false, error: "sourcePath required" },
            { status: 400 },
          );
        }
        const result = deleteMcpServer(mcpId, sourcePath);
        if (!result.success) {
          return NextResponse.json(
            { success: false, error: result.error },
            { status: 400 },
          );
        }
        return NextResponse.json({
          success: true,
          message: `Deleted ${mcpId}. Restart Claude Code for changes to take effect.`,
          state: discoverAllMcps(project),
        });
      }

      // ========== Enable/Disable Operations ==========
      case "enable": {
        if (!mcpId) {
          return NextResponse.json(
            { success: false, error: "mcpId required" },
            { status: 400 },
          );
        }
        const success = enableMcp(project, mcpId);
        if (!success) {
          return NextResponse.json(
            { success: false, error: "Failed to enable MCP" },
            { status: 500 },
          );
        }
        return NextResponse.json({
          success: true,
          message: `Enabled ${mcpId}. Restart Claude Code for changes to take effect.`,
          state: discoverAllMcps(project),
        });
      }

      case "disable": {
        if (!mcpId) {
          return NextResponse.json(
            { success: false, error: "mcpId required" },
            { status: 400 },
          );
        }
        const success = disableMcp(project, mcpId);
        if (!success) {
          return NextResponse.json(
            { success: false, error: "Failed to disable MCP" },
            { status: 500 },
          );
        }
        return NextResponse.json({
          success: true,
          message: `Disabled ${mcpId}. Restart Claude Code for changes to take effect.`,
          state: discoverAllMcps(project),
        });
      }

      case "setDisabled": {
        if (!Array.isArray(mcpIds)) {
          return NextResponse.json(
            { success: false, error: "mcpIds array required" },
            { status: 400 },
          );
        }
        const success = setDisabledMcps(project, mcpIds);
        if (!success) {
          return NextResponse.json(
            { success: false, error: "Failed to update disabled MCPs" },
            { status: 500 },
          );
        }
        return NextResponse.json({
          success: true,
          message: `Updated disabled MCPs. Restart Claude Code for changes to take effect.`,
          disabledCount: mcpIds.length,
          state: discoverAllMcps(project),
        });
      }

      case "enableAll": {
        const success = setDisabledMcps(project, []);
        if (!success) {
          return NextResponse.json(
            { success: false, error: "Failed to enable all" },
            { status: 500 },
          );
        }
        return NextResponse.json({
          success: true,
          message:
            "All MCPs enabled. Restart Claude Code for changes to take effect.",
          state: discoverAllMcps(project),
        });
      }

      case "disableAll": {
        const state = discoverAllMcps(project);
        const allIds = state.mcps.map((m) => m.id);
        const success = setDisabledMcps(project, allIds);
        if (!success) {
          return NextResponse.json(
            { success: false, error: "Failed to disable all" },
            { status: 500 },
          );
        }
        return NextResponse.json({
          success: true,
          message:
            "All MCPs disabled. Restart Claude Code for changes to take effect.",
          disabledCount: allIds.length,
          state: discoverAllMcps(project),
        });
      }

      default:
        return NextResponse.json(
          { success: false, error: `Unknown action: ${action}` },
          { status: 400 },
        );
    }
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Operation failed",
      },
      { status: 500 },
    );
  }
}
