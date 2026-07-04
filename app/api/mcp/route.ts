import { NextRequest, NextResponse } from "next/server";
import { getAllMcps, addMcp, loadRegistry } from "@/lib/mcp-registry";
import type { McpServer } from "@/types/mcp";
import { requireAuth } from "@/lib/auth";

// GET /api/mcp - List all MCPs
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");
    const coreOnly = searchParams.get("core") === "true";

    let mcps = getAllMcps();

    if (category) {
      mcps = mcps.filter((m) => m.category === category);
    }

    if (coreOnly) {
      mcps = mcps.filter((m) => m.isCore);
    }

    const registry = loadRegistry();

    return NextResponse.json({
      success: true,
      mcps,
      total: mcps.length,
      lastUpdated: registry.lastUpdated,
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Failed to fetch MCPs",
      },
      { status: 500 },
    );
  }
}

// POST /api/mcp - Add new MCP directly. Requires authentication (requireAuth()).
// Admin/group scoping is a future RBAC item (issue #101 / #197 AC#2).
export async function POST(request: NextRequest) {
  // Registry mutation requires authentication (#197)
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  try {
    const body = await request.json();

    // Validate required fields
    const required = ["id", "name", "description", "version", "category"];
    for (const field of required) {
      if (!body[field]) {
        return NextResponse.json(
          { success: false, error: `Missing required field: ${field}` },
          { status: 400 },
        );
      }
    }

    const mcp: McpServer = {
      id: body.id,
      name: body.name,
      description: body.description,
      version: body.version,
      status: body.status || "available",
      category: body.category,
      isCore: body.isCore || false,
      useGateway: body.useGateway || false,
      tools: body.tools || [],
      resources: body.resources || [],
      source: body.source,
    };

    const created = addMcp(mcp);

    return NextResponse.json({
      success: true,
      mcp: created,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to add MCP";
    const status = message.includes("already exists") ? 409 : 500;

    return NextResponse.json({ success: false, error: message }, { status });
  }
}
