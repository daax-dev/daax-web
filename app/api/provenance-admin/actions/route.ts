import { NextResponse } from "next/server";

const PROVENANCE_API_URL =
  process.env.PROVENANCE_API_URL || "http://host.docker.internal:8080";

/**
 * GET /api/provenance-admin/actions
 * List available admin actions
 */
export async function GET() {
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
