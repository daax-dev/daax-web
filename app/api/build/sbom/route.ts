import { NextRequest, NextResponse } from "next/server";

import {
  SBOM_COMPONENTS,
  SBOM_FORMATS,
  readRealSbom,
} from "@/lib/build/build-info";

/**
 * GET /api/build/sbom?component=app&format=cyclonedx&inline=1
 *
 * Serves a whitelisted SBOM document for the settings > Build panel.
 *   - Unknown component/format  → 400 (with the valid options).
 *   - Not bundled / placeholder → 404 (graceful "no SBOM in this build").
 *   - Otherwise                 → 200 application/json, downloaded as
 *     daax-<component>-<format>.json (attachment unless `inline` is truthy).
 *
 * Public by design (matches /api/build). The (component, format) pair is
 * resolved through a closed whitelist, so no request input reaches the path.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TRUTHY = new Set(["1", "true", "yes", "on"]);

export async function GET(request: NextRequest) {
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

  let content: string | null;
  try {
    content = readRealSbom(component, format);
  } catch (error) {
    console.error("[Build SBOM API] failed to read SBOM:", error);
    return NextResponse.json({ error: "Failed to read SBOM" }, { status: 500 });
  }

  if (!content) {
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

  const disposition = inline ? "inline" : "attachment";
  return new NextResponse(content, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
      "Content-Disposition": `${disposition}; filename="daax-${component}-${format}.json"`,
    },
  });
}
