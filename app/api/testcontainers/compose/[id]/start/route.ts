/**
 * Test Containers API - Start Compose Project
 *
 * POST /api/testcontainers/compose/[id]/start - Start project
 *
 * SECURITY: requires authentication via requireAuth()
 */

import { NextResponse } from "next/server";
import {
  startComposeProject,
  checkDockerStatus,
} from "@/plugins/testcontainers/api";
import { requireAuth } from "@/lib/auth";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // Require authentication for starting a compose project
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  try {
    const { id } = await params;

    const status = await checkDockerStatus();
    if (!status.connected) {
      return NextResponse.json(
        {
          error: "Docker daemon not available",
          details: status.error,
        },
        { status: 503 },
      );
    }

    const result = await startComposeProject(id);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[Test Containers] Compose start error:", error);
    return NextResponse.json(
      { error: "Failed to start compose project", details: String(error) },
      { status: 500 },
    );
  }
}
