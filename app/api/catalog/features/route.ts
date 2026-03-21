/**
 * API Route: /api/catalog/features
 *
 * List all features in the catalog
 */

import { NextResponse } from "next/server";
import { getAllFeatures } from "@/lib/catalog";
import type {
  ListFeaturesResponse,
  FeatureCategory,
  FEATURE_CATEGORY_CONFIG,
} from "@/types/catalog";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");
    const baseId = searchParams.get("baseId");

    let features = getAllFeatures();

    // Filter by category if specified
    if (category) {
      features = features.filter((f) => f.category === category);
    }

    // Filter by base compatibility if specified
    if (baseId) {
      features = features.filter((f) => {
        // If no compatibility specified, it's compatible with all
        if (
          (!f.compatibleBases || f.compatibleBases.length === 0) &&
          (!f.incompatibleBases || f.incompatibleBases.length === 0)
        ) {
          return true;
        }

        // Check incompatible list
        if (f.incompatibleBases && f.incompatibleBases.includes(baseId)) {
          return false;
        }

        // Check compatible list (if specified)
        if (f.compatibleBases && f.compatibleBases.length > 0) {
          return f.compatibleBases.includes(baseId);
        }

        return true;
      });
    }

    // Get unique categories
    const categories = [
      ...new Set(features.map((f) => f.category)),
    ] as FeatureCategory[];

    const response: ListFeaturesResponse = {
      features,
      total: features.length,
      categories,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("[API] Error fetching features:", error);
    return NextResponse.json(
      { error: "Failed to fetch features" },
      { status: 500 },
    );
  }
}
