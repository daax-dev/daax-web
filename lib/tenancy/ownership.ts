/**
 * Tenancy: ownership + permission decisions (issue dx#119).
 *
 * The ONE place that decides "may this principal see / act on this resource".
 * Every owner-scoped surface calls it: the HTTP routes (via `requirePrincipal`
 * in `lib/auth.ts`), the terminal server's WS plane (via the signed ticket
 * claims), and any future session store — the substrate backend's actor store
 * is expected to call `requireOwnerOrAdmin(principal, { owner })` on every
 * get/attach/suspend/resume/end.
 *
 * Rules:
 *   - An admin sees and acts on everything.
 *   - A non-admin sees and acts only on resources whose `owner` equals their
 *     owner key. Anything else is reported as NOT FOUND (404), never 403, so a
 *     user cannot probe for the existence of another tenant's resources.
 *   - A resource with no owner (created before this change) belongs to the
 *     admins: non-admins never see it.
 *
 * Framework-agnostic on purpose (no Next, no `server-only`, no I/O): the
 * terminal server imports it outside Next, and it is unit-testable as pure
 * functions.
 */
import type { Permission } from "../rbac/permissions";

/** Docker label carrying a container's owner key. */
export const OWNER_LABEL = "daax.owner";

/** Owner key recorded for the local-operator bypass, which has no subject. */
export const OPERATOR_OWNER = "local";

/** The authenticated caller, as far as authorization is concerned. */
export interface Principal {
  /** Trusted, canonical subject (Pocket ID UUID); null for the operator. */
  subject: string | null;
  /** The local-operator bypass (host-dev / explicitly trusted posture). */
  operator: boolean;
  /** Holds the admin role (sees and acts on every tenant's resources). */
  admin: boolean;
  /** Effective permissions from the caller's roles. */
  permissions: readonly Permission[];
}

/** Anything that records who owns it. */
export interface Owned {
  owner?: string | null;
}

export type OwnershipDecision =
  | { ok: true }
  | { ok: false; status: 404; reason: string };

/**
 * The key a principal's resources are stamped with: the subject, or
 * {@link OPERATOR_OWNER} for the operator bypass. Returns null when the
 * principal has neither (must not create owned resources).
 */
export function ownerKeyFor(principal: Principal): string | null {
  if (principal.subject) return principal.subject;
  if (principal.operator) return OPERATOR_OWNER;
  return null;
}

/** True when the principal holds the permission. */
export function hasPermission(principal: Principal, perm: Permission): boolean {
  return principal.permissions.includes(perm);
}

/** Normalize an owner value read back from storage (labels, JSON, files). */
export function normalizeOwnerLabel(
  owner: string | null | undefined,
): string | null {
  const v = typeof owner === "string" ? owner.trim() : "";
  return v === "" ? null : v.toLowerCase();
}

/** True when the principal may see / act on the resource. */
export function canAccessOwned(principal: Principal, resource: Owned): boolean {
  if (principal.admin) return true;
  const owner = normalizeOwnerLabel(resource.owner);
  if (owner === null) return false; // legacy / unowned → admins only
  const mine = ownerKeyFor(principal);
  return mine !== null && owner === mine.toLowerCase();
}

/**
 * The reusable gate. Call it before returning or mutating any owned resource:
 *
 *   const d = requireOwnerOrAdmin(principal, resource);
 *   if (!d.ok) return 404;
 *
 * A missing resource should be passed as `null` so "absent" and "not yours"
 * produce the identical decision.
 */
export function requireOwnerOrAdmin(
  principal: Principal,
  resource: Owned | null | undefined,
): OwnershipDecision {
  if (!resource) return { ok: false, status: 404, reason: "not-found" };
  if (canAccessOwned(principal, resource)) return { ok: true };
  return { ok: false, status: 404, reason: "not-owner" };
}

/** Keep only the items the principal may see. */
export function filterOwned<T>(
  principal: Principal,
  items: readonly T[],
  ownerOf: (item: T) => string | null | undefined,
): T[] {
  if (principal.admin) return [...items];
  return items.filter((item) =>
    canAccessOwned(principal, { owner: ownerOf(item) }),
  );
}

/**
 * Filesystem-safe directory name for an owner key (per-user credential dirs).
 * UUIDs and simple keys pass through lowercased; anything else is hex-encoded
 * so it can never contain a separator, `..`, or a NUL.
 */
export function ownerDirName(owner: string): string {
  const v = owner.trim().toLowerCase();
  if (/^[a-z0-9][a-z0-9_-]{0,127}$/.test(v)) return v;
  return `x-${Buffer.from(owner, "utf8").toString("hex").slice(0, 200)}`;
}

/**
 * Parse docker's `{{json .}}` `Labels` field ("k=v,k2=v2") or a dockerode
 * `Labels` object into a lookup of the owner label.
 */
export function ownerFromLabels(
  labels: string | Record<string, string> | null | undefined,
): string | null {
  if (!labels) return null;
  if (typeof labels === "object")
    return normalizeOwnerLabel(labels[OWNER_LABEL]);
  for (const pair of labels.split(",")) {
    const eq = pair.indexOf("=");
    if (eq > 0 && pair.slice(0, eq).trim() === OWNER_LABEL) {
      return normalizeOwnerLabel(pair.slice(eq + 1));
    }
  }
  return null;
}
