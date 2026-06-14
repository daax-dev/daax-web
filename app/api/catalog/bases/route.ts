/**
 * API Route: /api/catalog/bases
 *
 * List all base images in the catalog.
 * Fetches from provenance server when available, falls back to local data.
 */

import { NextResponse } from "next/server";
import { provenanceClient } from "@/lib/provenance-client";
import { getAllBases } from "@/lib/catalog";
import type { ListBasesResponse } from "@/types/catalog";

export async function GET() {
  try {
    // Try to fetch from provenance server first
    const isProvenanceAvailable = await provenanceClient.isAvailable();

    if (isProvenanceAvailable) {
      console.log("[API] Fetching bases from provenance server");
      const bases = await provenanceClient.getBasesForUI();
      const lastSynced =
        bases.length > 0 ? bases[0].lastSyncedAt : new Date().toISOString();

      const response: ListBasesResponse = {
        bases,
        total: bases.length,
        lastSynced,
      };

      return NextResponse.json(response);
    }

    // Fallback to local catalog data
    console.log("[API] Provenance unavailable, using local catalog");
    const bases = await getAllBases();
    const lastSynced =
      bases.length > 0 ? bases[0].lastSyncedAt : new Date().toISOString();

    const response: ListBasesResponse = {
      bases,
      total: bases.length,
      lastSynced,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("[API] Error fetching bases:", error);
    return NextResponse.json(
      { error: "Failed to fetch base images" },
      { status: 500 },
    );
  }
}
