/**
 * Pure auth-audit logic (F4, #96), separated from the Bun CLI
 * (audit-auth-routes.ts) so it can be unit-tested under Vitest without the
 * shebang / `bun` glob import.
 */

export const WRITE_METHODS = ["POST", "PUT", "PATCH", "DELETE"];

export interface RouteInfo {
  path: string;
  methods: string[];
  hasRequireAuth: boolean;
  protectedMethods: string[];
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
