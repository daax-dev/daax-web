/**
 * GET /api/cyber/safe-mcp/techniques/[id]
 *
 * Returns full details for a specific technique.
 */

import { NextResponse } from "next/server";
import type { TechniqueResponse } from "@/plugins/mcp-security/types";
import { loadTechniques } from "../../_lib/data-loader";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const techniques = await loadTechniques();
    const technique = techniques.find((t) => t.id === id);

    if (!technique) {
      return NextResponse.json(
        { success: false, error: `Technique ${id} not found` },
        { status: 404 },
      );
    }

    const response: TechniqueResponse = {
      success: true,
      technique,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("[API] Error fetching technique:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch technique" },
      { status: 500 },
    );
  }
}
