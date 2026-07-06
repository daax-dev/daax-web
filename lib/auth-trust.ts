/**
 * Pure auth-trust evaluator (issue #181).
 *
 * Single source of truth for the forward-auth trust decision. This module is
 * intentionally free of any Next.js / `server-only` imports so it can be used
 * from BOTH the request-scoped guards in `lib/auth.ts` (via `next/headers`) and
 * the default-deny `middleware.ts` (via `request.headers`) without duplicating
 * the trust logic. Its only runtime dependencies are Node's `crypto` and the
 * client-safe auth types.
 *
 * `lib/auth.ts` wraps the functions here and maps the decision onto its existing
 * `AuthResult` / throw contract; its externally observable behavior is unchanged
 * (see tests/lib/auth.test.ts). The middleware calls the same `evaluateAuthDecision`.
 */
import { timingSafeEqual } from "node:crypto";

import type { AuthUser } from "./auth-types";
import { UNAUTHENTICATED_USER } from "./auth-types";
import { canonicalizeSubject } from "./rbac/allowlist";
import { isLoopbackAddress } from "./net/loopback";

/**
 * Minimal headers-like reader satisfied by both the Web `Headers` object
 * (`request.headers`) and the awaited result of Next's `headers()`.
 */
export interface HeaderReader {
  get(name: string): string | null;
}

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
// ship-blocking warning is logged), mirroring reference-platform `validate()` —
// AND except on an EXPOSED bind (#184 review): when HOST is an explicit
// non-loopback address (e.g. the 0.0.0.0 compose containers) and the secret is
// unset, forwarded identity is refused even in non-strict mode, because any
// peer that can reach the port could send X-Forwarded-User and be
// authenticated as that user with a single spoofed header.
const PROXY_SECRET_HEADER =
  process.env.DAAX_AUTH_PROXY_SECRET_HEADER || "x-daax-proxy-secret";

function proxySecretConfigured(): boolean {
  return !!process.env.DAAX_PROXY_SECRET;
}

