import { NextRequest, NextResponse } from "next/server";
import { getMcpById, updateMcp, deleteMcp } from "@/lib/mcp-registry";
import { requireAuth } from "@/lib/auth";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/mcp/[id] - Get single MCP
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const mcp = getMcpById(id);

    if (!mcp) {
      return NextResponse.json(
        { success: false, error: "MCP not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, mcp });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Failed to fetch MCP",
      },
      { status: 500 },
    );
  }
}

// PATCH /api/mcp/[id] - Update MCP
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  // Registry mutation requires authentication (#197)
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  try {
    const { id } = await params;
    const body = await request.json();

    // Don't allow changing ID
    delete body.id;

    const updated = updateMcp(id, body);

    return NextResponse.json({ success: true, mcp: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update MCP";
    const status = message.includes("not found") ? 404 : 500;

    return NextResponse.json({ success: false, error: message }, { status });
  }
}

// DELETE /api/mcp/[id] - Delete MCP
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  // Registry mutation requires authentication (#197)
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  try {
    const { id } = await params;
    const deleted = deleteMcp(id);

    if (!deleted) {
      return NextResponse.json(
        { success: false, error: "MCP not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, deleted: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete MCP";
    const status = message.includes("core") ? 403 : 500;

    return NextResponse.json({ success: false, error: message }, { status });
  }
}
