/**
 * HTTP-side tenancy helpers (dx#119): the 404 contract and owner lookups for
 * the resource kinds the routes act on. Decisions themselves live in
 * ./ownership.ts; this module only fetches the owner and shapes responses.
 */
import "server-only";

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { NextResponse } from "next/server";
import type Docker from "dockerode";

import { RECORDINGS_DIR } from "@/server/config/constants";
import { isValidRecordingId } from "@/server/recording/recorder";
import {
  ownerFromLabels,
  requireOwnerOrAdmin,
  type Owned,
  type Principal,
} from "./ownership";

/** The single not-yours / not-found response. */
export function notFound(what = "Resource"): NextResponse {
  return NextResponse.json({ error: `${what} not found` }, { status: 404 });
}

/** 403 for an admin-only surface (no resource to hide). */
export function adminOnly(): NextResponse {
  return NextResponse.json(
    { error: "Forbidden", message: "Admin access required" },
    { status: 403 },
  );
}

/** null when allowed, else the 404 to return. */
export function ownedOr404(
  principal: Principal,
  resource: Owned | null | undefined,
  what?: string,
): NextResponse | null {
  return requireOwnerOrAdmin(principal, resource).ok ? null : notFound(what);
}

// ---- recordings -----------------------------------------------------------

/**
 * A recording as an owned resource, from its `.json` metadata. null when the
 * id is invalid or there is no metadata. A `.cast` without metadata has no
 * recorded owner: `{ owner: null }` (admins only).
 */
export function recordingResource(id: string): Owned | null {
  if (!isValidRecordingId(id)) return null;
  const metaPath = join(RECORDINGS_DIR, `${id}.json`);
  if (!existsSync(metaPath)) {
    return existsSync(join(RECORDINGS_DIR, `${id}.cast`))
      ? { owner: null }
      : null;
  }
  try {
    const meta = JSON.parse(readFileSync(metaPath, "utf-8")) as Owned;
    return { owner: typeof meta.owner === "string" ? meta.owner : null };
  } catch {
    return { owner: null };
  }
}

/** null when the principal may act on recording `id`, else a 404. */
export function recordingOr404(
  principal: Principal,
  id: string,
): NextResponse | null {
  // Admins act on every recording; the route's own not-found path applies.
  if (principal.admin) return null;
  return ownedOr404(principal, recordingResource(id), "Recording");
}

// ---- containers -----------------------------------------------------------

/** A docker container as an owned resource (via its daax.owner label). */
export async function containerResource(
  docker: Docker,
  id: string,
): Promise<Owned | null> {
  try {
    const info = await docker.getContainer(id).inspect();
    return { owner: ownerFromLabels(info.Config?.Labels ?? null) };
  } catch {
    return null;
  }
}

/** null when the principal may act on container `id`, else a 404. */
export async function containerOr404(
  principal: Principal,
  docker: Docker,
  id: string,
): Promise<NextResponse | null> {
  if (principal.admin) return null; // admins: no lookup needed
  return ownedOr404(
    principal,
    await containerResource(docker, id),
    "Container",
  );
}
