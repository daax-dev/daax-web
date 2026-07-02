import { NextResponse } from "next/server";

import { requireAuth } from "@/lib/auth";
import { collectBuildInfo } from "@/lib/build/build-info";

/**
 * GET /api/build — build/version + deployment metadata and the set of available
 * SBOMs, for the settings > Build panel.
 *
 * Requires auth: the payload includes commit SHA, hostname, deploying user, and
 * deployment surface — not something to expose unauthenticated. In local/non-
 * strict mode `requireAuth` bypasses to the local operator, so `bun dev` is
 * unaffected; when `DAAX_REQUIRE_AUTH=1` it returns 401 to anonymous callers.
 * (Liveness probes use the public /api/health, not this route.)
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;
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