// Whether the server is EXPOSED beyond loopback per the explicit HOST bind
// signal (same signal the LOCAL_OPERATOR posture gate uses below — #184). An
// unset/empty HOST is NOT exposed here: it carries no bind signal, and the
// legacy no-secret behavior is only revoked on a provably exposed bind.
function hostBindExposedBeyondLoopback(): boolean {
  const host = (process.env.HOST ?? "").trim();
  return host !== "" && !isLoopbackAddress(host);
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
// invalid (malformed) credential, not as "no proxy" — deriveAuthContext() trims
// the value, so it yields an unauthenticated user, and the guards return
// 401 / throw even when DAAX_REQUIRE_AUTH is unset. This prevents a client that
// can reach the app directly and send an empty or whitespace `X-Forwarded-User`
// from being silently bypassed.
//
// Evaluated at call time (not module load) so the gate honors the current
// environment and stays straightforward to test.
export function authRequired(): boolean {
  return process.env.DAAX_REQUIRE_AUTH === "1";
}

// LOCAL_OPERATOR bypass posture gate (F-C2, issue #184).
//
// The absent-header bypass below treats an uncredentialed request as the trusted
// local operator. The WS plane (server/handlers/ws-auth.ts) only does this for a
// LOOPBACK TCP peer, so a non-loopback tailnet peer can never be the "local"
// operator. The HTTP plane CANNOT see the TCP peer: this app runs under plain
// `next start` / `next dev` (no custom server — package.json:6/15), so route
// handlers (`await headers()`) and middleware (`NextRequest`) never expose
// `socket.remoteAddress`, and `X-Forwarded-For` is spoofable/absent without a
// trusted proxy. There is therefore no per-request peer to check.
//
// Instead the HTTP plane gates the bypass on DEPLOYMENT POSTURE — whether the
// server is exposed beyond loopback — which IS knowable at runtime. Fail SAFE:
// an exposed or ambiguous production posture DENIES the bypass (→ 401), matching
// the WS plane's "no bypass off-host" behavior. Precedence:
//
//   1. DAAX_TRUST_LOCAL_OPERATOR set → honored verbatim in BOTH directions
//      (explicit opt-in to trust every peer that can reach the port, or explicit
//      opt-out). This is the escape hatch for the proxy-less 0.0.0.0 Tailscale
//      container run that intentionally trusts its tailnet.
//   2. Else HOST bind is explicit → loopback bind (127.0.0.0/8, ::1, localhost)
//      allows the bypass; any other bind (0.0.0.0, ::, a routable address) is
//      exposed → deny. `next start -H 0.0.0.0` deployments set HOST=0.0.0.0
//      (package.json start:prod / dev:tailscale) so this fires deterministically.
//      HOSTNAME is intentionally NOT consulted: Docker sets it to a random
//      container id and shells may export the machine hostname, so it is not a
//      reliable bind signal.
//   3. Else no explicit signal → allow ONLY when NODE_ENV is explicitly
//      "development" (host-dev `next dev` sets NODE_ENV=development at runtime).
//      An UNSET or ambiguous NODE_ENV, "test", and "production" all fail SAFE →
//      deny (Copilot #184): an unset value carries NO posture signal, so it must
//      not enable the bypass — "ambiguous → deny". Unit tests that want the
//      bypass set the posture explicitly (HOST loopback or
//      DAAX_TRUST_LOCAL_OPERATOR=1), never relying on a non-production NODE_ENV.
//
// A truthy value is 1/true/yes/on (case-insensitive); anything else is false.
function envTruthy(v: string | undefined): boolean {
  if (v === undefined) return false;
  const s = v.trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

function envFalsy(v: string | undefined): boolean {
  if (v === undefined) return false;
  const s = v.trim().toLowerCase();
  return s === "0" || s === "false" || s === "no" || s === "off";
}

// Why the LOCAL_OPERATOR bypass was denied, so the one-time warning can name the
// ACTUAL cause instead of always blaming exposure (Copilot #184).
export type OperatorBypassDenyReason =
  | "explicit-opt-out" // DAAX_TRUST_LOCAL_OPERATOR set to a falsy value
  | "exposed-beyond-loopback" // explicit non-loopback HOST bind (e.g. 0.0.0.0)
  | "production-or-ambiguous"; // no signal + NODE_ENV not "development"

export type OperatorBypassEvaluation =
  | { allowed: true }
  | { allowed: false; reason: OperatorBypassDenyReason };

// Single evaluation of the posture gate that also reports WHY a bypass is denied.
function evaluateLocalOperatorBypass(): OperatorBypassEvaluation {
  // 1. Explicit operator override wins in both directions.
  const trust = process.env.DAAX_TRUST_LOCAL_OPERATOR;
  if (envTruthy(trust)) return { allowed: true };
  if (envFalsy(trust)) return { allowed: false, reason: "explicit-opt-out" };

  // 2. Explicit bind host: loopback → allowed; anything else → exposed → deny.
  const host = (process.env.HOST ?? "").trim();
  if (host !== "") {
    return isLoopbackAddress(host)
      ? { allowed: true }
      : { allowed: false, reason: "exposed-beyond-loopback" };
  }

  // 3. No explicit signal → allow ONLY in explicit development (fail safe).
  //    Unset/ambiguous NODE_ENV, "test", and "production" all deny.
  if (process.env.NODE_ENV === "development") return { allowed: true };
  return { allowed: false, reason: "production-or-ambiguous" };
}

export function localOperatorBypassAllowed(): boolean {
  return evaluateLocalOperatorBypass().allowed;
}

// Synthetic user representing the trusted local operator when auth is bypassed.
export const LOCAL_OPERATOR: AuthUser = {
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

let operatorBlockedWarned = false;
function warnOperatorBypassBlockedOnce(reason: OperatorBypassDenyReason): void {
  if (operatorBlockedWarned) return;
  operatorBlockedWarned = true;
  // State the ACTUAL deny reason (Copilot #184): the deny is not always caused by
  // exposure — it can be an explicit opt-out or a production/ambiguous posture.
  const cause: Record<OperatorBypassDenyReason, string> = {
    "explicit-opt-out":
      "DAAX_TRUST_LOCAL_OPERATOR is set to a falsy value (explicit opt-out)",
    "exposed-beyond-loopback":
      "the server is bound beyond loopback (HOST is not a loopback address) " +
      "and DAAX_TRUST_LOCAL_OPERATOR is not set",
    "production-or-ambiguous":
      "the deployment posture is production or ambiguous (no loopback HOST " +
      "bind, no DAAX_TRUST_LOCAL_OPERATOR, and NODE_ENV is not 'development')",
  };
  console.warn(
    "[auth] No forward-auth header present, but the LOCAL_OPERATOR bypass is " +
      `DISABLED — ${cause[reason]} — request REJECTED (401). This prevents any ` +
      "peer that can reach the port from being trusted as the local operator " +
      "(issue #184). To restore trust set DAAX_TRUST_LOCAL_OPERATOR=1 (trusts " +
      "every peer that can reach the port), or put a Pocket ID proxy in front " +
      "and set DAAX_REQUIRE_AUTH=1.",
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

let exposedIdentityRefusedWarned = false;
function warnForwardedIdentityRefusedExposedOnce(): void {
  if (exposedIdentityRefusedWarned) return;
  exposedIdentityRefusedWarned = true;
  console.warn(
    "[auth] Forwarded identity (X-Forwarded-User) REFUSED: the server is bound " +
      "beyond loopback (HOST is not a loopback address) but DAAX_PROXY_SECRET is " +
      "unset, so the header carries no proof it traversed a trusted proxy — any " +
      "peer that can reach the port could forge it (issue #184). Set " +
      "DAAX_PROXY_SECRET and inject X-Daax-Proxy-Secret at the proxy (plus " +
      "DAAX_REQUIRE_AUTH=1 behind a real proxy) to authenticate forwarded identity.",
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
export interface AuthContext {
  rawUserHeader: string | null;
  user: AuthUser;
  /**
   * The TRUSTED, stable Pocket ID subject (X-Forwarded-User) — non-null ONLY
   * when the forwarded identity was present AND passed the proxy-secret trust
   * boundary. This is the RBAC identity key (docs §3 F5); it is deliberately
   * separate from `user.username` (a display fallback) so authorization never
   * keys on a mutable attribute. Null for the local-operator bypass and for any
   * rejected/absent identity.
   */
  subject: string | null;
  /** Raw forwarded username (mutable display attr), pre display-fallback. */
  rawUsername: string | null;
  /** Raw forwarded display name (X-Forwarded-Name). */
  displayName: string | null;
}

/**
 * PURE derivation: read the forward-auth headers from a headers-like reader and
 * derive both the raw user header and the AuthUser. No `next/headers` — callers
 * pass either the awaited `headers()` result or a request's `Headers`.
 */
export function deriveAuthContext(h: HeaderReader): AuthContext {
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
    } else if (hostBindExposedBeyondLoopback()) {
      // Non-strict + secret unset + EXPOSED bind (HOST beyond loopback) → fail
      // closed (#184 review): on a proxy-less exposed container any peer that
      // can reach the port could set X-Forwarded-User and be authenticated as
      // that user with one spoofed header. The hardened deploy path requires
      // DAAX_PROXY_SECRET (deploy/docker-compose.yml) and host-dev sends no
      // forwarded headers, so only the unprotected exposed posture is affected.
      warnForwardedIdentityRefusedExposedOnce();
      identityTrusted = false;
    }
    // else: non-strict + secret unset + not provably exposed → boundary
    // disabled, legacy behavior.
  }

  const authenticated = userId !== null && identityTrusted;

  // If a forwarded identity was PRESENT but the proxy-secret boundary rejected
  // it, surface NO identity-derived fields: the headers are untrusted, so
  // exposing username/email/groups invites UI/log spoofing and tempts callers
  // to treat them as meaningful. Return the canonical unauthenticated user. An
  // absent identity (userId === null) is left to the existing shape below so the
  // local-operator bypass and non-identity handling are unchanged.
  if (userId !== null && !identityTrusted) {
    return {
      rawUserHeader,
      user: { ...UNAUTHENTICATED_USER },
      subject: null,
      rawUsername: null,
      displayName: null,
    };
  }

  // Prefer displayName > username > "User" (avoid showing raw UUID)
  // UUID pattern: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx or similar
  const isUuid = userId && /^[0-9a-f-]{8,}$/i.test(userId);
  const displayUsername = displayName || username || (isUuid ? "User" : userId);

  return {
    rawUserHeader,
    // `subject` is the trusted identity key: only meaningful when authenticated.
    // Canonicalise UUID subjects to lowercase here (the trust boundary) so a
    // differently-cased forwarded subject resolves to ONE stable RBAC identity
    // key and matches lowercased subject allow-list entries. Non-UUID subjects
    // are left untouched (mirrors allowlist.ts canonicalization).
    subject: authenticated ? canonicalizeSubject(userId!) : null,
    rawUsername: username,
    displayName,
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

/**
 * Discriminated trust decision for a single request.
 *
 * - `allow-user`     → a forwarded identity was present and trusted.
 * - `allow-operator` → no proxy in front (header absent) and strict mode off:
 *                      treat as the trusted local operator (host-dev bypass).
 * - `deny`           → authentication required (401).
 */
export type AuthDecision =
  | { decision: "allow-user"; user: AuthUser }
  | { decision: "allow-operator"; user: AuthUser }
  | { decision: "deny"; status: 401 };

/**
 * PURE trust decision — the single source of truth shared by `requireAuth()` /
 * `requireAuthOrThrow()` (via `lib/auth.ts`) and the default-deny middleware.
 *
 * Mirrors the exact branch logic that previously lived inline in `requireAuth`:
 *   1. authenticated identity           → allow-user
 *   2. absent header + non-strict mode   → allow-operator (LOCAL_OPERATOR)
 *   3. otherwise                         → deny (401)
 */
export function evaluateAuthDecision(h: HeaderReader): AuthDecision {
  return evaluateAuthDecisionFromContext(deriveAuthContext(h));
}

/**
 * Same trust decision as {@link evaluateAuthDecision}, but from an ALREADY-derived
 * {@link AuthContext}. RBAC-guarded paths (`requireRole` / `resolveAccess`) need
 * both the full context AND the decision; deriving once and passing it here avoids
 * re-parsing the forward-auth headers (and re-firing any `deriveAuthContext`
 * side-effects) twice per request. Behavior is identical to `evaluateAuthDecision`.
 */
export function evaluateAuthDecisionFromContext(
  ctx: AuthContext,
): AuthDecision {
  const { rawUserHeader, user } = ctx;

  if (user.authenticated) {
    return { decision: "allow-user", user };
  }

  // Bypass to a local operator only when the user header is truly absent
  // (rawUserHeader === null → no proxy), strict auth is not required, AND the
  // deployment posture permits it (server is not exposed beyond loopback, or the
  // operator explicitly opted in — see localOperatorBypassAllowed / issue #184).
  // A present-but-empty or whitespace-only header is a malformed credential and
  // always denies. An exposed posture with no header denies too (401), matching
  // the WS plane's "no bypass off-host" behavior instead of trusting any peer.
  if (!authRequired() && rawUserHeader === null) {
    const bypass = evaluateLocalOperatorBypass();
    if (bypass.allowed) {
      warnAuthBypassedOnce();
      return { decision: "allow-operator", user: LOCAL_OPERATOR };
    }
    warnOperatorBypassBlockedOnce(bypass.reason);
  }

  return { decision: "deny", status: 401 };
}
