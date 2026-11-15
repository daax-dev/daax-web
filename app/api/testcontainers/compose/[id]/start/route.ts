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
import { requirePrincipal } from "@/lib/auth";
import { composeProjectOr404 } from "@/lib/tenancy/testcontainers";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // dx#119: owner-scoped; not-yours is a 404.
  const auth = await requirePrincipal("containers:write");
  if (!auth.authorized) return auth.response;

  try {
    const { id } = await params;
    const denied = await composeProjectOr404(auth.principal, id);
    if (denied) return denied;

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
