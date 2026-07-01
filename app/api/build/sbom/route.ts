import { NextRequest, NextResponse } from "next/server";

import { requireAuth } from "@/lib/auth";
import {
  SBOM_COMPONENTS,
  SBOM_FORMATS,
  readSbom,
} from "@/lib/build/build-info";

/**
 * GET /api/build/sbom?component=app&format=cyclonedx&inline=1
 *
 * Serves a whitelisted SBOM document for the settings > Build panel.
 *   - Unauthenticated (strict mode)  → 401.
 *   - Unknown component/format       → 400 (with the valid options).
 *   - Not bundled / placeholder      → 404 (graceful "no SBOM in this build").
 *   - Read error / oversize / format mismatch → 500 (server/config problem).
 *   - Otherwise                      → 200 application/json, downloaded as
 *     daax-<component>-<format>.json (attachment unless `inline` is truthy).
 *
 * Requires auth (build/SBOM detail is not public). The (component, format) pair
 * is resolved through a closed whitelist and the file path is symlink-contained,
 * so no request input reaches the filesystem.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TRUTHY = new Set(["1", "true", "yes", "on"]);

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  const { searchParams } = request.nextUrl;
  const component = searchParams.get("component") || "app";
  const format = searchParams.get("format") || "cyclonedx";
  const inline = TRUTHY.has((searchParams.get("inline") || "").toLowerCase());

  if (
    !SBOM_COMPONENTS.includes(component as (typeof SBOM_COMPONENTS)[number]) ||
    !SBOM_FORMATS.includes(format as (typeof SBOM_FORMATS)[number])
  ) {
    return NextResponse.json(
      {
        error: "unknown SBOM component/format",
        components: SBOM_COMPONENTS,
        formats: SBOM_FORMATS,
      },
      { status: 400 },
    );
  }

  const result = readSbom(component, format);
  if (!result.ok) {
    // Placeholder / absent → 404 (expected graceful path); anything else is a
    // server-side problem (read error, oversize, or a misconfigured slot).
    if (result.reason === "not-found" || result.reason === "placeholder") {
      return NextResponse.json(
        {
          available: false,
          component,
          format,
          note: "No such SBOM bundled in this build. Run 'bun run sbom:generate'.",
        },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { error: "Failed to read SBOM", reason: result.reason },
      { status: 500 },
    );
  }

  const disposition = inline ? "inline" : "attachment";
  return new NextResponse(result.content, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
      "Content-Disposition": `${disposition}; filename="daax-${component}-${format}.json"`,
    },
  });
}
