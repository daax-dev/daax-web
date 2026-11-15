/**
 * DELETE /api/ai/active-sessions/[name]
 *
 * Force-removes a `daax-*` container via `docker rm -f`. Used to evict
 * stray sessions surfaced by GET /api/ai/active-sessions.
 *
 * SECURITY: Requires auth and only accepts the exact AI session container
 * shape (`daax-<8 hex>`). A looser `daax-` prefix would also match
 * infrastructure containers like `daax-code-server`, letting this endpoint
 * force-remove them.
 */

import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { notFound } from "@/lib/tenancy/http";
import { requireOwnerOrAdmin } from "@/lib/tenancy/ownership";
import { isAiSessionName } from "@/lib/ai-session-name";
import {
  defaultDockerExec,
  dockerUnavailableJson,
  inspectContainerOwner,
  isDockerUnavailableError,
  type DockerExec,
} from "@/lib/docker-exec";

/**
 * Force-remove a single AI session container. Takes an injectable `exec`
 * (defaults to the real docker shell-out) so it can be unit-tested without
 * spawning a subprocess, matching the GET/reap routes' DockerExec seam.
 */
export async function removeSession(
  name: string,
  exec: DockerExec = defaultDockerExec,
): Promise<void> {
  await exec(["rm", "-f", name]);
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ name: string }> },
) {
  // dx#119: only the session's owner (label daax.owner) or an admin.
  const auth = await requirePrincipal("containers:write");
  if (!auth.authorized) return auth.response;

  const { name } = await context.params;

  if (!isAiSessionName(name)) {
    return NextResponse.json(
      { success: false, error: "Invalid container name" },
      { status: 400 },
    );
  }

  try {
    if (!auth.principal.admin) {
      const owned = await inspectContainerOwner(name, defaultDockerExec);
      if (!requireOwnerOrAdmin(auth.principal, owned).ok)
        return notFound("Session");
    }
    await removeSession(name);
    return NextResponse.json({ success: true, removed: name });
  } catch (error) {
    // Split deploy (F3 #100): no Docker socket on the web plane — same
    // structured 503 as /api/containers. Manual fallback: `docker rm -f <name>`.
    if (isDockerUnavailableError(error)) return dockerUnavailableJson(error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to remove container",
      },
      { status: 500 },
    );
  }
}
