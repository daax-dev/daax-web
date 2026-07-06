import "server-only";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

// Import the client-safe types/constants once, then re-export the same bindings
// so the public surface and internal use share a single source.
import type { AuthUser } from "./auth-types";
import { UNAUTHENTICATED_USER } from "./auth-types";

// Single source of truth for the forward-auth trust decision. The pure
// evaluator lives in ./auth-trust so the SAME logic backs both these
// request-scoped guards and the default-deny middleware (#181) — no drift.
import {
  deriveAuthContext,
  evaluateAuthDecision,
  evaluateAuthDecisionFromContext,
} from "./auth-trust";
import type { Permission } from "./rbac/permissions";
import {
  permissionsForRoles,
  rolesAreAdmin,
  rolesGrantPermission,
} from "./rbac/permissions";
import { jitProvision, writeAudit } from "./rbac/store";
import { isDbConfigured } from "./db/config";

export type { AuthUser };
export { UNAUTHENTICATED_USER };
export type { Permission };

/**
 * Result type for requireAuth() - either authenticated user or error response
 */
export type AuthResult =
  | { authenticated: true; user: AuthUser }
  | { authenticated: false; response: NextResponse };

export async function getAuthUser(): Promise<AuthUser> {
  const h = await headers();
  return deriveAuthContext(h).user;
}

/**
 * Authentication guard for API routes.
 *
 * Returns either the authenticated user or a 401 response ready to be returned
 * from your route handler. This allows routes to easily require authentication
 * while maintaining proper type narrowing.
 *
 * @example Basic usage - protect entire route
 * ```ts
 * import { requireAuth } from "@/lib/auth";
 *
 * export async function POST(request: NextRequest) {
 *   const auth = await requireAuth();
 *   if (!auth.authenticated) {
 *     return auth.response; // Returns 401 response
 *   }
 *
 *   // auth.user is now guaranteed to be authenticated
 *   console.log(`User ${auth.user.username} is making a request`);
 *
 *   // ... rest of your route logic
 * }
 * ```
 *
 * @example With group-based authorization
 * ```ts
 * export async function DELETE(request: NextRequest) {
 *   const auth = await requireAuth();
 *   if (!auth.authenticated) return auth.response;
 *
 *   // Additional authorization check
 *   if (!auth.user.groups.includes("admin")) {
 *     return NextResponse.json(
 *       { error: "Admin access required" },
 *       { status: 403 }
 *     );
 *   }
 *
 *   // ... admin-only logic
 * }
 * ```
 *
 * @returns AuthResult - either { authenticated: true, user: AuthUser } or { authenticated: false, response: NextResponse }
 */
export async function requireAuth(): Promise<AuthResult> {
  const h = await headers();
  const decision = evaluateAuthDecision(h);

  if (decision.decision === "deny") {
    return {
      authenticated: false,
      response: NextResponse.json(
        {
          error: "Authentication required",
          message: "You must be logged in to access this resource",
        },
        { status: 401 },
      ),
    };
  }

  return { authenticated: true, user: decision.user };
}

/**
 * Simple authentication check that throws if not authenticated.
 * Use this when you want to fail fast without handling the response yourself.
 *
 * @example
 * ```ts
 * import { requireAuthOrThrow } from "@/lib/auth";
 *
 * export async function POST(request: NextRequest) {
 *   try {
 *     const user = await requireAuthOrThrow();
 *     // user is guaranteed authenticated
 *   } catch (error) {
 *     // Handle in your error boundary or return 401
 *   }
 * }
 * ```
 *
 * @throws Error if user is not authenticated
 * @returns AuthUser - the authenticated user
 */
export async function requireAuthOrThrow(): Promise<AuthUser> {
  const h = await headers();
  const decision = evaluateAuthDecision(h);

  if (decision.decision === "deny") {
    throw new Error("Authentication required");
  }

  return decision.user;
}

// ---------------------------------------------------------------------------
// RBAC enforcement (F5 — issue #101)
// ---------------------------------------------------------------------------

