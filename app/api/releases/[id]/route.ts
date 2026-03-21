import { NextRequest, NextResponse } from "next/server";
import {
  getRelease,
  updateRelease,
  deleteRelease,
  getReleaseShares,
  getFeatureSnapshots,
} from "@/lib/releases-db";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/releases/[id] - Get a single release with shares and snapshots
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const release = getRelease(id);

    if (!release) {
      return NextResponse.json({ error: "Release not found" }, { status: 404 });
    }

    const shares = getReleaseShares(id);
    const featureSnapshots = getFeatureSnapshots(id);

    return NextResponse.json({
      release,
      shares,
      featureSnapshots,
    });
  } catch (error) {
    console.error("[Releases API] Error getting release:", error);
    return NextResponse.json(
      { error: "Failed to get release" },
      { status: 500 },
    );
  }
}

// PUT /api/releases/[id] - Update a release
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json();

    const release = updateRelease(id, body);

    if (!release) {
      return NextResponse.json({ error: "Release not found" }, { status: 404 });
    }

    return NextResponse.json({ release });
  } catch (error) {
    console.error("[Releases API] Error updating release:", error);
    return NextResponse.json(
      { error: "Failed to update release" },
      { status: 500 },
    );
  }
}

// DELETE /api/releases/[id] - Delete a release
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const deleted = deleteRelease(id);

    if (!deleted) {
      return NextResponse.json({ error: "Release not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Releases API] Error deleting release:", error);
    return NextResponse.json(
      { error: "Failed to delete release" },
      { status: 500 },
    );
  }
}
