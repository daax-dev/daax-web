/**
 * API Route: /api/catalog/builds/[id]/jobs/[jobId]
 *
 * Get status of a specific build job
 */

import { NextResponse } from "next/server";
import { getJobById } from "@/lib/catalog";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; jobId: string }> },
) {
  try {
    const { jobId } = await params;
    const job = await getJobById(jobId);

    if (!job) {
      return NextResponse.json(
        { error: "Build job not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ job });
  } catch (error) {
    console.error("[API] Error fetching job:", error);
    return NextResponse.json(
      { error: "Failed to fetch build job" },
      { status: 500 },
    );
  }
}