/**
 * Result of a role/permission check — mirrors `AuthResult` so route handlers use
 * the same `if (!x.authorized) return x.response` shape as `requireAuth()`.
 */
export type RoleResult =
  | { authorized: true; user: AuthUser; subject: string | null }
  | { authorized: false; response: NextResponse };

/** Extract best-effort client IP / user-agent for the audit row. */
function auditNet(h: Awaited<ReturnType<typeof headers>>): {
  ip: string | null;
  ua: string | null;
} {
  const fwd = h.get("x-forwarded-for");
  const ip = (fwd?.split(",")[0]?.trim() || h.get("x-real-ip")) ?? null;
  return { ip, ua: h.get("user-agent") };
}

const IDP = process.env.DAAX_AUTH_PROVIDER_URL || "pocket-id";

function deny403(message: string): NextResponse {
  return NextResponse.json({ error: "Forbidden", message }, { status: 403 });
}

function deny401(): NextResponse {
  return NextResponse.json(
    {
      error: "Authentication required",
      message: "You must be logged in to access this resource",
    },
    { status: 401 },
  );
}

/**
 * Authorization guard: require that the caller holds `permission`.
 *
 * ⚠️ DEPLOYMENT PRECONDITION (do not misread this as protection by default):
 * RBAC enforces NOTHING useful unless the app runs in STRICT mode —
 * `DAAX_REQUIRE_AUTH=1` AND `DAAX_PROXY_SECRET` set (with the proxy injecting
 * `X-Daax-Proxy-Secret` and `X-Forwarded-User`). In the NON-strict default
 * posture, a request with NO forward-auth header takes the local-operator bypass
 * below and is treated as a fully-trusted operator (i.e. admin) — so any
 * headerless client reaching the app directly is effectively an admin. F5's
 * role checks only bind once strict mode forces a trusted forwarded identity.
 *
 * Layers on top of `requireAuth()` authentication:
 *   - Unauthenticated → 401 (audited).
 *   - Local-operator bypass (host-dev, no proxy) → allowed (the operator is the
 *     trusted root of the machine); audited as an operator grant. Keeps
 *     `bun dev` usable without a database. (This is the bypass the precondition
 *     above warns about — it is intended for host-dev, NOT untrusted exposure.)
 *   - Authenticated forwarded identity → JIT-provision, resolve roles from the
 *     DB, and allow ONLY if a held role grants `permission`; else 403. Every
 *     decision writes an `auth_audit` row.
 *   - Authenticated but Postgres not configured / unreachable → 403 fail-closed
 *     (RBAC cannot be resolved, so access is denied, never silently granted).
 *
 * @param permission the required `resource:action` permission.
 * @param opts.route  optional route label recorded in the audit row.
 */
