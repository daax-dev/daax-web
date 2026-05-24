/**
 * Test Containers API - Compose Route
 *
 * GET /api/testcontainers/compose - List compose projects
 * POST /api/testcontainers/compose - Create compose project
 */

import { NextResponse } from "next/server";
import {
  listComposeProjects,
  createComposeProject,
  checkDockerStatus,
} from "@/plugins/testcontainers/api";
import type { ComposeCreateRequest } from "@/plugins/testcontainers/types/compose";

export async function GET() {
  try {
    // Check Docker connection first
    const status = await checkDockerStatus();
    if (!status.connected) {
      return NextResponse.json(
        {
          error: "Docker daemon not available",
          details: status.error,
          hint: "Make sure Docker is running and accessible",
        },
        { status: 503 },
      );
    }

    const result = await listComposeProjects();
    return NextResponse.json(result);
  } catch (error) {
    console.error("[Test Containers] Compose list error:", error);
    return NextResponse.json(
      { error: "Failed to list compose projects", details: String(error) },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    // Check Docker connection first
    const status = await checkDockerStatus();
    if (!status.connected) {
      return NextResponse.json(
        {
          error: "Docker daemon not available",
          details: status.error,
          hint: "Make sure Docker is running and accessible",
        },
        { status: 503 },
      );
    }

    const body: ComposeCreateRequest = await request.json();

    // Validate required fields
    if (!body.name) {
      return NextResponse.json(
        { error: "Project name is required" },
        { status: 400 },
      );
    }
    if (!body.yaml) {
      return NextResponse.json(
        { error: "YAML content is required" },
        { status: 400 },
      );
    }

    const result = await createComposeProject(body);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("[Test Containers] Compose create error:", error);
    return NextResponse.json(
      { error: "Failed to create compose project", details: String(error) },
      { status: 500 },
    );
  }
}
