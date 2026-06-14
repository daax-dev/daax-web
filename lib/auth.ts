import "server-only";
import { timingSafeEqual } from "node:crypto";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

// Re-export types and constants from auth-types (client-safe module)
export type { AuthUser } from "./auth-types";
export { UNAUTHENTICATED_USER } from "./auth-types";

import type { AuthUser } from "./auth-types";
import { UNAUTHENTICATED_USER } from "./auth-types";

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
const USER_HEADER = process.env.DAAX_AUTH_USER_HEADER || "x-forwarded-user";
const USERNAME_HEADER =
  process.env.DAAX_AUTH_USERNAME_HEADER || "x-forwarded-username";
const DISPLAYNAME_HEADER =
  process.env.DAAX_AUTH_DISPLAYNAME_HEADER || "x-forwarded-name";
const EMAIL_HEADER = process.env.DAAX_AUTH_EMAIL_HEADER || "x-forwarded-email";
const GROUPS_HEADER =
  process.env.DAAX_AUTH_GROUPS_HEADER || "x-forwarded-groups";
const OIDC_PROVIDER_URL =
  process.env.DAAX_AUTH_PROVIDER_URL || "https://auth.poley.dev";

// Proxy-secret trust boundary (F1a, issue #94).
//
// The forward-auth headers above carry no proof they traversed the trusted
// reverse proxy (Traefik) — any client that can reach the app directly can set
// X-Forwarded-User and be treated as that user (task-007). As defense-in-depth,
// Traefik injects a shared secret header (X-Daax-Proxy-Secret) on the HTTP main
// router and the app trusts forwarded identity ONLY when that secret matches
// DAAX_PROXY_SECRET (DAAX_PROXY_SECRET_PREVIOUS is also accepted so the secret
// can be rotated without an auth outage). The proxy MUST also strip any
// client-supplied X-Daax-Proxy-Secret before injecting the real one.
//
// This is opt-in: when DAAX_PROXY_SECRET is unset the boundary is disabled and
// legacy behavior is preserved — EXCEPT in strict mode (DAAX_REQUIRE_AUTH=1),
// where an unset secret fails closed (forwarded identity is refused and a
// ship-blocking warning is logged), mirroring reference-platform `validate()`.
const PROXY_SECRET_HEADER =
  process.env.DAAX_AUTH_PROXY_SECRET_HEADER || "x-daax-proxy-secret";

function proxySecretConfigured(): boolean {
  return !!process.env.DAAX_PROXY_SECRET;
}

// Constant-time string comparison. A length mismatch returns false without a
// timing-safe compare (length is not the secret); equal lengths are compared
// with crypto.timingSafeEqual to avoid leaking the secret byte-by-byte.
function secretsEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function proxySecretMatches(provided: string | null): boolean {
  if (!provided) return false;
  const current = process.env.DAAX_PROXY_SECRET;
  const previous = process.env.DAAX_PROXY_SECRET_PREVIOUS;
  if (current && secretsEqual(provided, current)) return true;
  if (previous && secretsEqual(provided, previous)) return true;
  return false;
}

// Auth enforcement gate.
//
// daax-web is designed to run behind a Pocket ID forward-auth proxy that
// injects the X-Forwarded-* headers above. In two supported deployments there
// is NO proxy in front: host dev mode (`bun dev`) and proxy-less Tailscale
// container runs. In those cases no header is present and every guarded route
// would otherwise return 401.
//
// Policy (operator-approved): when the forward-auth user header is ABSENT
// (truly no header present), requests are treated as a trusted local operator
// UNLESS DAAX_REQUIRE_AUTH=1 is set, which restores strict enforcement (used
// when a real proxy is in front). A one-time warning is logged whenever the
// bypass is actually exercised so the relaxed posture is never silent.
//
// A header that is PRESENT but empty or whitespace-only is treated as an
// invalid (malformed) credential, not as "no proxy" — getAuthContext() trims
// the value, so it yields an unauthenticated user, and the guards return
// 401 / throw even when DAAX_REQUIRE_AUTH is unset. This prevents a client that
// can reach the app directly and send an empty or whitespace `X-Forwarded-User`
// from being silently bypassed.
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

let proxySecretMissingWarned = false;
function warnProxySecretMissingOnce(): void {
  if (proxySecretMissingWarned) return;
  proxySecretMissingWarned = true;
  console.warn(
    "[auth] SHIP-BLOCKING: DAAX_REQUIRE_AUTH=1 but DAAX_PROXY_SECRET is unset — " +
      "the HTTP proxy-secret trust boundary is NOT enforced. Forwarded identity " +
      "(X-Forwarded-User) is being REFUSED (fail-closed). Set DAAX_PROXY_SECRET " +
      "and inject X-Daax-Proxy-Secret at the proxy to authenticate forwarded identity.",
  );
}

