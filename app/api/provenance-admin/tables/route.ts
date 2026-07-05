/**
 * API Route: /api/provenance-admin/tables
 *
 * List all available tables from the provenance admin API.
 */

import { NextResponse } from "next/server";

import { requireRole } from "@/lib/auth";

const PROVENANCE_API_URL =
  process.env.PROVENANCE_API_URL || "http://host.docker.internal:8080";

// Gated by requireRole('admin:db:read') (F5, #101): admin proxy to the
// provenance backend, now authorization-checked (not just authenticated). The
// local-operator bypass still applies for host-dev/proxy-less runs; an
// authenticated non-admin is 403'd and the decision is written to auth_audit.
export async function GET() {
  const auth = await requireRole("admin:db:read", {
    route: "/api/provenance-admin/tables",
  });
  if (!auth.authorized) return auth.response;
  try {
    const response = await fetch(`${PROVENANCE_API_URL}/api/v1/admin/tables`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[provenance-admin] Failed to fetch tables:", errorText);
      return NextResponse.json(
        { error: `Failed to fetch tables: ${response.status}` },
        { status: response.status },
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("[provenance-admin] Error fetching tables:", error);
    return NextResponse.json(
      { error: "Provenance server unavailable" },
      { status: 503 },
    );
  }
}
