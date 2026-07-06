/**
 * RBAC permission catalog + role→permission resolution (F5 — issue #101).
 *
 * Permissions are a CODE catalog scoped to daax's own surface (docs/brain2daax.md
 * §3 F5) — there is intentionally no `role_permissions` DB table; roles and
 * user_roles are DB tables, the permission mapping is code (AC1 explicitly allows
 * an in-code catalog). Keeping the mapping in code means a permission rename is a
 * type-checked refactor rather than a data migration.
 *
 * This module is framework-agnostic (no Next / `server-only` imports) so it runs
 * identically under Next, `tsx`, `bun`, and Vitest, and the pure resolution
 * functions are directly unit-testable.
 */

/**
 * The `resource:action` permission catalog for daax-web's surface.
 *
 * ENFORCEMENT STATUS (be precise — the catalog must not imply protection that
 * does not exist):
 *   - ENFORCED today (a route calls `requireRole` with it):
 *       admin:db:read   — provenance-admin table/actions LIST + row/schema reads
 *       admin:db:write  — provenance-admin table row create/update/delete
 *       admin:users:read  — admin-UI gating (settings/provenance admin surface)
 *       admin:users:write — provenance-admin action mutations
 *   - FORWARD-LOOKING (declared for the model but NOT yet gated at any route;
 *     the corresponding routes are still `requireAuth`-only). Do NOT assume a
 *     holder is restricted by these until the route enforcement lands:
 *       terminal:exec, containers:write, mcp:manage, recording:write, settings:write
 * See ENFORCED_PERMISSIONS below for the machine-readable set.
 */
export const PERMISSIONS = Object.freeze([
  // Forward-looking (not yet enforced at routes).
  "terminal:exec",
  "containers:write",
  "mcp:manage",
  "recording:write",
  "settings:write",
  // Enforced (a route calls requireRole with these).
  "admin:users:read",
  "admin:users:write",
  "admin:db:read",
  "admin:db:write",
] as const);

export type Permission = (typeof PERMISSIONS)[number];

/**
 * The subset of {@link PERMISSIONS} that is actually enforced at a route today.
 * Everything else in the catalog is forward-looking (declared for the RBAC model
 * but the route is still `requireAuth`-only), so a permission's presence in the
 * catalog does NOT by itself mean the surface is access-controlled.
 */
export const ENFORCED_PERMISSIONS: readonly Permission[] = Object.freeze([
  "admin:users:read",
  "admin:users:write",
  "admin:db:read",
  "admin:db:write",
]);

/** The default role granted on a genuine JIT insert (docs §3 F5). */
export const DEFAULT_ROLE = "user";

/** The privileged role bootstrapped from the admin allow-list / reconcile. */
export const ADMIN_ROLE = "admin";

/**
 * The single permission that marks a user as "admin" for privileged-UI gating
 * (retiring NEXT_PUBLIC_ADMIN_MODE). Admin surfaces (settings admin tab,
 * provenance admin) route their visibility through this permission.
 */
export const ADMIN_UI_PERMISSION: Permission = "admin:users:read";

/**
 * Static role→permission mapping. `admin` intentionally receives every
 * permission (full administrative access). `user` receives the non-privileged
 * baseline. Unknown roles resolve to no permissions.
 *
 * Frozen so a caller cannot mutate the catalog at runtime.
 */
export const ROLE_PERMISSIONS: Readonly<Record<string, readonly Permission[]>> =
  Object.freeze({
    [ADMIN_ROLE]: PERMISSIONS,
    [DEFAULT_ROLE]: Object.freeze([
      "terminal:exec",
      "containers:write",
      "recording:write",
    ]) as readonly Permission[],
  });

/** True when a single role grants the given permission. */
export function roleHasPermission(role: string, perm: Permission): boolean {
  return (ROLE_PERMISSIONS[role] ?? []).includes(perm);
}

/**
 * True when ANY of the supplied roles grants the permission. This is the core
 * authorization decision used by `requireRole()`.
 */
export function rolesGrantPermission(
  roles: readonly string[],
  perm: Permission,
): boolean {
  return roles.some((r) => roleHasPermission(r, perm));
}

/** All permissions the supplied roles collectively grant (deduped, sorted). */
export function permissionsForRoles(roles: readonly string[]): Permission[] {
  const set = new Set<Permission>();
  for (const r of roles) {
    for (const p of ROLE_PERMISSIONS[r] ?? []) set.add(p);
  }
  return [...set].sort();
}

/** True when the supplied roles grant the admin-UI gating permission. */
export function rolesAreAdmin(roles: readonly string[]): boolean {
  return rolesGrantPermission(roles, ADMIN_UI_PERMISSION);
}
