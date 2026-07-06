/**
 * Pure auth-audit logic (F4, #96), separated from the Bun CLI
 * (audit-auth-routes.ts) so it can be unit-tested under Vitest without the
 * shebang / `bun` glob import.
 */

export const WRITE_METHODS = ["POST", "PUT", "PATCH", "DELETE"];

/**
 * A real auth-guard CALL site. Recognises an AWAITED invocation of
 * `requireAuth(`, `requireAuthOrThrow(`, `requireRole(`, or `requireSuperAdmin(`
 * (F5, #101). `requireRole`/`requireSuperAdmin` are STRONGER than `requireAuth` —
 * they require authentication AND a role — so a route guarded by one is guarded.
 *
 * SECURITY: the `\bawait\s+` prefix is load-bearing. `stripCommentsAndStrings()`
 * removes comments and string literals but NOT regex literals, so a bare
 * `requireRole(` token inside a regex literal (e.g. `/requireRole\s*\(/`) would
 * otherwise be miscounted as a guard call and let an unprotected write route slip
 * past the audit gate. Every real guard in this codebase is invoked as
 * `await requireAuth(...)` / `await requireRole(...)` / `await requireSuperAdmin(...)`,
 * so requiring the `await` prefix excludes regex-literal (and other bare-token)
 * false positives without losing any genuine call site.
 * No `g` flag, so `.test()` is stateless and safe to reuse.
 */
export const AUTH_GUARD_CALL_RE =
  /\bawait\s+(?:requireAuth(?:OrThrow)?|requireRole|requireSuperAdmin)\s*\(/;

/**
 * An import statement that brings in an auth guard (`requireAuth*` or
 * `requireRole`). Uses `[^;]*?` (not `.`) between `import` and `from` so it
 * spans NEWLINES — a multiline `import {\n  requireAuth,\n} from "..."` block is
 * matched — while the negated `;` keeps it bounded to a single import statement,
 * so it cannot greedily swallow across an intervening statement terminator.
 */
export const AUTH_GUARD_IMPORT_RE =
  /import\s+[^;]*?require(?:Auth|Role|SuperAdmin)[^;]*?from/;

/**
 * Strip line comments, block comments, and string/template literal CONTENT from
 * a source string, replacing each stripped span with a single space so token
 * boundaries (and line count, roughly) are preserved.
 *
 * SECURITY: without this, a guard mentioned only in a comment or a string
 * literal (e.g. `// TODO: requireRole()` or `"call requireRole() here"`) would
 * satisfy `AUTH_GUARD_CALL_RE` and let an unprotected write route slip past the
 * audit gate misclassified as guarded. A real guard is always live code, never
 * a comment/string, so stripping these can only make detection STRICTER — it
 * never hides a genuine `requireRole(`/`requireAuth(` call site. The walker is
 * string-aware so a `//` or guard mention inside a real string does not, in
 * turn, swallow subsequent live code.
 */
export function stripCommentsAndStrings(src: string): string {
  let out = "";
  const n = src.length;
  let i = 0;
  while (i < n) {
    const c = src[i];
    const next = src[i + 1];
    // Line comment: skip to end of line.
    if (c === "/" && next === "/") {
      while (i < n && src[i] !== "\n") i++;
      out += " ";
      continue;
    }
    // Block comment: skip to closing */.
    if (c === "/" && next === "*") {
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i += 2;
      out += " ";
      continue;
    }
    // String / template literal: skip content, honoring backslash escapes.
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      i++;
      while (i < n) {
        if (src[i] === "\\") {
          i += 2;
          continue;
        }
        if (src[i] === quote) {
          i++;
          break;
        }
        i++;
      }
      out += " ";
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

export interface RouteInfo {
  path: string;
  methods: string[];
  /** True when the file wires an auth guard (requireAuth/OrThrow, requireRole, or requireSuperAdmin). */
  hasAuthGuard: boolean;
  protectedMethods: string[];
}

export interface RouteAuth {
  hasAuthGuard: boolean;
  protectedMethods: string[];
}

/**
 * Detect, from a route file's source, whether it wires an auth guard and which
 * exported HTTP methods are individually guarded.
 *
 * Mirrors the auditor's exact call-pattern: an auth guard counts only when it is
 * both IMPORTED and CALLED (`guard(`) inside the method body — a mere mention in
 * a comment/string does not count, so a doc-comment reference is still flagged.
 * `requireRole` is treated as equivalent to (stronger than) `requireAuth`, so
 * RBAC-gated routes are not falsely reported as unprotected.
 */
export function detectRouteAuth(content: string, methods: string[]): RouteAuth {
  // Match against code only: a guard mentioned in a comment or string literal
  // must NOT count as an invoked guard (else an unprotected write route could
  // be misclassified as guarded and slip past the gate).
  const code = stripCommentsAndStrings(content);

  const hasAuthGuard =
    AUTH_GUARD_IMPORT_RE.test(code) && AUTH_GUARD_CALL_RE.test(code);

  const protectedMethods: string[] = [];
  if (hasAuthGuard) {
    for (const method of methods) {
      const funcPattern = new RegExp(
        `export\\s+(?:async\\s+)?function\\s+${method}\\b[\\s\\S]*?(?=export\\s+(?:async\\s+)?function|$)`,
      );
      const funcMatch = code.match(funcPattern);
      if (funcMatch && AUTH_GUARD_CALL_RE.test(funcMatch[0])) {
        protectedMethods.push(method);
      }
    }
  }
  return { hasAuthGuard, protectedMethods };
}

/**
 * A route is an "unprotected write" if it exposes a write method that is NOT
 * covered by an auth guard (requireAuth/requireRole/requireSuperAdmin). This is
 * checked per-method (via protectedMethods), so a route that guards GET but
 * leaves POST open is still flagged — a file-level "has any auth guard" check
 * would miss that partial-guard case.
 */
export function isUnprotectedWriteRoute(route: RouteInfo): boolean {
  return route.methods.some(
    (m) => WRITE_METHODS.includes(m) && !route.protectedMethods.includes(m),
  );
}

/**
 * Compute the auth-drift result against the accepted baseline:
 *  - offenders: unprotected-write routes NOT in the allowlist → fail CI.
 *  - stale: allowlist entries that are no longer unprotected writes (fixed or
 *    removed) → warn only, so legit cleanup never breaks CI.
 */
export function computeAuthDrift(
  routes: RouteInfo[],
  allowlist: string[],
): { unprotectedWrites: string[]; offenders: string[]; stale: string[] } {
  const allow = new Set(allowlist);
  const unprotectedWrites = routes
    .filter(isUnprotectedWriteRoute)
    .map((r) => r.path);
  const current = new Set(unprotectedWrites);
  const offenders = unprotectedWrites.filter((p) => !allow.has(p));
  const stale = allowlist.filter((p) => !current.has(p));
  return { unprotectedWrites, offenders, stale };
}
