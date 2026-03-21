/**
 * GET /api/cyber/safe-mcp/mitigations
 *
 * Returns list of SAFE-MCP mitigations with filtering support.
 *
 * Query Parameters:
 * - category: Filter by category (e.g., "Architectural Defense")
 * - effectiveness: Filter by effectiveness ("high" | "medium-high" | "medium" | "low")
 * - search: Full-text search in name and description
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 50, max: 100)
 */

import { NextResponse } from "next/server";
import type {
  Mitigation,
  MitigationsResponse,
  MitigationCategory,
  Effectiveness,
} from "@/plugins/mcp-security/types";
import { loadMitigations } from "../_lib/data-loader";

// All available categories
const CATEGORIES: MitigationCategory[] = [
  "Architectural Defense",
  "Cryptographic Control",
  "AI-Based Defense",
  "Input Validation",
  "Supply Chain Security",
  "UI Security",
  "Isolation and Containment",
  "Detective Control",
  "Preventive Control",
  "Architectural Control",
  "Data Security",
  "Risk Management",
  "Human Factors",
];

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    // Parse query parameters
    const category = searchParams.get("category") as MitigationCategory | null;
    const effectiveness = searchParams.get(
      "effectiveness",
    ) as Effectiveness | null;
    const search = searchParams.get("search")?.toLowerCase();
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("limit") || "50", 10)),
    );

    // Load mitigations
    let mitigations = await loadMitigations();

    // Apply filters
    if (category) {
      mitigations = mitigations.filter((m) => m.category === category);
    }

    if (effectiveness) {
      mitigations = mitigations.filter(
        (m) => m.effectiveness === effectiveness,
      );
    }

    if (search) {
      mitigations = mitigations.filter(
        (m) =>
          m.name.toLowerCase().includes(search) ||
          m.description.toLowerCase().includes(search) ||
          m.id.toLowerCase().includes(search),
      );
    }

    // Calculate pagination
    const total = mitigations.length;
    const totalPages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;
    const paginatedMitigations = mitigations.slice(offset, offset + limit);

    const response: MitigationsResponse = {
      success: true,
      mitigations: paginatedMitigations,
      total,
      categories: CATEGORIES,
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
    console.error("[API] Error fetching mitigations:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch mitigations" },
      { status: 500 },
    );
  }
}
