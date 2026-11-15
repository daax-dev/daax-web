/**
 * Testcontainers ownership (dx#119). Containers created through
 * /api/testcontainers carry the `daax.owner` label; compose projects carry an
 * `owner` field (and label every service container with it).
 */
import "server-only";

import type { NextResponse } from "next/server";

import { getContainer } from "@/plugins/testcontainers/api";
import { getComposeProject } from "@/plugins/testcontainers/api/compose";
import { notFound } from "./http";
import {
  ownerFromLabels,
  requireOwnerOrAdmin,
  type Principal,
} from "./ownership";

/** null when the principal may act on testcontainer `id`, else a 404. */
export async function testcontainerOr404(
  principal: Principal,
  id: string,
): Promise<NextResponse | null> {
  if (principal.admin) return null;
  let resource: { owner: string | null } | null = null;
  try {
    const c = await getContainer(id);
    resource = c ? { owner: ownerFromLabels(c.labels ?? null) } : null;
  } catch {
    resource = null;
  }
  return requireOwnerOrAdmin(principal, resource).ok
    ? null
    : notFound("Container");
}

/** null when the principal may act on compose project `id`, else a 404. */
export async function composeProjectOr404(
  principal: Principal,
  id: string,
): Promise<NextResponse | null> {
  if (principal.admin) return null;
  let resource: { owner: string | null } | null = null;
  try {
    const p = await getComposeProject(id);
    resource = p ? { owner: p.owner ?? null } : null;
  } catch {
    resource = null;
  }
  return requireOwnerOrAdmin(principal, resource).ok
    ? null
    : notFound("Project");
}
