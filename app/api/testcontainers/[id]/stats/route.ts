/**
 * Test Containers API - Container Stats
 *
 * GET /api/testcontainers/[id]/stats
 */

import { NextResponse } from "next/server";
import {
  getContainerStats,
  checkDockerStatus,
} from "@/plugins/testcontainers/api";
import { requirePrincipal } from "@/lib/auth";
import { testcontainerOr404 } from "@/lib/tenancy/testcontainers";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  // dx#119: owner-scoped; not-yours is a 404.
  const auth = await requirePrincipal();
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

    const stats = await getContainerStats(id);
    if (!stats) {
      return NextResponse.json(
        { error: "Container not found or stats unavailable" },
        { status: 404 },
      );
    }

    return NextResponse.json(stats);
  } catch (error) {
    console.error("[Test Containers] Stats error:", error);
    return NextResponse.json(
      { error: "Failed to get container stats", details: String(error) },
      { status: 500 },
    );
  }
}
