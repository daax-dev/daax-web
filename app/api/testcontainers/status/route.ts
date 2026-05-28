/**
 * Test Containers API - Docker Status Route
 *
 * GET /api/testcontainers/status - Check Docker daemon connection
 */

import { NextResponse } from "next/server";
import { checkDockerStatus } from "@/plugins/testcontainers/api";

export async function GET() {
  try {
    const status = await checkDockerStatus();
    return NextResponse.json(status);
  } catch (error) {
    console.error("[Test Containers] Status check error:", error);
    return NextResponse.json(
      {
        connected: false,
        error: String(error),
        lastCheck: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}
