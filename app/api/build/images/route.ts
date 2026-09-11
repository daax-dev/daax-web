import { NextResponse } from "next/server";

import { requireAuth } from "@/lib/auth";
import { getDocker, dockerUnavailableResponse } from "@/lib/host-docker";
import { collectImages } from "@/lib/build/images";

/**
 * GET /api/build/images — the container images of the running stack (every
 * container in this compose project, or all running containers outside
 * compose) plus the images daax is built on and uses (runtime base,
 * platform/tool images, devcontainer base catalog), each with its resolved
 * sha256 digest and local presence, for the settings > Build panel.
 *
 * Requires auth (same rationale as /api/build). Digests are resolved live from
 * the Docker daemon; images not present locally report present:false. When the
 * daemon itself is unreachable this returns a 503 (not a list of everything
 * "not pulled"), so the UI can distinguish "Docker down" from "image absent".
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;
  // Distinguish an unreachable daemon (503) from genuinely-absent images.
  const docker = getDocker();
  const unavailable = await dockerUnavailableResponse(docker);
  if (unavailable) return unavailable;
  try {
    const images = await collectImages(docker);
    return NextResponse.json(
      { images },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[Build Images API] failed to collect images:", error);
    return NextResponse.json(
      { error: "Failed to collect images" },
      { status: 500 },
    );
  }
}
