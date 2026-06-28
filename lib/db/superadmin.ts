import "server-only";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

import type { AuthUser } from "@/lib/auth-types";

/**
 * Super-admin gate for the admin DB console (brain2daax F6, issue #102).
 *
 * The console (lib/db/console.ts) is gated by an ENV-DRIVEN super-admin
 * allow-list — deliberately disjoint from the RBAC tables the console can read,
 * so DB access can never be self-escalated through a row the console edits
 * (docs/brain2daax.md §3 F6: "gated by an env allow-list ... not a
 * self-grantable role"). This mirrors reference-platform's `requireSuperAdmin`.
 *
 * The allow-list is `DAAX_DB_CONSOLE_SUPERADMINS`: a comma-separated list of
 * email addresses (case-insensitive). Matching is on a STABLE identifier only:
 * the forwarded email (`X-Forwarded-Email`). `AuthUser.username` is
 * display-name-preferred (`displayName || username`, see lib/auth.ts) and thus
 * spoofable, so it is NEVER used to authorize a forwarded identity.
 *
 * The host-dev local operator (the absent-forward-auth-header bypass in
 * lib/auth.ts) has no email; it alone may be matched by the sentinel username
 * `local`, and ONLY when the request truly carries no forward-auth identity
 * header (provenance check — see `isLocalOperatorRequest`). A forwarded identity
 * that merely lacks an email, or whose display name is "local", fails closed.
 * Add `local` to the allow-list to use the console in host-dev.
 *
 * FAIL-CLOSED: when the allow-list is empty or unset, NO ONE is a super-admin.
 * The console is therefore disabled by default and must be explicitly enabled
 * per-operator.
 *
 * DEFENSE-IN-DEPTH (trust boundary): this gate is only as strong as the F1a
 * proxy-secret boundary. When `DAAX_PROXY_SECRET` is unset and auth is non-strict,
 * `lib/auth.ts` trusts forwarded headers verbatim, so any client that can reach
 * the app directly could send `X-Forwarded-Email: <listed-admin>` and obtain full
 * DB read + RBAC write. Because the console's blast radius is the entire database,
 * `requireSuperAdmin` additionally REFUSES a forwarded identity unless the trust
 * boundary is provably enforced (`DAAX_PROXY_SECRET` set) — only the local
 * operator (no forward-auth header) is exempt. Enabling
 * `DAAX_DB_CONSOLE_SUPERADMINS` for proxied access therefore REQUIRES
 * `DAAX_PROXY_SECRET` (and, normally, `DAAX_REQUIRE_AUTH=1`).
 */
const SUPERADMINS_ENV = "DAAX_DB_CONSOLE_SUPERADMINS";

/**
 * The synthetic local-operator username (mirrors LOCAL_OPERATOR in lib/auth.ts,
 * which is module-private there). This is the ONLY username honored without an
 * email, and only for a provenance-verified local operator.
 */
const LOCAL_OPERATOR_USERNAME = "local";

/** Forward-auth user header (must match lib/auth.ts USER_HEADER resolution). */
const USER_HEADER = (
  process.env.DAAX_AUTH_USER_HEADER || "x-forwarded-user"
).toLowerCase();

/**
 * Whether the F1a proxy-secret trust boundary is configured (mirrors the
 * module-private check in lib/auth.ts). When true, forwarded identity is only
 * honored if it carried the shared secret injected by the trusted proxy.
 */
function proxySecretConfigured(): boolean {
  return !!process.env.DAAX_PROXY_SECRET;
}

/** Parse the allow-list env into a set of lower-cased identifiers (empty if unset). */
export function superAdminAllowlist(
  env: NodeJS.ProcessEnv = process.env,
): Set<string> {
  const raw = env[SUPERADMINS_ENV];
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

/**
 * Provenance check: true only when the request carries NO forward-auth identity
 * header — the exact condition under which lib/auth.ts returns the synthetic
 * LOCAL_OPERATOR. A present header (even one a forwarded user controls) makes
 * this false, so a forwarded identity can never be treated as the local operator.
 */
export async function isLocalOperatorRequest(): Promise<boolean> {
  const h = await headers();
  return h.get(USER_HEADER) === null;
}

/**
 * Pure authorization decision. `isLocalOperator` MUST be the provenance result
 * from `isLocalOperatorRequest()` (false for any forwarded identity). Returns
 * true only when the allow-list is configured AND the user matches it.
 */
export function isSuperAdmin(
  user: AuthUser,
  isLocalOperator: boolean,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!user.authenticated) return false;
  const allow = superAdminAllowlist(env);
  if (allow.size === 0) return false; // fail closed

  // Forwarded users are matched ONLY on their stable email (X-Forwarded-Email).
  const email = user.email?.trim().toLowerCase();
  if (email) return allow.has(email);

  // No email → the only principal honored is the genuine local operator:
  // provenance-verified (no forward-auth header) AND carrying the sentinel
  // username. Any forwarded identity without an email fails closed, so a
  // spoofable display username can never grant access.
  if (isLocalOperator && user.username === LOCAL_OPERATOR_USERNAME) {
    return allow.has(LOCAL_OPERATOR_USERNAME);
  }
  return false;
}

/**
 * Guard for console route handlers. Call AFTER requireAuth() has confirmed an
 * authenticated user. Returns a 403 response when the user is not a super-admin,
 * or null when access is granted.
 *
 * @example
 * const auth = await requireAuth();
 * if (!auth.authenticated) return auth.response;
 * const denied = await requireSuperAdmin(auth.user);
 * if (denied) return denied;
 */
export async function requireSuperAdmin(
  user: AuthUser,
): Promise<NextResponse | null> {
  const localOperator = await isLocalOperatorRequest();

  // Defense-in-depth: refuse a forwarded identity unless the proxy-secret trust
  // boundary is provably enforced. Otherwise a directly-reachable client could
  // forge X-Forwarded-Email and obtain full DB + RBAC access. Fail closed.
  if (!proxySecretConfigured() && !localOperator) {
    return NextResponse.json(
      {
        error: "Forbidden",
        message:
          "Admin DB console is disabled: the forward-auth trust boundary is not " +
          "enforced. Set DAAX_PROXY_SECRET (recommended with DAAX_REQUIRE_AUTH=1) " +
          "so forwarded identity is verified, or run host-dev as the local operator.",
      },
      { status: 403 },
    );
  }

  if (isSuperAdmin(user, localOperator)) return null;
  return NextResponse.json(
    {
      error: "Forbidden",
      message:
        "Admin DB console access requires super-admin privileges " +
        `(${SUPERADMINS_ENV} allow-list).`,
    },
    { status: 403 },
  );
}
