/**
 * GET /api/cyber/safe-mcp/techniques
 *
 * Returns paginated list of SAFE-MCP techniques with filtering support.
 *
 * Query Parameters:
 * - tactic: Filter by tactic ID (e.g., "ATK-TA0001")
 * - severity: Filter by severity ("critical" | "high" | "medium" | "low")
 * - search: Full-text search in name and description
 * - documented: Filter to only documented techniques (boolean)
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 20, max: 100)
 */

import { NextResponse } from "next/server";
import type {
  Technique,
  TechniquesResponse,
  Severity,
} from "@/plugins/mcp-security/types";
import { TACTICS } from "@/plugins/mcp-security/types";
import { loadTechniques } from "../_lib/data-loader";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    // Parse query parameters
    const tactic = searchParams.get("tactic");
    const severity = searchParams.get("severity") as Severity | null;
    const search = searchParams.get("search")?.toLowerCase();
    const documented = searchParams.get("documented");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("limit") || "20", 10)),
    );

    // Load techniques
    let techniques = await loadTechniques();

    // Apply filters
    if (tactic) {
      techniques = techniques.filter((t) => t.tactic.id === tactic);
    }

    if (severity) {
      techniques = techniques.filter((t) => t.severity === severity);
    }

    if (search) {
      techniques = techniques.filter(
        (t) =>
          t.name.toLowerCase().includes(search) ||
          t.description.toLowerCase().includes(search) ||
          t.id.toLowerCase().includes(search),
      );
    }

    if (documented === "true") {
      techniques = techniques.filter((t) => t.hasDocumentation);
    }

    // Calculate pagination
    const total = techniques.length;
    const totalPages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;
    const paginatedTechniques = techniques.slice(offset, offset + limit);

    const response: TechniquesResponse = {
      success: true,
      techniques: paginatedTechniques,
      total,
      tactics: TACTICS,
      lastUpdated: new Date().toISOString(),
    };

    return NextResponse.json(response, {
      headers: {
        "X-Total-Count": total.toString(),
        "X-Page": page.toString(),
        "X-Total-Pages": totalPages.toString(),
      },
    });
  } catch (error) {
    console.error("[API] Error fetching techniques:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch techniques" },
      { status: 500 },
    );
  }
}
