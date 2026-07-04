/**
 * Volume source validation for testcontainers bind mounts.
 *
 * A caller-supplied `volumes[].source` becomes a Docker bind-mount source
 * (`HostConfig.Binds`). Without validation this lets a caller mount ANY host
 * directory — including the Docker socket — into a container they control
 * (issue #190, finding H5). This module confines every host-path source to the
 * operator-configured workspace root and explicitly denies sensitive host paths.
 *
 * Layering (defense-in-depth):
 *   1. Denylist FIRST, independent of the allowlist, so a misconfigured
 *      workspace root (e.g. accidentally set to "/") cannot re-expose the Docker
 *      socket or other sensitive host paths.
 *   2. Allowlist: the canonicalized (realpath) source must resolve UNDER the
 *      workspace root. Reuses `isValidPath()` / `resolveWorkspaceRoot()` from
 *      `lib/worktree-manager` (merged #189: realpath walk-up, trailing-sep
 *      boundary, fail-closed) which also performs the host↔container namespace
 *      mapping via translatePath(), so the SAME check works in host mode
 *      (expandPath(basePath)) and container mode (HOST_WORKSPACE_PATH→/workspace).
 *
 * The original `source` string is what callers pass into the bind spec — it is
 * NOT rewritten here. In container mode the HOST daemon resolves the bind source,
 * so the verbatim host path must be preserved; validation only accepts/rejects.
 */

import { realpathSync } from "fs";
import { resolve } from "path";
import { isValidPath, resolveWorkspaceRoot } from "@/lib/worktree-manager";
import type { VolumeMount } from "../types";

/**
 * Docker named-volume reference (e.g. "pgdata", "my_data"). A named volume is a
 * daemon-managed volume, NOT a host path — it cannot mount a host directory, so
 * it is exempt from host-path confinement. Matches Docker's volume-name rules.
 */
const NAMED_VOLUME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/;

/**
 * Host paths that must NEVER be a bind source, regardless of the workspace-root
 * allowlist. Exact "/" plus prefixes covering the Docker daemon state and other
 * obvious sensitive mounts. Applied to the canonicalized (realpath) source.
 */
const DENIED_EXACT = new Set(["/"]);
const DENIED_PREFIXES = [
  "/etc",
  "/root",
  "/proc",
  "/sys",
  "/boot",
  "/dev",
  "/var/run",
  "/run",
  "/var/lib/docker",
];

/**
 * Canonicalize a source path for denylist comparison. Follows symlinks via
 * realpath where the path exists; falls back to a lexical absolute resolve for
 * paths that do not exist yet (the denylist matches on name/prefix, so a
 * non-existent "/var/run/docker.sock" is still caught).
 */
function canonicalizeForDenylist(source: string): string {
  try {
    return realpathSync(source);
  } catch {
    return resolve(source);
  }
}

/**
 * True if the (canonicalized) source is an explicitly denied sensitive host path
 * — the Docker socket, filesystem root, or a Docker/system state directory.
 */
export function isDeniedSource(source: string): boolean {
  const canonical = canonicalizeForDenylist(source);

  if (DENIED_EXACT.has(canonical)) {
    return true;
  }

  // Any docker.sock, at any location (e.g. /var/run/docker.sock, /run/docker.sock).
  if (canonical === "/docker.sock" || canonical.endsWith("/docker.sock")) {
    return true;
  }

  return DENIED_PREFIXES.some(
    (prefix) => canonical === prefix || canonical.startsWith(prefix + "/"),
  );
}

export interface VolumeSourceValidation {
  valid: boolean;
  /** Human-readable rejection reason (safe to surface in a 400 response). */
  reason?: string;
}

/**
 * Validate a single volume `source`. Named Docker volumes are accepted as-is;
 * every host-path source must pass the denylist AND resolve under the workspace
 * root. Fails CLOSED.
 *
 * @param source - The volume source (host path or Docker named volume).
 * @param workspaceRoot - Confinement root; defaults to resolveWorkspaceRoot().
 */
export function validateVolumeSource(
  source: string,
  workspaceRoot: string = resolveWorkspaceRoot(),
): VolumeSourceValidation {
  if (typeof source !== "string" || source.length === 0) {
    return { valid: false, reason: "Volume source must be a non-empty string" };
  }

  // Non-absolute sources: a Docker named volume is exempt (not a host path);
  // anything else (relative "./x", "../x") is rejected — it is not a valid
  // confined host source and relative binds are not supported.
  if (!source.startsWith("/")) {
    if (NAMED_VOLUME_PATTERN.test(source)) {
      return { valid: true };
    }
    return {
      valid: false,
      reason: `Relative volume sources are not allowed: ${source}`,
    };
  }

  // Denylist FIRST (defense-in-depth, independent of the allowlist).
  if (isDeniedSource(source)) {
    return {
      valid: false,
      reason: `Volume source is a denied sensitive host path: ${source}`,
    };
  }

  // Allowlist: canonicalized source must resolve under the workspace root.
  if (!isValidPath(source, workspaceRoot)) {
    return {
      valid: false,
      reason: `Volume source is outside the workspace root: ${source}`,
    };
  }

  return { valid: true };
}

/**
 * Validate every volume source in a request. Rejects the WHOLE set on the first
 * bad source (no partial acceptance / no partial container creation).
 */
export function validateVolumes(
  volumes: VolumeMount[] | undefined,
  workspaceRoot: string = resolveWorkspaceRoot(),
): VolumeSourceValidation {
  for (const volume of volumes || []) {
    const result = validateVolumeSource(volume?.source, workspaceRoot);
    if (!result.valid) {
      return result;
    }
  }
  return { valid: true };
}
