// MCP Gateway - Bulk operations
import { NextResponse } from "next/server";
import {
  bulkSetMcpEnabled,
  enableContextOnly,
  resetToAllEnabled,
  setActiveContext,
  getEnabledMcps,
  getMcpsByContext,
} from "@/lib/mcp-gateway";
import { requireAuth } from "@/lib/auth";

export async function POST(request: Request) {
  // Bulk gateway mutation requires authentication (#197)
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      case "bulkEnable": {
        const { ids } = body;
        if (!Array.isArray(ids)) {
          return NextResponse.json(
            { success: false, error: "ids must be an array" },
            { status: 400 },
          );
        }
        bulkSetMcpEnabled(ids, true);
        return NextResponse.json({
          success: true,
          enabled: ids.length,
          mcps: getEnabledMcps(),
        });
      }

      case "bulkDisable": {
        const { ids } = body;
        if (!Array.isArray(ids)) {
          return NextResponse.json(
            { success: false, error: "ids must be an array" },
            { status: 400 },
          );
        }
        bulkSetMcpEnabled(ids, false);
        return NextResponse.json({
          success: true,
          disabled: ids.length,
          mcps: getEnabledMcps(),
        });
      }

      case "enableContextOnly": {
        const { context } = body;
        if (!context) {
          return NextResponse.json(
            { success: false, error: "context is required" },
            { status: 400 },
          );
        }
        enableContextOnly(context);
        return NextResponse.json({
          success: true,
          context,
          mcps: getMcpsByContext(context),
        });
      }

      case "setContext": {
        const { context } = body;
        setActiveContext(context || null);
        return NextResponse.json({
          success: true,
          context: context || null,
          mcps: context ? getMcpsByContext(context) : getEnabledMcps(),
        });
      }

      case "resetAll": {
        resetToAllEnabled();
        return NextResponse.json({
          success: true,
          mcps: getEnabledMcps(),
        });
      }

      default:
        return NextResponse.json(
          { success: false, error: `Unknown action: ${action}` },
          { status: 400 },
        );
    }
  } catch (error) {
    console.error("Gateway bulk POST error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to perform bulk operation",
      },
      { status: 500 },
    );
  }
}
