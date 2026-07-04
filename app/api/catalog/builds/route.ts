/**
 * API Route: /api/catalog/builds
 *
 * List and create build specifications
 */

import { NextResponse } from "next/server";
import { getAllBuildSpecs, createBuildSpec } from "@/lib/catalog";
import type { ListBuildsResponse, BuildSpec } from "@/types/catalog";
import { requireAuth } from "@/lib/auth";

export async function GET() {
  try {
    const builds = await getAllBuildSpecs();

    const response: ListBuildsResponse = {
      builds,
      total: builds.length,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("[API] Error fetching builds:", error);
    return NextResponse.json(
      { error: "Failed to fetch build specs" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  // Build spec creation requires authentication (#197)
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  // Attribution is derived from the authenticated user, never from the client
  // body — an authenticated caller must not be able to spoof `createdBy` (#197).
  const createdBy = auth.user.username ?? "anonymous";

  try {
    const body = await request.json();

    // Validate required fields
    if (!body.name || !body.base || !body.output) {
      return NextResponse.json(
        { error: "Missing required fields: name, base, output" },
        { status: 400 },
      );
    }

    const spec: Omit<BuildSpec, "id" | "createdAt" | "updatedAt"> = {
      name: body.name,
      description: body.description,
      base: body.base,
      features: body.features || [],
      customizations: body.customizations,
      output: body.output,
      createdBy,
    };

    const created = await createBuildSpec(spec);

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("[API] Error creating build spec:", error);
    return NextResponse.json(
      { error: "Failed to create build spec" },
      { status: 500 },
    );
  }
}
