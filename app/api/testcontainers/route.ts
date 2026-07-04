/**
 * Test Containers API - Main Route
 *
 * GET /api/testcontainers - List containers
 * POST /api/testcontainers - Create container
 *
 * SECURITY: POST operations require authentication via requireAuth()
 */

import { NextResponse } from "next/server";
import {
  listContainers,
  createContainer,
  checkDockerStatus,
} from "@/plugins/testcontainers/api";
import type { ContainerCreateRequest } from "@/plugins/testcontainers/types";
import { requireAuth } from "@/lib/auth";
import { isValidDockerImageName } from "@/lib/docker-validation";
import { validateVolumes } from "@/plugins/testcontainers/lib/volume-validation";

export async function GET(request: Request) {
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

    const { searchParams } = new URL(request.url);
    const filter = {
      status: searchParams.get("status") || undefined,
      project: searchParams.get("project") || undefined,
      search: searchParams.get("search") || undefined,
    };
    const page = parseInt(searchParams.get("page") || "1", 10);
    const pageSize = parseInt(searchParams.get("pageSize") || "50", 10);

    const result = await listContainers(filter, page, pageSize);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[Test Containers] List error:", error);
    return NextResponse.json(
      { error: "Failed to list containers", details: String(error) },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  // Require authentication for container creation
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

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

    // `request.json()` throws on a malformed body. For an input-validation
    // endpoint that is a client error, not a server fault — return a 400
    // (matching app/api/docker/pull) instead of letting the outer catch turn
    // it into a 500 (#190 Copilot review).
    let body: ContainerCreateRequest;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON in request body" },
        { status: 400 },
      );
    }

    // `request.json()` parses the JSON literals `null`, `123`, `"str"`, `[]`
    // without throwing, leaving `body` as a non-object. Dereferencing
    // `body.image` on those would throw a TypeError caught by the outer catch
    // and surface as a 500. Reject a non-object body up front with a controlled
    // 400 (Copilot review on #190).
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json(
        { error: "Request body must be a JSON object" },
        { status: 400 },
      );
    }

    // Validate required fields
    if (!body.image) {
      return NextResponse.json({ error: "Image is required" }, { status: 400 });
    }

    // `body` is only TYPED as ContainerCreateRequest — JSON.parse gives no
    // runtime guarantee, and RegExp#test() (used by isValidDockerImageName)
    // coerces its argument via ToString(), so a non-string `image`/`tag`
    // (e.g. `image: 123` -> "123") could otherwise coerce into a string that
    // passes the pattern. Reject non-string image/tag explicitly, before any
    // validation/use, with no container created (Copilot review on #190).
    if (typeof body.image !== "string") {
      return NextResponse.json(
        { error: "Image must be a string" },
        { status: 400 },
      );
    }
    if (body.tag !== undefined && typeof body.tag !== "string") {
      return NextResponse.json(
        { error: "Tag must be a string" },
        { status: 400 },
      );
    }
    // Treat `tag` by PRESENCE (`!== undefined`), not truthiness: an explicitly
    // provided empty-string tag `""` is INVALID and must be rejected, not
    // silently treated as "no tag". Only an omitted (`undefined`) tag means
    // "no tag provided" (Copilot review on #190).
    if (body.tag !== undefined && body.tag.trim() === "") {
      return NextResponse.json(
        { error: "Tag must be a non-empty string" },
        { status: 400 },
      );
    }

    // Validate image name format (same pattern as app/api/docker/pull). Also
    // validate the fully-qualified image:tag reference (imageRef) so a
    // crafted tag cannot slip through. `tag` presence is checked with
    // `!== undefined` (an empty string was already rejected above).
    const imageRef =
      body.tag !== undefined ? `${body.image}:${body.tag}` : body.image;
    if (
      !isValidDockerImageName(body.image) ||
      (body.tag !== undefined && !isValidDockerImageName(imageRef))
    ) {
      return NextResponse.json(
        { error: "Invalid image name format" },
        { status: 400 },
      );
    }

    // Confine every volume source to the workspace root and deny sensitive host
    // paths (Docker socket, "/", etc.). Reject the WHOLE request if any source
    // is bad — no container is created (#190).
    const volumeCheck = validateVolumes(body.volumes);
    if (!volumeCheck.valid) {
      return NextResponse.json(
        { error: volumeCheck.reason || "Invalid volume source" },
        { status: 400 },
      );
    }

    const result = await createContainer(body);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("[Test Containers] Create error:", error);
    return NextResponse.json(
      { error: "Failed to create container", details: String(error) },
      { status: 500 },
    );
  }
}
