/**
 * Test Containers API - Single Container Route
 *
 * GET /api/testcontainers/[id] - Get container details
 * DELETE /api/testcontainers/[id] - Remove container
 *
 * SECURITY: DELETE operations require authentication via requireAuth()
 */

import { NextResponse } from "next/server";
import {
  getContainer,
  removeContainer,
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

    // Check Docker connection first
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

    // This endpoint intentionally surfaces connection credentials so the UI
    // can render and copy working connection strings (reveal toggle).
    const container = await getContainer(id, { includeCredentials: true });
    if (!container) {
      return NextResponse.json(
        { error: "Container not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(container);
  } catch (error) {
    console.error("[Test Containers] Get error:", error);
    return NextResponse.json(
      { error: "Failed to get container", details: String(error) },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  // dx#119: owner-scoped; not-yours is a 404.
  const auth = await requirePrincipal("containers:write");
  if (!auth.authorized) return auth.response;

  try {
    const { id } = await params;
    const denied = await testcontainerOr404(auth.principal, id);
    if (denied) return denied;
    const { searchParams } = new URL(request.url);
    const force = searchParams.get("force") === "true";

    // Check Docker connection first
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

    const result = await removeContainer(id, force);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[Test Containers] Remove error:", error);
    return NextResponse.json(
      { error: "Failed to remove container", details: String(error) },
      { status: 500 },
    );
  }
}
