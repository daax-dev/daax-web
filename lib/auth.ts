import "server-only";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

// Re-export types and constants from auth-types (client-safe module)
export type { AuthUser } from "./auth-types";
export { UNAUTHENTICATED_USER } from "./auth-types";

import type { AuthUser } from "./auth-types";

/**
 * Result type for requireAuth() - either authenticated user or error response
 */
export type AuthResult =
  | { authenticated: true; user: AuthUser }
  | { authenticated: false; response: NextResponse };

// Pocket ID forward-auth headers:
//   X-Forwarded-User     → user ID (UUID)
//   X-Forwarded-Username → username (e.g., "jpoley")
//   X-Forwarded-Name     → display name (e.g., "JP")
//   X-Forwarded-Email    → email address
//   X-Forwarded-Groups   → comma-separated group memberships
//   X-Forwarded-Admin    → "true" if admin user
const USER_HEADER =
  process.env.DAAX_AUTH_USER_HEADER || "x-forwarded-user";
const USERNAME_HEADER =
  process.env.DAAX_AUTH_USERNAME_HEADER || "x-forwarded-username";
const DISPLAYNAME_HEADER =
  process.env.DAAX_AUTH_DISPLAYNAME_HEADER || "x-forwarded-name";
const EMAIL_HEADER =
  process.env.DAAX_AUTH_EMAIL_HEADER || "x-forwarded-email";
const GROUPS_HEADER =
  process.env.DAAX_AUTH_GROUPS_HEADER || "x-forwarded-groups";
const OIDC_PROVIDER_URL =
  process.env.DAAX_AUTH_PROVIDER_URL || "https://auth.poley.dev";

// Auth enforcement gate.
//
// daax-web is designed to run behind a Pocket ID forward-auth proxy that
// injects the X-Forwarded-* headers above. In two supported deployments there
// is NO proxy in front: host dev mode (`bun dev`) and proxy-less Tailscale
// container runs. In those cases no header is present and every guarded route
// would otherwise return 401.
//
// Policy (operator-approved): when no authenticated user can be derived from
// headers, requests are treated as a trusted local operator UNLESS
// DAAX_REQUIRE_AUTH=1 is set, which restores strict enforcement (used when a
// real proxy is in front). A one-time warning is logged whenever the bypass is
// actually exercised so the relaxed posture is never silent.
//
// Evaluated at call time (not module load) so the gate honors the current
// environment and stays straightforward to test.
function authRequired(): boolean {
  return process.env.DAAX_REQUIRE_AUTH === "1";
}

// Synthetic user representing the trusted local operator when auth is bypassed.
const LOCAL_OPERATOR: AuthUser = {
  username: "local",
  email: null,
  groups: [],
  authenticated: true,
  pictureUrl: null,
};

let bypassWarned = false;
function warnAuthBypassedOnce(): void {
  if (bypassWarned) return;
  bypassWarned = true;
  console.warn(
    "[auth] No forward-auth header present and DAAX_REQUIRE_AUTH!=1 — " +
      "authentication is BYPASSED (treating requests as a trusted local operator). " +
      "Set DAAX_REQUIRE_AUTH=1 to enforce authentication (e.g. behind the Pocket ID proxy).",
  );
}

export async function getAuthUser(): Promise<AuthUser> {
  const h = await headers();

  const userId = h.get(USER_HEADER) || null;
  const username = h.get(USERNAME_HEADER) || null;
  const displayName = h.get(DISPLAYNAME_HEADER) || null;
  const email = h.get(EMAIL_HEADER) || null;
  const groupsRaw = h.get(GROUPS_HEADER) || "";
  const groups = groupsRaw
    ? groupsRaw
        .split(",")
        .map((g) => g.trim())
        .filter(Boolean)
    : [];

  // Prefer displayName > username > "User" (avoid showing raw UUID)
  // UUID pattern: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx or similar
  const isUuid = userId && /^[0-9a-f-]{8,}$/i.test(userId);
  const displayUsername = displayName || username || (isUuid ? "User" : userId);

  return {
    username: displayUsername,
    email,
    groups,
    authenticated: !!userId,
    pictureUrl: userId
      ? `${OIDC_PROVIDER_URL}/api/users/${encodeURIComponent(userId)}/avatar`
      : null,
  };
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
  const user = await getAuthUser();

  if (user.authenticated) {
    return { authenticated: true, user };
  }

  // No proxy header. Bypass to a local operator unless strict auth is required.
  if (!authRequired()) {
    warnAuthBypassedOnce();
    return { authenticated: true, user: LOCAL_OPERATOR };
  }

  return {
    authenticated: false,
    response: NextResponse.json(
      {
        error: "Authentication required",
        message: "You must be logged in to access this resource",
      },
      { status: 401 }
    ),
  };
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
  const user = await getAuthUser();

  if (user.authenticated) {
    return user;
  }

  if (!authRequired()) {
    warnAuthBypassedOnce();
    return LOCAL_OPERATOR;
  }

  throw new Error("Authentication required");
}
