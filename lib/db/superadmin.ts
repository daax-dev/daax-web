import "server-only";
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
 * spoofable, so it is NOT matched for forwarded users — allow-list real users by
 * their email. The synthetic local operator (host-dev bypass) has no email, so
 * for it alone the username ("local") is matched; add `local` to the allow-list
 * to use the console in host-dev.
 *
 * FAIL-CLOSED: when the allow-list is empty or unset, NO ONE is a super-admin.
 * The console is therefore disabled by default and must be explicitly enabled
 * per-operator.
 */
const SUPERADMINS_ENV = "DAAX_DB_CONSOLE_SUPERADMINS";

/**
 * The synthetic local-operator username (mirrors LOCAL_OPERATOR in lib/auth.ts,
 * which is module-private there). This is the ONLY username honored without an
 * email — it identifies the host-dev bypass principal, not a forwarded identity.
 */
const LOCAL_OPERATOR_USERNAME = "local";

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

/** True only when the allow-list is configured AND the user matches it. */
export function isSuperAdmin(
  user: AuthUser,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!user.authenticated) return false;
  const allow = superAdminAllowlist(env);
  if (allow.size === 0) return false; // fail closed

  // Forwarded users are matched ONLY on their stable email (X-Forwarded-Email);
  // AuthUser.username is display-name-preferred and spoofable, so it is never
  // used to authorize a forwarded identity.
  const email = user.email?.trim().toLowerCase();
  if (email) return allow.has(email);

  // No email → the only principal honored is the synthetic local operator
  // (host-dev bypass), identified by its sentinel username. Any other email-less
  // authenticated identity (e.g. a forwarded user with no X-Forwarded-Email)
  // fails closed, so a spoofable display username can never grant access.
  if (user.username === LOCAL_OPERATOR_USERNAME) {
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
 * const denied = requireSuperAdmin(auth.user);
 * if (denied) return denied;
 */
export function requireSuperAdmin(user: AuthUser): NextResponse | null {
  if (isSuperAdmin(user)) return null;
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
