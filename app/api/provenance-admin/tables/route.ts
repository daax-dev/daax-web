/**
 * API Route: /api/provenance-admin/tables
 *
 * List all available tables from the provenance admin API.
 */

import { NextResponse } from "next/server";

const PROVENANCE_API_URL =
  process.env.PROVENANCE_API_URL || "http://host.docker.internal:8080";

export async function GET() {
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
