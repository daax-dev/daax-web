// MCP Gateway API
import { NextResponse } from "next/server";
import {
  loadGatewayState,
  getEnabledMcps,
  getRecommendedMcps,
  updateGatewayConfig,
  syncDiscoveredMcps,
  AVAILABLE_CONTEXTS,
} from "@/lib/mcp-gateway";
import { discoverAllMcps, type McpDiscoveryResult } from "@/lib/mcp-discovery";
import { requireAuth } from "@/lib/auth";

export async function GET(request: Request) {
  // The read-only view (default / ?view=...) returns only non-sensitive
  // gateway state (enabled flags, priority, config) and stays public,
  // consistent with the other read-only GETs left public in #197.
  // ?discover=true mutates gateway state (syncDiscoveredMcps), so auth is
  // required only for that branch, immediately before the mutation.
  try {
    const { searchParams } = new URL(request.url);
    const view = searchParams.get("view"); // "all" | "enabled" | "recommended"
    const context = searchParams.get("context");
    const discover = searchParams.get("discover") === "true";

    let discoveryResult: McpDiscoveryResult | null = null;

    // Optionally discover MCPs from system
    if (discover) {
      const auth = await requireAuth();
      if (!auth.authenticated) return auth.response;

      const discoveryPaths = [
        process.cwd(), // Current project
        process.env.HOME || "", // Home directory for .mcp.json
      ].filter(Boolean);

      discoveryResult = discoverAllMcps(discoveryPaths);

      // Sync discovered MCPs with gateway state
      syncDiscoveredMcps(discoveryResult.discovered);
    }

    const state = loadGatewayState();

    let mcps;
    switch (view) {
      case "enabled":
        mcps = getEnabledMcps();
        break;
      case "recommended":
        mcps = getRecommendedMcps(context || undefined);
        break;
      default:
        mcps = Object.values(state.mcpStates);
    }

    return NextResponse.json({
      success: true,
      mcps,
      config: state.config,
      contexts: AVAILABLE_CONTEXTS,
      discovery: discoveryResult
        ? {
            sources: discoveryResult.sources,
            discoveredCount: discoveryResult.discovered.length,
            timestamp: discoveryResult.timestamp,
          }
        : null,
    });
  } catch (error) {
    console.error("Gateway GET error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to get gateway state",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  // Gateway config mutation requires authentication (#197)
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      case "updateConfig": {
        const { config } = body;
        const updated = updateGatewayConfig(config);
        return NextResponse.json({ success: true, config: updated });
      }

      case "discover": {
        const { paths = [] } = body;
        const discoveryPaths = [
          process.cwd(),
          process.env.HOME || "",
          ...paths,
        ].filter(Boolean);

        const result = discoverAllMcps(discoveryPaths);
        syncDiscoveredMcps(result.discovered);

        return NextResponse.json({
          success: true,
          discovered: result.discovered.length,
          sources: result.sources,
          timestamp: result.timestamp,
        });
      }

      default:
        return NextResponse.json(
          { success: false, error: `Unknown action: ${action}` },
          { status: 400 },
        );
    }
  } catch (error) {
    console.error("Gateway POST error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to update gateway",
      },
      { status: 500 },
    );
  }
}
