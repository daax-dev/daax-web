/**
 * API Route: /api/catalog/builds/[id]/start
 *
 * Start a build job for a spec
 */

import { NextResponse } from "next/server";
import { getBuildSpecById, createBuildJob } from "@/lib/catalog";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    // Verify the spec exists
    const spec = await getBuildSpecById(id);
    if (!spec) {
      return NextResponse.json(
        { error: "Build spec not found" },
        { status: 404 },
      );
    }

    // Create a new build job
    const job = await createBuildJob(id);

    // In a real implementation, we would trigger the actual build process here
    // For now, we just return the queued job

    return NextResponse.json({ job }, { status: 201 });
  } catch (error) {
    console.error("[API] Error starting build:", error);
    return NextResponse.json(
      { error: "Failed to start build" },
      { status: 500 },
    );
  }
}
