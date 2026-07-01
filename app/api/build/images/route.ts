import { NextResponse } from "next/server";

import { requireAuth } from "@/lib/auth";
import { collectImages } from "@/lib/build/images";

/**
 * GET /api/build/images — the container images daax is built on and uses
 * (runtime base, platform/tool images, devcontainer base catalog), each with
 * its resolved sha256 digest and local presence, for the settings > Build panel.
 *
 * Requires auth (same rationale as /api/build). Digests are resolved live from
 * the Docker daemon; images not present locally report present:false.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;
  try {
    const images = await collectImages();
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
