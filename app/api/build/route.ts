import { NextResponse } from "next/server";

import { collectBuildInfo } from "@/lib/build/build-info";

/**
 * GET /api/build — build/version + deployment metadata and the set of available
 * SBOMs, for the settings > Build panel.
 *
 * Public by design (no `requireAuth`): the same information is baked into the
 * client bundle (NEXT_PUBLIC_BUILD_*) and is useful for uptime/version probes.
 * Deployment fields are omitted for a non-deployed dev build.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(collectBuildInfo(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[Build API] failed to collect build info:", error);
    return NextResponse.json(
      { error: "Failed to collect build info" },
      { status: 500 },
    );
  }
}
