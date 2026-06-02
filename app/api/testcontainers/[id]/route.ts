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
import { requireAuth } from "@/lib/auth";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;

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
  // Require authentication for container removal
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  try {
    const { id } = await params;
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
