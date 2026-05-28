/**
 * POST /api/containers/[id]/stop
 *
 * Stops a host Docker container. Mutating action — guarded by requireAuth().
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getDocker, dockerUnavailableResponse } from "@/lib/host-docker";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(_request: Request, { params }: RouteParams) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  const docker = getDocker();
  const unavailable = await dockerUnavailableResponse(docker);
  if (unavailable) return unavailable;

  try {
    const { id } = await params;
    await docker.getContainer(id).stop();
    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error("[Containers] Stop error:", error);
    return NextResponse.json(
      { error: "Failed to stop container", details: String(error) },
      { status: 500 },
    );
  }
}
