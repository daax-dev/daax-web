/**
 * API Route: /api/catalog/builds/[id]/jobs
 *
 * List all jobs for a build spec
 */

import { NextResponse } from "next/server";
import { getBuildSpecById, getJobsForSpec } from "@/lib/catalog";

export async function GET(
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

    const jobs = await getJobsForSpec(id);

    return NextResponse.json({ jobs, total: jobs.length });
  } catch (error) {
    console.error("[API] Error fetching jobs:", error);
    return NextResponse.json(
      { error: "Failed to fetch build jobs" },
      { status: 500 },
    );
  }
}
