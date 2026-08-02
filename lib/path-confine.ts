import path from "path";
import { lstatSync, realpathSync } from "fs";

/**
 * Thrown when a resolved path escapes the confinement root. Callers should map
 * this to a 4xx (400/403), never a 500 — an escape is a rejected client input,
 * not a server fault.
 */
export class PathConfinementError extends Error {
  constructor(
    public readonly attempted: string,
    public readonly root: string,
  ) {
    super(`Path "${attempted}" escapes the confinement root: ${root}`);
    this.name = "PathConfinementError";
  }
}

/**
 * Canonicalized (lexical) path confinement.
 *
 * Joins `segments` under `root`, resolves the result with `path.resolve`
 * (lexical `.`/`..` normalization; an absolute segment replaces the root and is
 * then subject to the containment check — allowed only if it still resolves
 * within `root`, e.g. root `/workspace` + segment `/workspace/proj`, and
 * rejected otherwise), and verifies the resolved path stays within `root`. A
 * trailing-separator boundary is used so a sibling directory such as
 * `/workspace-evil` cannot masquerade as inside `/workspace`.
 *
 * Lexical resolution (not `fs.realpath`) is deliberate: write targets may not
 * exist yet, and this avoids any filesystem race / TOCTOU. Symlink resolution
 * is intentionally out of scope.
 *
 * @throws PathConfinementError if the resolved path is outside `root`.
 * @returns the resolved, confined absolute path.
 */
export function confineToRoot(root: string, ...segments: string[]): string {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(resolvedRoot, ...segments);

  const boundary = resolvedRoot.endsWith(path.sep)
    ? resolvedRoot
    : resolvedRoot + path.sep;

  if (resolvedTarget !== resolvedRoot && !resolvedTarget.startsWith(boundary)) {
    throw new PathConfinementError(segments.join(path.sep), resolvedRoot);
  }

  return resolvedTarget;
}

// --- Realpath (symlink-dereferencing) confinement (R1) ---
//
// `confineToRoot` is lexical only: a symlink INSIDE the root that points outside
// it passes the `.`/`..` normalization yet would redirect a write out of the
// root. For write routes where that matters (the workflow-editor writers), this
// second gate realpath-canonicalizes both the root and the target and re-checks
// the boundary. It mirrors the vetted walk-up technique in code-server's route
// (and lib/worktree-manager.ts): realpath the longest EXISTING ancestor
// (dereferencing parent symlinks), then re-append any not-yet-existing trailing
// segments — so a not-yet-created write target is still checked without a
// filesystem race. Fails CLOSED (throws) when canonicalization is impossible.

function nodeExists(p: string): boolean {
  try {
    lstatSync(p); // lstat: a dangling symlink counts as "exists" and stops the walk
    return true;
  } catch (err) {
    // Only a genuine ENOENT lets the walk continue to the parent. Any other
    // error (EACCES/ELOOP/ENOTDIR/…) means present-but-inaccessible → report as
    // existing so realpathSync is forced to run and throw (fail closed).
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
    return true;
  }
}

function canonicalize(p: string): string | null {
  const resolved = path.resolve(p);
  let existing = resolved;
  const trailing: string[] = [];
  while (!nodeExists(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) return null; // no existing ancestor (defensive)
    trailing.unshift(path.basename(existing));
    existing = parent;
  }
  try {
    const realAncestor = realpathSync(existing);
    return trailing.length > 0
      ? path.join(realAncestor, ...trailing)
      : realAncestor;
  } catch {
    return null; // realpath failure (EACCES / ELOOP / TOCTOU) → fail closed
  }
}

/**
 * Like {@link confineToRoot} but additionally dereferences symlinks: after the
 * lexical check passes, both root and target are realpath-canonicalized and the
 * boundary is re-verified, defeating an in-root symlink (planted before the
 * request) that redirects a write outside the root. Returns the LEXICAL confined
 * path (the caller writes there; the realpath check has already proved the
 * canonical location stays in root).
 *
 * RESIDUAL — TOCTOU (documented, matches the code-server route's accepted
 * posture, §5): this is a check-then-use gate. An authenticated user who can
 * already write in the workspace could, in a narrow race, swap a path component
 * to a symlink AFTER this check returns but BEFORE the caller's `fs.writeFile`
 * opens it, redirecting that one write outside the root. Fully closing this
 * needs atomic, symlink-refusing writes (open with `O_NOFOLLOW` / `openat`
 * relative to a dir fd) applied uniformly to the writers AND code-server —
 * tracked as a follow-up rather than a partial, inconsistent change here. The
 * gate still defeats the primary premortem-R1 vector (a symlink planted ahead of
 * time), which is the realistic case.
 *
 * @throws PathConfinementError on either a lexical escape or a realpath escape /
 *   canonicalization failure.
 */
export function confineToRealRoot(root: string, ...segments: string[]): string {
  const lexical = confineToRoot(root, ...segments);

  const realRoot = canonicalize(root);
  const realTarget = canonicalize(lexical);
  if (realRoot === null || realTarget === null) {
    throw new PathConfinementError(segments.join(path.sep), path.resolve(root));
  }

  const boundary = realRoot.endsWith(path.sep) ? realRoot : realRoot + path.sep;
  if (realTarget !== realRoot && !realTarget.startsWith(boundary)) {
    throw new PathConfinementError(segments.join(path.sep), realRoot);
  }

  return lexical;
}
