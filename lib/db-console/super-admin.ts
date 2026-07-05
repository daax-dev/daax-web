/**
 * Super-admin gate for the admin DB console (F6 — issue #102).
 *
 * The DB console is gated by an ENV super-admin allow-list (`DAAX_SUPERADMIN_USERS`),
 * strictly DISJOINT from the RBAC tables the console can read/write. This is the
 * anti-escalation property from `dbadmin.go`: because super-admin membership
 * lives in the environment (not in `user_roles`), a normal `admin` cannot grant
 * themselves DB-console access by editing the very tables the console exposes.
 *
 * {@link requireSuperAdmin} LAYERS ON TOP of `requireRole` — it first runs the
 * standard RBAC check (authentication + `admin:db:*` + audit), then applies the
 * stricter env gate. Super-admin is an env gate, never a DB role.
 *
 * Host-dev posture: the local-operator bypass (no proxy, `bun dev`) is the
 * trusted root of the machine and is treated as super-admin — mirroring how
 * `requireRole`/`resolveAccess` treat the operator as admin — so the console
 * stays usable in host-dev without a forwarded identity to match. In strict
 * mode a forwarded identity must appear in the allow-list; an `admin` who is not
 * allow-listed is refused (403).
 */

import "server-only";

import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { requireRole, type RoleResult } from "@/lib/auth";
import type { Permission } from "@/lib/rbac/permissions";
import { deriveAuthContext, evaluateAuthDecision } from "@/lib/auth-trust";
import {
  parseAdminAllowlist,
  isUserAllowlisted,
  type UserIdentity,
} from "@/lib/rbac/allowlist";
import { writeAudit } from "@/lib/rbac/store";

/**
 * Env var listing super-admin identities. Only subject-kind entries (immutable
 * OIDC UUIDs) are honored by `identityIsSuperAdmin()`; any email/username
 * entries are IGNORED (with a one-time operator warning). Comma/space separated.
 */
export const SUPERADMIN_ENV = "DAAX_SUPERADMIN_USERS";
/** Env flag enabling the opt-in, audited write path (D4). Off by default. */
export const DB_CONSOLE_WRITES_ENV = "DAAX_DB_CONSOLE_WRITES";

/** True when the audited write path is explicitly enabled (D4). Default: false. */
export function dbConsoleWritesEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const v = env[DB_CONSOLE_WRITES_ENV]?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

let attrEntriesWarned = false;
function warnAttrSuperadminOnce(count: number): void {
  if (attrEntriesWarned) return;
  attrEntriesWarned = true;
  const plural = count === 1 ? "entry" : "entries";
  console.warn(
    `[db-console] ${SUPERADMIN_ENV} contains ${count} email/username ${plural} that ` +
      `${count === 1 ? "is" : "are"} IGNORED. The super-admin gate accepts SUBJECT ` +
      `(immutable OIDC UUID) entries ONLY: email/username are IdP-forwarded and ` +
      `mutable/spoofable, and this is the highest-privilege gate (raw writes to every ` +
      `table, incl. the RBAC tables). Configure the subject UUID instead.`,
  );
}

/**
 * PURE: is this identity a super-admin per the allow-list?
 *
 * SUBJECT-ONLY (hardening): unlike the RBAC admin allow-list, the super-admin
 * gate matches ONLY subject-kind (UUID) entries. Email/username entries are
 * IdP-forwarded, mutable, and spoofable (see lib/rbac/allowlist.ts §SECURITY);
 * against an IdP that does not verify email + a forged identity header they
 * would let an attacker claim super-admin — the highest-privilege gate, which
 * can raw-write every table. Such attr entries are IGNORED (with a one-time
 * operator warning) so this gate cannot be reached via a spoofable attribute.
 * An empty/unset or subject-free allow-list matches no one (fail-closed).
 */
