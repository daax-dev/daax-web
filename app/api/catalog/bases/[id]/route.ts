/**
 * API Route: /api/catalog/bases/[id]
 *
 * Get a specific base image by ID
 */

import { NextResponse } from "next/server";
import { getBaseById } from "@/lib/catalog";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const base = getBaseById(id);

    if (!base) {
      return NextResponse.json(
        { error: "Base image not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(base);
  } catch (error) {
    console.error("[API] Error fetching base:", error);
    return NextResponse.json(
      { error: "Failed to fetch base image" },
      { status: 500 },
    );
  }
}
