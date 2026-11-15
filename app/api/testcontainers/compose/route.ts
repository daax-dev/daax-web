/**
 * Test Containers API - Compose Route
 *
 * GET /api/testcontainers/compose - List compose projects
 * POST /api/testcontainers/compose - Create compose project
 *
 * SECURITY: POST operations require authentication via requireAuth()
 */

import { NextResponse } from "next/server";
import {
  listComposeProjects,
  createComposeProject,
  checkDockerStatus,
} from "@/plugins/testcontainers/api";
import type { ComposeCreateRequest } from "@/plugins/testcontainers/types/compose";
import { requirePrincipal } from "@/lib/auth";
import { tenantVolumeViolation } from "@/lib/tenancy/volumes";
import { parseComposeYaml } from "@/plugins/testcontainers/lib/compose-parser";
import { filterOwned, ownerKeyFor } from "@/lib/tenancy/ownership";

export async function GET() {
  const auth = await requirePrincipal();
  if (!auth.authorized) return auth.response;

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
    // dx#119: a non-admin lists only their own projects.
    const projects = filterOwned(
      auth.principal,
      result.projects,
      (p) => p.owner,
    );
    return NextResponse.json({ ...result, projects, total: projects.length });
  } catch (error) {
    console.error("[Test Containers] Compose list error:", error);
    return NextResponse.json(
      { error: "Failed to list compose projects", details: String(error) },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  // Require authentication for compose project creation
  const auth = await requirePrincipal("containers:write");
  if (!auth.authorized) return auth.response;

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

    // dx#119: every service's binds stay inside the caller's mount boundary
    // and away from the .daax credential stores (checked before anything is
    // stored or started). An unparseable YAML is left to the create call.
    if (!auth.principal.admin) {
      let services: { volumes?: { source?: unknown }[] }[] = [];
      try {
        services = parseComposeYaml(body.yaml, body.name).services;
      } catch {
        services = [];
      }
      for (const service of services) {
        const violation = await tenantVolumeViolation(
          auth.principal,
          service.volumes,
        );
        if (violation) {
          return NextResponse.json({ error: violation }, { status: 400 });
        }
      }
    }

    const result = await createComposeProject({
      ...body,
      // dx#119: owner comes from the authenticated caller, never the body.
      owner: ownerKeyFor(auth.principal) ?? undefined,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("[Test Containers] Compose create error:", error);
    return NextResponse.json(
      { error: "Failed to create compose project", details: String(error) },
      { status: 500 },
    );
  }
}
