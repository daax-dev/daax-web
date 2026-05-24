/**
 * Test Containers API - Compose Project Route
 *
 * GET /api/testcontainers/compose/[id] - Get project details
 * DELETE /api/testcontainers/compose/[id] - Remove project
 */

import { NextResponse } from "next/server";
import {
  getComposeProject,
  removeComposeProject,
  checkDockerStatus,
} from "@/plugins/testcontainers/api";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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

    const project = await getComposeProject(id);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    return NextResponse.json({ project });
  } catch (error) {
    console.error("[Test Containers] Compose get error:", error);
    return NextResponse.json(
      { error: "Failed to get compose project", details: String(error) },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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

    const result = await removeComposeProject(id);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[Test Containers] Compose remove error:", error);
    return NextResponse.json(
      { error: "Failed to remove compose project", details: String(error) },
      { status: 500 },
    );
  }
}
