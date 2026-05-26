/**
 * GET /api/containers/[id]/logs
 *
 * Returns recent logs for a host Docker container as text/plain.
 *
 * Auth: guarded by requireAuth(). Unlike the testcontainers logs route
 * (scoped to managed containers), this exposes logs for ARBITRARY host
 * containers, which can contain secrets — so it is treated as sensitive
 * and requires authentication.
 *
 * Query params:
 *   tail=<n>  → number of trailing lines (default 200, max 2000)
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getDocker, dockerUnavailableResponse } from "@/lib/host-docker";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  const docker = getDocker();
  const unavailable = await dockerUnavailableResponse(docker);
  if (unavailable) return unavailable;

  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const tailParam = parseInt(searchParams.get("tail") || "200", 10);
    const tail = Number.isFinite(tailParam)
      ? Math.min(2000, Math.max(1, tailParam))
      : 200;

    // dockerode returns a Buffer when follow:false. Multiplexed streams from
    // non-TTY containers carry an 8-byte header per frame; demux to strip it.
    const buf = (await docker.getContainer(id).logs({
      stdout: true,
      stderr: true,
      tail,
      timestamps: true,
      follow: false,
    })) as unknown as Buffer;

    const text = demuxDockerLogs(buf);
    return new NextResponse(text, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (error) {
    console.error("[Containers] Logs error:", error);
    return NextResponse.json(
      { error: "Failed to get container logs", details: String(error) },
      { status: 500 },
    );
  }
}

/**
 * Strip docker's 8-byte stream-multiplexing headers from a non-TTY log
 * buffer. Each frame is [streamType(1), 0,0,0, size(4 BE)] followed by
 * `size` payload bytes. TTY containers emit raw bytes with no header; for
 * those, the heuristic below falls back to returning the buffer as-is.
 */
function demuxDockerLogs(buf: Buffer): string {
  if (!buf || buf.length === 0) return "";
  const parts: Buffer[] = [];
  let offset = 0;
  while (offset + 8 <= buf.length) {
    const streamType = buf[offset];
    // Valid stream types are 0 (stdin), 1 (stdout), 2 (stderr). Anything
    // else means this isn't a multiplexed stream (TTY) — bail to raw.
    const hasReservedBytes =
      buf[offset + 1] === 0 && buf[offset + 2] === 0 && buf[offset + 3] === 0;
    if (streamType > 2 || !hasReservedBytes) {
      return buf.toString("utf-8");
    }
    const size = buf.readUInt32BE(offset + 4);
    const start = offset + 8;
    const end = start + size;
    if (end > buf.length) break;
    parts.push(buf.subarray(start, end));
    offset = end;
  }
  if (parts.length === 0) return buf.toString("utf-8");
  return Buffer.concat(parts).toString("utf-8");
}
