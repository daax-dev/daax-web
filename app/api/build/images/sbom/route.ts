import { NextRequest, NextResponse } from "next/server";

import { requireAuth } from "@/lib/auth";
import { isKnownImageRef } from "@/lib/build/images";
import { generateRealSbom } from "@/lib/sbom-syft";
import { checkSbom } from "@/lib/sbom-guard";

/**
 * GET /api/build/images/sbom?ref=<image>&inline=1
 *
 * Generates (via syft) and returns the CycloneDX SBOM for one of the known
 * container images (settings > Build panel per-image SBOM).
 *   - Unauthenticated (strict mode) → 401.
 *   - `ref` missing / not whitelisted → 400.
 *   - Image not present / syft failed → 404 (graceful).
 *   - Otherwise → 200 application/json.
 *
 * `ref` MUST be one of the closed known-image set (isKnownImageRef): syft is run
 * as `docker run … docker:<ref>`, so an arbitrary ref would be an unauthenticated
 * (well, authenticated) command surface. The whitelist prevents scanning
 * attacker-chosen images. Results are cached in-process by ref.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TRUTHY = new Set(["1", "true", "yes", "on"]);
const cache = new Map<string, string>();

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  const { searchParams } = request.nextUrl;
  const ref = searchParams.get("ref") || "";
  const inline = TRUTHY.has((searchParams.get("inline") || "").toLowerCase());

  if (!ref || !isKnownImageRef(ref)) {
    return NextResponse.json(
      { error: "unknown or missing image ref" },
      { status: 400 },
    );
  }

  let content = cache.get(ref) ?? null;
  if (!content) {
    try {
      content = await generateRealSbom(ref);
    } catch (error) {
      console.error(`[Build Images SBOM] syft failed for ${ref}:`, error);
      return NextResponse.json(
        { error: "Failed to generate SBOM" },
        { status: 500 },
      );
    }
    // generateRealSbom returns null when the image is absent or syft fails or
    // the output doesn't pass the placeholder-vs-real guard.
    if (!content || !checkSbom(content).real) {
      return NextResponse.json(
        {
          available: false,
          ref,
          note: "SBOM unavailable — image not present locally or syft could not scan it.",
        },
        { status: 404 },
      );
    }
    cache.set(ref, content);
  }

  const filename = `daax-image-${ref.replace(/[^a-zA-Z0-9._-]+/g, "_")}.cyclonedx.json`;
  const disposition = inline ? "inline" : "attachment";
  return new NextResponse(content, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
      "Content-Disposition": `${disposition}; filename="${filename}"`,
    },
  });
}
