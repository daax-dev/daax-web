/**
 * GET /api/cyber/safe-mcp/rules
 *
 * Returns list of SAFE-MCP detection rules with filtering support.
 *
 * Query Parameters:
 * - techniqueId: Filter by technique ID (e.g., "SAFE-T1001")
 * - level: Filter by rule level ("critical" | "high" | "medium" | "low" | "informational")
 * - status: Filter by rule status ("experimental" | "stable")
 * - search: Full-text search in title and description
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 50, max: 100)
 */

import { NextResponse } from "next/server";
import type { RulesResponse, RuleLevel } from "@/plugins/mcp-security/types";
import { loadRules } from "../_lib/data-loader";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    // Parse query parameters
    const techniqueId = searchParams.get("techniqueId");
    const level = searchParams.get("level") as RuleLevel | null;
    const status = searchParams.get("status") as
      | "experimental"
      | "stable"
      | null;
    const search = searchParams.get("search")?.toLowerCase();
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("limit") || "50", 10)),
    );

    // Load rules
    let rules = await loadRules();

    // Apply filters
    if (techniqueId) {
      rules = rules.filter((r) => r.techniqueId === techniqueId);
    }

    if (level) {
      rules = rules.filter((r) => r.level === level);
    }

    if (status) {
      rules = rules.filter((r) => r.status === status);
    }

    if (search) {
      rules = rules.filter(
        (r) =>
          r.title.toLowerCase().includes(search) ||
          r.description.toLowerCase().includes(search) ||
          r.techniqueId.toLowerCase().includes(search),
      );
    }

    // Calculate pagination
    const total = rules.length;
    const totalPages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;
    const paginatedRules = rules.slice(offset, offset + limit);

    const response: RulesResponse = {
      success: true,
      rules: paginatedRules,
      total,
    };

    return NextResponse.json(response, {
      headers: {
        "X-Total-Count": total.toString(),
        "X-Page": page.toString(),
        "X-Total-Pages": totalPages.toString(),
      },
    });
  } catch (error) {
    console.error("[API] Error fetching rules:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch rules" },
      { status: 500 },
    );
  }
}
