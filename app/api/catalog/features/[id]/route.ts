/**
 * API Route: /api/catalog/features/[id]
 *
 * Get a specific feature by ID
 */

import { NextResponse } from "next/server";
import { getFeatureById } from "@/lib/catalog";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const feature = await getFeatureById(id);

    if (!feature) {
      return NextResponse.json({ error: "Feature not found" }, { status: 404 });
    }

    return NextResponse.json(feature);
  } catch (error) {
    console.error("[API] Error fetching feature:", error);
    return NextResponse.json(
      { error: "Failed to fetch feature" },
      { status: 500 },
    );
  }
}
