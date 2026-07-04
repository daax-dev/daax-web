import path from "path";

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
 * (lexical `.`/`..` normalization; absolute segments replace the root, which is
 * then caught by the containment check), and verifies the resolved path stays
 * within `root`. A trailing-separator boundary is used so a sibling directory
 * such as `/workspace-evil` cannot masquerade as inside `/workspace`.
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
