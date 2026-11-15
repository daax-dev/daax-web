/**
 * POST /api/containers/[id]/stop
 *
 * Stops a host Docker container. Mutating action — guarded by requireAuth().
 */

import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { containerOr404 } from "@/lib/tenancy/http";
import { getDocker, dockerUnavailableResponse } from "@/lib/host-docker";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(_request: Request, { params }: RouteParams) {
  // dx#119: owner-scoped (label daax.owner); not-yours is a 404.
  const auth = await requirePrincipal("containers:write");
  if (!auth.authorized) return auth.response;

  const docker = getDocker();
  const unavailable = await dockerUnavailableResponse(docker);
  if (unavailable) return unavailable;

  try {
    const { id } = await params;
    const denied = await containerOr404(auth.principal, docker, id);
    if (denied) return denied;
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
