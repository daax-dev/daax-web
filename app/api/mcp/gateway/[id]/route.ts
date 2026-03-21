// MCP Gateway - Individual MCP management
import { NextResponse } from "next/server";
import {
  getMcpState,
  setMcpState,
  enableMcp,
  disableMcp,
  toggleMcp,
  recordMcpUsage,
} from "@/lib/mcp-gateway";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const state = getMcpState(id);

    if (!state) {
      return NextResponse.json(
        { success: false, error: `MCP "${id}" not found` },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, mcp: state });
  } catch (error) {
    console.error("Gateway MCP GET error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to get MCP state",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { action, ...updates } = body;

    let result;

    switch (action) {
      case "enable":
        result = enableMcp(id);
        break;

      case "disable":
        result = disableMcp(id);
        break;

      case "toggle":
        result = toggleMcp(id);
        break;

      case "recordUsage":
        recordMcpUsage(id);
        result = getMcpState(id);
        break;

      case "update":
        result = setMcpState(id, updates);
        break;

      default:
        return NextResponse.json(
          { success: false, error: `Unknown action: ${action}` },
          { status: 400 },
        );
    }

    return NextResponse.json({ success: true, mcp: result });
  } catch (error) {
    console.error("Gateway MCP POST error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to update MCP",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const updates = await request.json();

    const result = setMcpState(id, updates);

    return NextResponse.json({ success: true, mcp: result });
  } catch (error) {
    console.error("Gateway MCP PATCH error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to update MCP",
      },
      { status: 500 },
    );
  }
}
