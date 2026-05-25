/**
 * Test Containers API - Restart Container
 *
 * POST /api/testcontainers/[id]/restart
 *
 * SECURITY: Requires authentication via requireAuth()
 */

import { NextResponse } from "next/server";
import {
  restartContainer,
  checkDockerStatus,
} from "@/plugins/testcontainers/api";
import { requireAuth } from "@/lib/auth";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(_request: Request, { params }: RouteParams) {
  // Require authentication for container operations
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  try {
    const { id } = await params;

    const status = await checkDockerStatus();
    if (!status.connected) {
      return NextResponse.json(
        { error: "Docker daemon not available", details: status.error },
        { status: 503 },
      );
    }

    const result = await restartContainer(id);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[Test Containers] Restart error:", error);
    return NextResponse.json(
      { error: "Failed to restart container", details: String(error) },
      { status: 500 },
    );
  }
}
