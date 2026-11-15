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
import { requirePrincipal } from "@/lib/auth";
import { testcontainerOr404 } from "@/lib/tenancy/testcontainers";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(_request: Request, { params }: RouteParams) {
  // dx#119: owner-scoped; not-yours is a 404.
  const auth = await requirePrincipal("containers:write");
  if (!auth.authorized) return auth.response;

  try {
    const { id } = await params;
    const denied = await testcontainerOr404(auth.principal, id);
    if (denied) return denied;

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