/**
 * Resolved auth context for a single request.
 *
 * `rawUserHeader` is the unmodified `X-Forwarded-User` header value as returned
 * by the Web Headers API: `null` when the header is genuinely absent, or the
 * raw string (possibly empty/whitespace) when present. The guards use it to
 * distinguish "no proxy" (absent → bypass eligible) from a malformed credential
 * (present-but-empty/whitespace → never bypass). `user` is the derived AuthUser.
 */
interface AuthContext {
  rawUserHeader: string | null;
  user: AuthUser;
}

/**
 * Read the forward-auth headers once and derive both the raw user header and
 * the AuthUser. Single `headers()` lookup per request — used by getAuthUser()
 * and the guards so the unauthenticated path does not read headers twice.
 */
async function getAuthContext(): Promise<AuthContext> {
  const h = await headers();

  const rawUserHeader = h.get(USER_HEADER);
  // Trim before validating: a present-but-empty or whitespace-only value is not
  // a valid credential and must not yield an authenticated user. Use `??` (not
  // `||`) so an absent header (null) and an empty string stay distinguishable
  // upstream via rawUserHeader, then coalesce empty/whitespace to null here.
  const userId = (rawUserHeader ?? "").trim() || null;
  const username = (h.get(USERNAME_HEADER) || "").trim() || null;
  const displayName = (h.get(DISPLAYNAME_HEADER) || "").trim() || null;
  const email = h.get(EMAIL_HEADER) || null;
  const groupsRaw = h.get(GROUPS_HEADER) || "";
  const groups = groupsRaw
    ? groupsRaw
        .split(",")
        .map((g) => g.trim())
        .filter(Boolean)
    : [];

  // Proxy-secret trust boundary (F1a): a present forwarded identity is only
  // honored when it provably traversed the trusted proxy. The decision applies
  // solely when an identity is present; an absent header (userId === null) is
  // left to the guards' LOCAL_OPERATOR bypass and is unaffected here.
  let identityTrusted = userId !== null;
  if (userId !== null) {
    if (proxySecretConfigured()) {
      // Secret configured → enforce in every mode.
      identityTrusted = proxySecretMatches(h.get(PROXY_SECRET_HEADER));
    } else if (authRequired()) {
      // Strict mode + secret unset → fail closed (refuse forwarded identity).
      warnProxySecretMissingOnce();
      identityTrusted = false;
    }
    // else: non-strict + secret unset → boundary disabled, legacy behavior.
  }

  const authenticated = userId !== null && identityTrusted;

  // If a forwarded identity was PRESENT but the proxy-secret boundary rejected
  // it, surface NO identity-derived fields: the headers are untrusted, so
  // exposing username/email/groups invites UI/log spoofing and tempts callers
  // to treat them as meaningful. Return the canonical unauthenticated user. An
  // absent identity (userId === null) is left to the existing shape below so the
  // local-operator bypass and non-identity handling are unchanged.
  if (userId !== null && !identityTrusted) {
    return { rawUserHeader, user: { ...UNAUTHENTICATED_USER } };
  }

  // Prefer displayName > username > "User" (avoid showing raw UUID)
  // UUID pattern: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx or similar
  const isUuid = userId && /^[0-9a-f-]{8,}$/i.test(userId);
  const displayUsername = displayName || username || (isUuid ? "User" : userId);

  return {
    rawUserHeader,
    user: {
      username: displayUsername,
      email,
      groups,
      authenticated,
      pictureUrl: authenticated
        ? `${OIDC_PROVIDER_URL}/api/users/${encodeURIComponent(userId!)}/avatar`
        : null,
    },
  };
}

export async function getAuthUser(): Promise<AuthUser> {
  return (await getAuthContext()).user;
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
  const { rawUserHeader, user } = await getAuthContext();

  if (user.authenticated) {
    return { authenticated: true, user };
  }

  // Bypass to a local operator only when the user header is truly absent
  // (rawUserHeader === null → no proxy) and strict auth is not required. A
  // present-but-empty or whitespace-only header is a malformed credential and
  // always 401s.
  if (!authRequired() && rawUserHeader === null) {
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
      { status: 401 },
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
  const { rawUserHeader, user } = await getAuthContext();

  if (user.authenticated) {
    return user;
  }

  // Bypass only for a truly absent header (see requireAuth). A present-but-empty
  // or whitespace-only header is a malformed credential and always throws.
  if (!authRequired() && rawUserHeader === null) {
    warnAuthBypassedOnce();
    return LOCAL_OPERATOR;
  }

  throw new Error("Authentication required");
}
