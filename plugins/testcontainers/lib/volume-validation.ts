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

import { lstatSync, realpathSync } from "fs";
import { basename, dirname, join, resolve } from "path";
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
 * Expand a list of denied prefixes into the union of each literal prefix and
 * its realpath variant.
 *
 * `isDeniedSource` compares against the CANONICALIZED (realpath) source
 * produced by `canonicalizeForDenylist`, but `DENIED_PREFIXES` above are
 * literal strings. On hosts where a system path is itself a symlink (e.g.
 * macOS: `/etc` -> `/private/etc`, `/var` -> `/private/var`), a canonicalized
 * source under `/etc` becomes `/private/etc/...` and would silently miss the
 * literal `/etc` prefix — reopening the defense-in-depth gap this module
 * exists to close (#190 Copilot review). This aliasing is NOT macOS-only: on
 * Linux `/var/run` is commonly a symlink to `/run` (systemd), so a
 * canonicalized source under `/var/run` becomes `/run/...` and would likewise
 * miss the literal `/var/run` prefix (both `/var/run` and `/run` are in the
 * denylist, and the tests assert this pairing). Adding the realpath variant to
 * the set closes the gap on every OS and stays a no-op only where a prefix is
 * not itself a symlink (its realpath equals the literal).
 *
 * Exported (pure, no I/O side effects beyond the realpath lookup) so tests can
 * exercise the union logic directly with synthetic symlinks, independent of
 * whatever aliasing the CI host's real system paths happen to have.
 *
 * @param prefixes - Literal denied-prefix strings.
 */
export function canonicalizeDeniedPrefixSet(
  prefixes: readonly string[],
): Set<string> {
  const set = new Set<string>();
  for (const prefix of prefixes) {
    set.add(prefix);
    try {
      const real = realpathSync(prefix);
      if (real !== prefix) {
        set.add(real);
      }
    } catch {
      // Prefix does not exist on this host (e.g. no /boot in a minimal
      // container). Keep just the literal — nothing to alias.
    }
  }
  return set;
}

// Computed ONCE at module load (not per request): the prefixes are a fixed,
// small, hardcoded list, and none of the underlying paths are expected to
// change identity while the process is running.
const DENIED_PREFIX_SET: ReadonlySet<string> =
  canonicalizeDeniedPrefixSet(DENIED_PREFIXES);

/**
 * Existence check that does NOT follow symlinks (lstat, not existsSync). Returns
 * true when the path NODE itself exists — including a dangling symlink whose
 * target is missing. existsSync would return false for that dangling link (it
 * stats the target), so the walk-up below would skip PAST the symlink segment and
 * re-append its name lexically — the exact denylist bypass this avoids.
 */
function pathExistsNoFollow(p: string): boolean {
  try {
    lstatSync(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Canonicalize a source path for denylist comparison.
 *
 * A purely lexical `resolve(source)` fallback (for paths that do not exist yet)
 * is UNSAFE: it leaves symlinks in EXISTING ANCESTOR segments un-dereferenced. A
 * source like `/tmp/link/newdir` where `/tmp/link -> /etc` and `newdir` does not
 * exist would resolve lexically to `/tmp/link/newdir` and MISS the `/etc` denied
 * prefix (#190 Copilot defense-in-depth gap). To close that, resolve the LONGEST
 * EXISTING ANCESTOR via realpath (dereferencing any parent symlinks), then
 * re-append the peeled-off non-existent trailing segments lexically — the same
 * walk-up technique as lib/worktree-manager's canonicalizePath, implemented
 * locally here.
 *
 * The "exists" check during the walk-up MUST NOT follow symlinks (uses lstat, so
 * a DANGLING symlink stops the walk at the symlink node instead of being skipped;
 * the realpath below then throws on the missing target and this fails CLOSED).
 *
 * Returns `null` when canonicalization cannot be performed — no existing ancestor
 * found (defensive; root always exists), or realpath on the existing ancestor
 * throws (EACCES / ELOOP / dangling-symlink ancestor / a TOCTOU race). Callers
 * MUST treat `null` as DENIED, never silently allow.
 */
function canonicalizeForDenylist(source: string): string | null {
  const resolved = resolve(source);
  let existing = resolved;
  const trailing: string[] = [];
  while (!pathExistsNoFollow(existing)) {
    const parent = dirname(existing);
    if (parent === existing) {
      // Reached the filesystem root without an existing ancestor. Root always
      // exists, so this is defensive; fail closed rather than fall back to the
      // un-dereferenced lexical form.
      return null;
    }
    trailing.unshift(basename(existing));
    existing = parent;
  }
  try {
    const realAncestor = realpathSync(existing);
    return trailing.length > 0 ? join(realAncestor, ...trailing) : realAncestor;
  } catch {
    // realpath failed (EACCES / ELOOP / dangling-symlink ancestor / TOCTOU).
    // Fail closed: do NOT return the lexical `resolved` form, which would leave
    // ancestor symlinks un-dereferenced and reopen the denylist bypass.
    return null;
  }
}

/**
 * True if the (canonicalized) source is an explicitly denied sensitive host path
 * — the Docker socket, filesystem root, or a Docker/system state directory.
 *
 * Fails CLOSED: if the source cannot be canonicalized (see canonicalizeForDenylist
 * returning `null`), it is treated as DENIED rather than allowed.
 */
export function isDeniedSource(source: string): boolean {
  const canonical = canonicalizeForDenylist(source);

  // Fail closed: a source we cannot canonicalize is treated as denied, never
  // silently allowed through the denylist.
  if (canonical === null) {
    return true;
  }

  if (DENIED_EXACT.has(canonical)) {
    return true;
  }

  // Any docker.sock, at any location (e.g. /var/run/docker.sock, /run/docker.sock).
  if (canonical === "/docker.sock" || canonical.endsWith("/docker.sock")) {
    return true;
  }

  for (const prefix of DENIED_PREFIX_SET) {
    if (canonical === prefix || canonical.startsWith(prefix + "/")) {
      return true;
    }
  }
  return false;
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
 *
 * Fails CLOSED on malformed input rather than throwing: `volumes` is caller
 * (request-body) supplied and its shape is not guaranteed at runtime despite the
 * `VolumeMount[]` type. A non-array `volumes` (e.g. a JSON object) is not
 * iterable and would otherwise throw a TypeError out of the `for...of` loop,
 * which callers (the API route) would surface as a 500 instead of a 400 (#190
 * Copilot review). A malformed individual entry (`null`, a non-object, or an
 * object with a non-string `source`) is likewise rejected — never thrown —
 * because `validateVolumeSource` already treats a non-string source as invalid.
 */
export function validateVolumes(
  volumes: VolumeMount[] | undefined,
  workspaceRoot: string = resolveWorkspaceRoot(),
): VolumeSourceValidation {
  if (volumes === undefined || volumes === null) {
    return { valid: true };
  }

  if (!Array.isArray(volumes)) {
    return {
      valid: false,
      reason: "Volumes must be an array of volume mounts",
    };
  }

  for (const volume of volumes) {
    // Optional chaining is safe here even when `volume` is `null` or a
    // non-object primitive (e.g. a bare number/string entry) — it never
    // throws, it simply yields `undefined`, which `validateVolumeSource`
    // already rejects as a non-string source.
    const result = validateVolumeSource(
      (volume as VolumeMount | null | undefined)?.source as string,
      workspaceRoot,
    );
    if (!result.valid) {
      return result;
    }
  }
  return { valid: true };
}
