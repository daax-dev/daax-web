import { NextResponse } from "next/server";

import { requireAuth } from "@/lib/auth";

const PROVENANCE_API_URL =
  process.env.PROVENANCE_API_URL || "http://host.docker.internal:8080";

/**
 * GET /api/provenance-admin/actions
 * List available admin actions
 *
 * Gated by requireAuth (F4, #96): this admin proxy to the provenance backend
 * now requires authentication. Per the auth gate, requireAuth bypasses to a
 * trusted LOCAL_OPERATOR when no forwarded identity is present and
 * DAAX_REQUIRE_AUTH!=1 (host-dev / proxy-less); set DAAX_REQUIRE_AUTH=1 to
 * enforce strict auth in production. RBAC (requireRole) lands in F5 (#101).
 */
export async function GET() {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;
  try {
    const response = await fetch(`${PROVENANCE_API_URL}/api/v1/admin/actions`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json(
        { error: text || "Failed to fetch actions" },
        { status: response.status },
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Provenance API error:", error);
    return NextResponse.json(
      { error: "Provenance server unavailable" },
      { status: 503 },
    );
  }
}