export function identityIsSuperAdmin(
  user: UserIdentity,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const entries = parseAdminAllowlist(env[SUPERADMIN_ENV]);
  const subjectEntries = entries.filter((e) => e.kind === "subject");
  const attrCount = entries.length - subjectEntries.length;
  if (attrCount > 0) warnAttrSuperadminOnce(attrCount);
  if (subjectEntries.length === 0) return false;
  return isUserAllowlisted(subjectEntries, user);
}

/** Best-effort client IP / UA for an audit row. */
function auditNet(h: Awaited<ReturnType<typeof headers>>): {
  ip: string | null;
  ua: string | null;
} {
  const fwd = h.get("x-forwarded-for");
  const ip = (fwd?.split(",")[0]?.trim() || h.get("x-real-ip")) ?? null;
  return { ip, ua: h.get("user-agent") };
}

async function auditSafe(
  entry: Parameters<typeof writeAudit>[0],
): Promise<void> {
  try {
    await writeAudit(entry);
  } catch {
    /* writeAudit already swallows; belt-and-suspenders */
  }
}

/** Server-resolved super-admin summary for UI gating (never a client flag). */
export interface SuperAdminSummary {
  authenticated: boolean;
  isSuperAdmin: boolean;
}

/**
 * Resolve whether the CURRENT caller is a super-admin. Host-dev operator → true;
 * a forwarded identity → allow-list membership; denied/unauthenticated → false.
 * Backs the `/api/admin/db/access` endpoint so the Data tab's visibility is
 * decided on the server.
 */
export async function resolveSuperAdmin(): Promise<SuperAdminSummary> {
  const h = await headers();
  const decision = evaluateAuthDecision(h);
  if (decision.decision === "deny") {
    return { authenticated: false, isSuperAdmin: false };
  }
  if (decision.decision === "allow-operator") {
    return { authenticated: true, isSuperAdmin: true };
  }
  const ctx = deriveAuthContext(h);
  const user: UserIdentity = {
    subject: ctx.subject ?? "",
    email: ctx.user.email,
    username: ctx.rawUsername,
  };
  return { authenticated: true, isSuperAdmin: identityIsSuperAdmin(user) };
}

/**
 * Guard: require the caller be BOTH RBAC-authorized for `permission` AND a
 * super-admin. Returns the same {@link RoleResult} shape as `requireRole`, so
 * handlers use `if (!gate.authorized) return gate.response;`.
 *
 * Recognised by the auth-drift auditor (scripts/auth-audit-lib.ts) as a guard.
 */
export async function requireSuperAdmin(
  permission: Permission,
  opts?: { route?: string },
): Promise<RoleResult> {
  // 1) Standard RBAC layer (auth + role + audit). Fails closed on 401/403.
  const roleResult = await requireRole(permission, opts);
  if (!roleResult.authorized) return roleResult;

  // 2) Stricter env super-admin gate on top.
  const h = await headers();
  const decision = evaluateAuthDecision(h);
  const { ip, ua } = auditNet(h);
  const route = opts?.route ?? null;

  if (decision.decision === "allow-operator") {
    await auditSafe({
      event: "authz-superadmin",
      outcome: "allow",
      permission,
      route,
      ip,
      ua,
      subject: null,
      detail: "local-operator",
    });
    return roleResult;
  }

  const ctx = deriveAuthContext(h);
  const user: UserIdentity = {
    subject: ctx.subject ?? "",
    email: ctx.user.email,
    username: ctx.rawUsername,
  };
  if (identityIsSuperAdmin(user)) {
    await auditSafe({
      event: "authz-superadmin",
      outcome: "allow",
      permission,
      route,
      ip,
      ua,
      subject: ctx.subject,
      detail: "allowlisted",
    });
    return roleResult;
  }

  await auditSafe({
    event: "authz-superadmin",
    outcome: "deny",
    permission,
    route,
    ip,
    ua,
    subject: ctx.subject,
    detail: "not-superadmin",
  });
  return {
    authorized: false,
    response: NextResponse.json(
      {
        error: "Forbidden",
        message: "Super-admin access is required for the database console",
      },
      { status: 403 },
    ),
  };
}
