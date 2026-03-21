/**
 * API Route: /api/catalog/sbom/[image]/[tag]
 *
 * Get SBOM (Software Bill of Materials) for a specific image:tag.
 * Fetches from provenance server.
 */

import { NextRequest, NextResponse } from "next/server";
import { provenanceClient } from "@/lib/provenance-client";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ image: string; tag: string }> },
) {
  try {
    const { image, tag } = await params;

    // Check if provenance server is available
    const isProvenanceAvailable = await provenanceClient.isAvailable();
    if (!isProvenanceAvailable) {
      return NextResponse.json(
        { error: "Provenance server is not available" },
        { status: 503 },
      );
    }

    // Fetch SBOM from provenance server
    const sbomDetail = await provenanceClient.getSBOM(image, tag);
    if (!sbomDetail) {
      return NextResponse.json(
        { error: "SBOM not found for this image:tag" },
        { status: 404 },
      );
    }

    return NextResponse.json(sbomDetail);
  } catch (error) {
    console.error("[API] Error fetching SBOM:", error);
    return NextResponse.json(
      { error: "Failed to fetch SBOM" },
      { status: 500 },
    );
  }
}