export async function requireRole(
  permission: Permission,
  opts?: { route?: string },
): Promise<RoleResult> {
  const h = await headers();
  // Derive the forward-auth context ONCE and reuse it for both the trust
  // decision and the role resolution below — evaluateAuthDecision() would
  // otherwise re-parse the headers (and re-fire deriveAuthContext side-effects).
  const ctx = deriveAuthContext(h);
  const decision = evaluateAuthDecisionFromContext(ctx);
  const { ip, ua } = auditNet(h);
  const route = opts?.route ?? null;

  if (decision.decision === "deny") {
    await writeAuditSafe({
      event: "authz",
      outcome: "deny",
      permission,
      route,
      ip,
      ua,
      subject: null,
      detail: "unauthenticated",
    });
    return { authorized: false, response: deny401() };
  }

  if (decision.decision === "allow-operator") {
    await writeAuditSafe({
      event: "authz",
      outcome: "allow",
      permission,
      route,
      ip,
      ua,
      subject: null,
      detail: "local-operator",
    });
    return { authorized: true, user: decision.user, subject: null };
  }

  // allow-user: resolve roles from the identity store.
  const subject = ctx.subject;
  if (!subject) {
    // Should not happen (allow-user implies a trusted subject) — fail closed.
    await writeAuditSafe({
      event: "authz",
      outcome: "deny",
      permission,
      route,
      ip,
      ua,
      subject: null,
      detail: "no-subject",
    });
    return {
      authorized: false,
      response: deny403("Authorization unavailable"),
    };
  }

  if (!isDbConfigured()) {
    await writeAuditSafe({
      event: "authz",
      outcome: "deny",
      permission,
      route,
      ip,
      ua,
      subject,
      detail: "db-unconfigured",
    });
    return {
      authorized: false,
      response: deny403("Authorization store is unavailable"),
    };
  }

  let roles: string[];
  try {
    const jit = await jitProvision({
      subject,
      username: ctx.rawUsername,
      email: ctx.user.email,
      name: ctx.displayName,
      idp: IDP,
      groups: ctx.user.groups,
    });
    roles = jit.roles;
  } catch (err) {
    await writeAuditSafe({
      event: "authz",
      outcome: "deny",
      permission,
      route,
      ip,
      ua,
      subject,
      detail: `db-error: ${err instanceof Error ? err.message : String(err)}`,
    });
    return {
      authorized: false,
      response: deny403("Authorization store is unavailable"),
    };
  }

  const allowed = rolesGrantPermission(roles, permission);
  await writeAuditSafe({
    event: "authz",
    outcome: allowed ? "allow" : "deny",
    permission,
    route,
    ip,
    ua,
    subject,
    detail: `roles=[${roles.join(",")}]`,
  });

  if (!allowed) {
    return {
      authorized: false,
      response: deny403("You do not have permission to perform this action"),
    };
  }
  return { authorized: true, user: ctx.user, subject };
}

// writeAudit is already best-effort (never throws); this thin wrapper keeps the
// call sites terse and defends against a synchronous import-time failure too.
async function writeAuditSafe(
  entry: Parameters<typeof writeAudit>[0],
): Promise<void> {
  try {
    await writeAudit(entry);
  } catch {
    /* writeAudit already swallows; belt-and-suspenders */
  }
}

/** Server-resolved access summary for UI gating (retires NEXT_PUBLIC_ADMIN_MODE). */
export interface AccessSummary {
  authenticated: boolean;
  isAdmin: boolean;
  permissions: Permission[];
}

/**
 * Resolve the current caller's effective access for privileged-UI gating.
 *
 * Server-side source of truth behind `/api/auth/access`, replacing the
 * build-time client boolean `NEXT_PUBLIC_ADMIN_MODE`. The local-operator bypass
 * is treated as admin (host-dev). An authenticated user's roles come from the
 * DB (JIT-provisioned so first-login pending/group grants apply); if the store
 * is unavailable, access fails closed (isAdmin=false, no permissions).
 */
export async function resolveAccess(): Promise<AccessSummary> {
  const h = await headers();
  // Derive once, reuse for both the decision and the role resolution below.
  const ctx = deriveAuthContext(h);
  const decision = evaluateAuthDecisionFromContext(ctx);

  if (decision.decision === "allow-operator") {
    // Host-dev operator: full local access; expose every permission for the UI.
    return {
      authenticated: true,
      isAdmin: true,
      permissions: permissionsForRoles(["admin"]),
    };
  }

  if (decision.decision === "deny" || !ctx.subject || !isDbConfigured()) {
    return {
      authenticated: decision.decision !== "deny",
      isAdmin: false,
      permissions: [],
    };
  }

  try {
    const jit = await jitProvision({
      subject: ctx.subject,
      username: ctx.rawUsername,
      email: ctx.user.email,
      name: ctx.displayName,
      idp: IDP,
      groups: ctx.user.groups,
    });
    return {
      authenticated: true,
      isAdmin: rolesAreAdmin(jit.roles),
      permissions: permissionsForRoles(jit.roles),
    };
  } catch {
    return { authenticated: true, isAdmin: false, permissions: [] };
  }
}
