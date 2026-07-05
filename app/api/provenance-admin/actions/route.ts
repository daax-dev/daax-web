import { NextResponse } from "next/server";

import { requireRole } from "@/lib/auth";

const PROVENANCE_API_URL =
  process.env.PROVENANCE_API_URL || "http://host.docker.internal:8080";

/**
 * GET /api/provenance-admin/actions
 * List available admin actions
 *
 * RBAC-gated (F5, #101): requires `admin:db:read`, so a logged-in non-admin
 * can no longer enumerate admin actions. Keeps the LOCAL_OPERATOR bypass for
 * host-dev/proxy-less runs and fails CLOSED (403) when Postgres is unconfigured;
 * set DAAX_REQUIRE_AUTH=1 (+ DAAX_PROXY_SECRET) for strict auth in production.
 */
export async function GET() {
  const auth = await requireRole("admin:db:read", {
    route: "/api/provenance-admin/actions",
  });
  if (!auth.authorized) return auth.response;
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
