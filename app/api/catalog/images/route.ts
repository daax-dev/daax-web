/**
 * API Route: /api/catalog/images
 *
 * List built images in the registry
 */

import { NextResponse } from "next/server";
import { getAllBuiltImages } from "@/lib/catalog";

export async function GET() {
  try {
    const images = await getAllBuiltImages();

    return NextResponse.json({
      images,
      total: images.length,
    });
  } catch (error) {
    console.error("[API] Error fetching images:", error);
    return NextResponse.json(
      { error: "Failed to fetch built images" },
      { status: 500 },
    );
  }
}
