/**
 * Per-tenant bind-mount boundary for the testcontainers / compose APIs
 * (dx#119). The plugin's own validator (volume-validation.ts) confines every
 * host source to the SHARED workspace root; for a non-admin this adds:
 *   - the admin-set `mountRoot` (the same boundary the terminal enforces);
 *   - never a source inside `<workspace>/.daax` (credential stores);
 *   - never a source that CONTAINS `.daax` (the workspace root or an alias of
 *     it — testcontainers get no tmpfs shadow).
 * All checks are canonical (realpath) via isValidPath, so symlinks cannot
 * dodge them.
 *
 * Docker named volumes (non-absolute sources) are not host paths, but they
 * have no owner either: a name can be another tenant's volume or daax's own
 * (its Postgres data, the shared recordings / worktree-owner state). So a
 * non-admin may not mount a named volume at all; admins may.
 */
import "server-only";

import { join } from "path";

import { isValidPath, resolveWorkspaceRoot } from "@/lib/worktree-manager";
import type { Principal } from "./ownership";
import { getEffectiveSettings } from "./settings-store";

interface HostSource {
  source?: unknown;
}

/** null when every source is allowed for the principal, else the reason. */
export async function tenantVolumeViolation(
  principal: Principal,
  volumes: readonly HostSource[] | undefined | null,
): Promise<string | null> {
  if (principal.admin || !Array.isArray(volumes) || volumes.length === 0) {
    return null;
  }
  const root = resolveWorkspaceRoot();
  let base = root;
  if (principal.subject) {
    try {
      const { settings } = await getEffectiveSettings(principal.subject);
      if (settings.mountRoot) base = join(root, settings.mountRoot);
    } catch {
      return "Server-side settings unavailable; volumes refused";
    }
  }
  const daax = join(root, ".daax");
  for (const v of volumes) {
    const source = typeof v?.source === "string" ? v.source : "";
    if (!source) continue; // anonymous volume: fresh, nobody else's
    if (!source.startsWith("/")) {
      // Named volume: no owner to check against, so refused.
      return `Named volumes are admin-only: ${source}`;
    }
    // Both: a tenant base symlinked outside the workspace must not widen it.
    if (!isValidPath(source, base) || !isValidPath(source, root)) {
      return `Volume source is outside your workspace: ${source}`;
    }
    if (isValidPath(source, daax) || isValidPath(daax, source)) {
      return `Volume source exposes credential stores: ${source}`;
    }
  }
  return null;
}
