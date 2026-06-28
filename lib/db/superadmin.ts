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
 * usernames and/or email addresses. Matching is case-insensitive against the
 * authenticated user's `username` and `email`.
 *
 * FAIL-CLOSED: when the allow-list is empty or unset, NO ONE is a super-admin.
 * The console is therefore disabled by default and must be explicitly enabled
 * per-operator. In host-dev (the LOCAL_OPERATOR bypass, username "local"), add
 * `local` to the allow-list to use the console locally.
 */
const SUPERADMINS_ENV = "DAAX_DB_CONSOLE_SUPERADMINS";

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
  const candidates = [user.username, user.email]
    .filter((v): v is string => !!v && v.trim().length > 0)
    .map((v) => v.trim().toLowerCase());
  return candidates.some((c) => allow.has(c));
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
