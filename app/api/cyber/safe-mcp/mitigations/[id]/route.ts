/**
 * GET /api/cyber/safe-mcp/mitigations/[id]
 *
 * Returns full details for a specific mitigation.
 */

import { NextResponse } from "next/server";
import type { MitigationResponse } from "@/plugins/mcp-security/types";
import { loadMitigations } from "../../_lib/data-loader";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const mitigations = await loadMitigations();
    const mitigation = mitigations.find((m) => m.id === id);

    if (!mitigation) {
      return NextResponse.json(
        { success: false, error: `Mitigation ${id} not found` },
        { status: 404 },
      );
    }

    const response: MitigationResponse = {
      success: true,
      mitigation,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("[API] Error fetching mitigation:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch mitigation" },
      { status: 500 },
    );
  }
}
