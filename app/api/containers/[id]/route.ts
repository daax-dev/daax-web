/**
 * /api/containers/[id]
 *
 * GET    → inspect a host Docker container (sanitized detail subset).
 * DELETE → remove a host Docker container (force-removes running ones).
 *
 * GET is guarded by requireAuth() because `docker inspect` exposes env
 * vars / labels that can carry secrets. DELETE is a destructive mutating
 * action and is likewise guarded. Acts on HOST containers.
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getDocker, dockerUnavailableResponse } from "@/lib/host-docker";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  const docker = getDocker();
  const unavailable = await dockerUnavailableResponse(docker);
  if (unavailable) return unavailable;

  try {
    const { id } = await params;
    const info = await docker.getContainer(id).inspect();

    // Return a sanitized subset. Env and labels are deliberately omitted —
    // they frequently carry secrets (tokens, registry creds, auth keys) and
    // the inspect view in the UI does not render them.
    const detail = {
      id: info.Id.substring(0, 12),
      name: info.Name?.replace(/^\//, "") || info.Id.substring(0, 12),
      image: info.Config?.Image || "",
      state: info.State?.Status || "",
      status: info.State?.Status || "",
      running: Boolean(info.State?.Running),
      startedAt: info.State?.StartedAt || "",
      createdAt: info.Created || "",
      restartCount: info.RestartCount ?? 0,
      command: info.Config?.Cmd?.join(" ") || info.Path || "",
      entrypoint: Array.isArray(info.Config?.Entrypoint)
        ? info.Config.Entrypoint.join(" ")
        : info.Config?.Entrypoint || "",
      workingDir: info.Config?.WorkingDir || "",
      restartPolicy: info.HostConfig?.RestartPolicy?.Name || "",
      networks: Object.keys(info.NetworkSettings?.Networks || {}),
      mounts: (info.Mounts || []).map((m) => ({
        source: m.Source,
        destination: m.Destination,
        mode: m.Mode,
        rw: m.RW,
      })),
    };

    return NextResponse.json(detail);
  } catch (error) {
    console.error("[Containers] Inspect error:", error);
    const isNotFound =
      error instanceof Error && /no such container/i.test(error.message);
    return NextResponse.json(
      {
        error: isNotFound
          ? "Container not found"
          : "Failed to inspect container",
        details: String(error),
      },
      { status: isNotFound ? 404 : 500 },
    );
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  const docker = getDocker();
  const unavailable = await dockerUnavailableResponse(docker);
  if (unavailable) return unavailable;

  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    // Default to force so a running container can be removed in one action;
    // the UI confirms first via dialog. Pass ?force=false to require stop.
    const force = searchParams.get("force") !== "false";
    await docker.getContainer(id).remove({ force });
    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error("[Containers] Remove error:", error);
    return NextResponse.json(
      { error: "Failed to remove container", details: String(error) },
      { status: 500 },
    );
  }
}
