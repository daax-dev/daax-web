/**
 * Pure auth-audit logic (F4, #96), separated from the Bun CLI
 * (audit-auth-routes.ts) so it can be unit-tested under Vitest without the
 * shebang / `bun` glob import.
 */

export const WRITE_METHODS = ["POST", "PUT", "PATCH", "DELETE"];

/**
 * A real auth-guard CALL site. Recognises `requireAuth(`, `requireAuthOrThrow(`,
 * and `requireRole(` (F5, #101). `requireRole` is STRONGER than `requireAuth` —
 * it requires authentication AND a role — so a route guarded by it is guarded.
 * No `g` flag, so `.test()` is stateless and safe to reuse.
 */
export const AUTH_GUARD_CALL_RE =
  /(?:requireAuth(?:OrThrow)?|requireRole)\s*\(/;

/** An import line that brings in an auth guard (`requireAuth*` or `requireRole`). */
export const AUTH_GUARD_IMPORT_RE = /import\s+.*require(?:Auth|Role).*from/;

export interface RouteInfo {
  path: string;
  methods: string[];
  /** True when the file wires an auth guard (requireAuth/OrThrow or requireRole). */
  hasRequireAuth: boolean;
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
  const hasAuthGuard =
    AUTH_GUARD_IMPORT_RE.test(content) && AUTH_GUARD_CALL_RE.test(content);

  const protectedMethods: string[] = [];
  if (hasAuthGuard) {
    for (const method of methods) {
      const funcPattern = new RegExp(
        `export\\s+(?:async\\s+)?function\\s+${method}\\b[\\s\\S]*?(?=export\\s+(?:async\\s+)?function|$)`,
      );
      const funcMatch = content.match(funcPattern);
      if (funcMatch && AUTH_GUARD_CALL_RE.test(funcMatch[0])) {
        protectedMethods.push(method);
      }
    }
  }
  return { hasAuthGuard, protectedMethods };
}

/**
 * A route is an "unprotected write" if it exposes a write method that is NOT
 * covered by requireAuth. This is checked per-method (via protectedMethods), so
 * a route that guards GET but leaves POST open is still flagged — a file-level
 * "has any requireAuth" check would miss that partial-guard case.
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
