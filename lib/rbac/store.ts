/**
 * RBAC persistence layer (F5 — issue #101).
 *
 * All identity/role/audit DB access lives here, against the shared `pg` pool
 * (`lib/db/pg.ts`). The tricky, security-load-bearing mechanisms are:
 *
 *   - JIT provisioning via `INSERT ... ON CONFLICT (subject) DO UPDATE ...
 *     RETURNING (xmax = 0) AS is_new`. `xmax = 0` is true ONLY on a genuine
 *     INSERT, false on the ON-CONFLICT update. The default role is granted ONLY
 *     when is_new — so a user whose roles were all revoked is NOT re-granted the
 *     default on their next request (the deauthorised-user regrant bug the
 *     reference-platform comment warns about, docs §3 F5). A "zero roles" check
 *     would reintroduce exactly that bug and is deliberately avoided.
 *
 *   - Boot reconcile under `pg_advisory_xact_lock`, so concurrent replica boots
 *     serialise on the same advisory key and never double-apply / race.
 *
 * The pure diff/permission/allow-list logic lives in sibling modules and is
 * unit-tested without a DB; this module wires those into SQL.
 */

import type { PoolClient } from "pg";
import { getClient, query } from "@/lib/db/pg";
import {
  parseAdminAllowlist,
  parseGroupRoleMap,
  rolesForGroups,
} from "./allowlist";
import { computeReconcilePlan, type ReconcilePlan } from "./reconcile-plan";
import { DEFAULT_ROLE, ADMIN_ROLE } from "./permissions";

/** Grant provenance markers. Reconcile prunes ONLY 'reconcile' grants. */
export const GRANT_JIT_DEFAULT = "jit-default";
export const GRANT_RECONCILE = "reconcile";
export const GRANT_GROUP_SYNC = "group-sync";
export const GRANT_UI = "ui";

/**
 * Advisory-lock key for boot reconcile. A fixed 64-bit constant so every
 * replica's reconcile serialises on the same lock (multi-replica boot safety,
 * docs §4). Arbitrary but stable; xact-scoped so it releases on COMMIT/ROLLBACK.
 */
const RECONCILE_LOCK_KEY = "6461617872626163"; // fixed 64-bit key (decimal, fits signed bigint)

/** A forwarded identity ready for JIT provisioning. */
export interface JitIdentity {
  subject: string;
  username: string | null;
  email: string | null;
  name: string | null;
  idp: string | null;
  groups: readonly string[];
}

/** One row for the append-only audit log. Every field but `event`/`outcome` optional. */
export interface AuditEntry {
  event: string;
  outcome: string;
  subject?: string | null;
  permission?: string | null;
  route?: string | null;
  ip?: string | null;
  ua?: string | null;
  detail?: string | null;
}

async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getClient();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore rollback errors */
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Append one row to `auth_audit`. Best-effort: a failed audit write is logged
 * but NEVER thrown, so an audit-store outage cannot break an authorization
 * decision or a login (docs §4 — audit write failures must not fail the request).
 */
export async function writeAudit(entry: AuditEntry): Promise<void> {
  try {
    await query(
      `INSERT INTO auth_audit (event, subject, permission, route, ip, ua, outcome, detail)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        entry.event,
        entry.subject ?? null,
        entry.permission ?? null,
        entry.route ?? null,
        entry.ip ?? null,
        entry.ua ?? null,
        entry.outcome,
        entry.detail ?? null,
      ],
    );
  } catch (err) {
    console.error(
      "[rbac] auth_audit write failed (decision stands):",
      err instanceof Error ? err.message : err,
    );
  }
}

/** The set of role names that exist in the `roles` table. */
async function existingRoleNames(client: PoolClient): Promise<Set<string>> {
  const res = await client.query<{ name: string }>("SELECT name FROM roles");
  return new Set(res.rows.map((r) => r.name));
}

/**
 * Materialise any `pending_grants` that now match this user (by subject, or by
 * lowercased email/username) into `user_roles`, preserving `granted_by`, then
 * delete the consumed pending rows. This is how an allow-listed admin who had
 * never logged in becomes authorised on FIRST login (first-admin bootstrap).
 */
async function materializePendingGrants(
  client: PoolClient,
  id: JitIdentity,
): Promise<void> {
  const email = id.email?.trim().toLowerCase() ?? null;
  const username = id.username?.trim().toLowerCase() ?? null;
  // Match pending identifiers against the subject or the lowercased attrs.
  const res = await client.query<{ role: string; granted_by: string }>(
    `SELECT role, granted_by FROM pending_grants
      WHERE identifier = $1
         OR ($2::text IS NOT NULL AND identifier = $2)
         OR ($3::text IS NOT NULL AND identifier = $3)`,
    [id.subject, email, username],
  );
  for (const row of res.rows) {
    await client.query(
      `INSERT INTO user_roles (subject, role, granted_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (subject, role) DO NOTHING`,
      [id.subject, row.role, row.granted_by],
    );
  }
  // Consume the pending rows we just matched.
  await client.query(
    `DELETE FROM pending_grants
      WHERE identifier = $1
         OR ($2::text IS NOT NULL AND identifier = $2)
         OR ($3::text IS NOT NULL AND identifier = $3)`,
    [id.subject, email, username],
  );
}

/**
 * Sync the user's group-derived roles. Group→role grants carry
 * granted_by='group-sync' so they are (a) refreshed on every login and (b)
 * never confused with reconcile/UI grants. Only roles that EXIST in the roles
 * table are granted (an unmapped role name is ignored, not an FK crash).
 */
async function syncGroupRoles(
  client: PoolClient,
  id: JitIdentity,
  groupRoleMap: Map<string, Set<string>>,
): Promise<void> {
  // No group→role mapping configured (no DAAX_GROUP_ROLE_MAP): nothing can be
  // group-granted, so skip the `roles` table roundtrip that jitProvision would
  // otherwise pay on EVERY requireRole/resolveAccess. Still fall through to the
  // prune below so any group-sync grants left over from a previously-configured
  // mapping are revoked (empty `desired` prunes them all).
  let desired: string[] = [];
  if (groupRoleMap.size > 0) {
    const known = await existingRoleNames(client);
    desired = rolesForGroups(id.groups, groupRoleMap).filter((r) =>
      known.has(r),
    );
  }

  // Remove group-sync grants no longer justified by current group membership.
  await client.query(
    `DELETE FROM user_roles
      WHERE subject = $1 AND granted_by = $2
        AND ($3::text[] = '{}' OR role <> ALL($3::text[]))`,
    [id.subject, GRANT_GROUP_SYNC, desired],
  );
  // Add currently-desired group roles (no-op if already granted by any source).
  for (const role of desired) {
    await client.query(
      `INSERT INTO user_roles (subject, role, granted_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (subject, role) DO NOTHING`,
      [id.subject, role, GRANT_GROUP_SYNC],
    );
  }
}

/** Result of a JIT provisioning pass. */
export interface JitResult {
  isNew: boolean;
  roles: string[];
}

/**
 * Just-in-time provision the user and resolve their effective roles.
 *
 * Runs in a single transaction:
 *   1. upsert `users` keyed on the stable subject; RETURNING (xmax=0) → is_new.
 *   2. is_new ONLY: grant the default role (granted_by='jit-default').
 *   3. materialise any matching pending_grants (first-admin bootstrap).
 *   4. sync group-derived roles.
 *   5. return the user's current effective role names.
 *
 * @param groupRoleMap defaults to `DAAX_GROUP_ROLE_MAP` when omitted.
 */
export async function jitProvision(
  id: JitIdentity,
  groupRoleMap: Map<string, Set<string>> = parseGroupRoleMap(
    process.env.DAAX_GROUP_ROLE_MAP,
  ),
): Promise<JitResult> {
  return withTransaction(async (client) => {
    const upsert = await client.query<{ is_new: boolean }>(
      `INSERT INTO users (subject, username, email, name, idp, last_seen)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (subject) DO UPDATE
         SET username = EXCLUDED.username,
             email    = EXCLUDED.email,
             name     = EXCLUDED.name,
             idp      = COALESCE(EXCLUDED.idp, users.idp),
             last_seen = now()
       RETURNING (xmax = 0) AS is_new`,
      [id.subject, id.username, id.email, id.name, id.idp],
    );
    const isNew = upsert.rows[0]?.is_new === true;

    // Default role ONLY on a genuine insert — never re-granted to an existing
    // user (revocation-safe). A "zero roles" fallback would reintroduce the
    // deauthorised-user regrant bug and is intentionally NOT used.
    if (isNew) {
      await client.query(
        `INSERT INTO user_roles (subject, role, granted_by)
         VALUES ($1, $2, $3)
         ON CONFLICT (subject, role) DO NOTHING`,
        [id.subject, DEFAULT_ROLE, GRANT_JIT_DEFAULT],
      );
    }

    await materializePendingGrants(client, id);
    await syncGroupRoles(client, id, groupRoleMap);

    const rolesRes = await client.query<{ role: string }>(
      "SELECT role FROM user_roles WHERE subject = $1 ORDER BY role",
      [id.subject],
    );
    return { isNew, roles: rolesRes.rows.map((r) => r.role) };
  });
}

/** Read a user's current effective role names (no provisioning side effects). */
export async function getUserRoles(subject: string): Promise<string[]> {
  const res = await query<{ role: string }>(
    "SELECT role FROM user_roles WHERE subject = $1 ORDER BY role",
    [subject],
  );
  return res.rows.map((r) => r.role);
}

/**
 * Grant a role to an existing user (UI provenance by default). Idempotent.
 *
 * Provenance precedence — explicit UI grants win: when the (subject, role) row
 * already exists with a non-'ui' provenance (e.g. 'group-sync') and this call
 * is an explicit UI grant, the row is UPGRADED to granted_by='ui' so a later
 * group-sync / reconcile prune (which only deletes rows of its OWN provenance)
 * can never silently revoke an operator's explicit grant. Non-'ui' callers
 * never downgrade an existing row.
 */
export async function grantRole(
  subject: string,
  role: string,
  grantedBy: string = GRANT_UI,
): Promise<void> {
  await query(
    `INSERT INTO user_roles (subject, role, granted_by)
     VALUES ($1, $2, $3)
     ON CONFLICT (subject, role) DO UPDATE SET granted_by = EXCLUDED.granted_by
       WHERE EXCLUDED.granted_by = $4 AND user_roles.granted_by <> $4`,
    [subject, role, grantedBy, GRANT_UI],
  );
}

/** Revoke a single role grant from a user. */
export async function revokeRole(subject: string, role: string): Promise<void> {
  await query("DELETE FROM user_roles WHERE subject = $1 AND role = $2", [
    subject,
    role,
  ]);
}

/** Revoke ALL role grants from a user (used to test revocation safety). */
export async function revokeAllRoles(subject: string): Promise<void> {
  await query("DELETE FROM user_roles WHERE subject = $1", [subject]);
}

/**
 * Boot reconcile: project `DAAX_ADMIN_USERS` onto the identity store under a
 * transaction-scoped advisory lock, granting/pruning ONLY reconcile-owned
 * grants. Returns the applied plan (also usable as a dry-run report when
 * `dryRun` is true — computes the diff, acquires the lock, but writes nothing).
 *
 * ⚠️ REVOCATION IS BOOT-ONLY: reconcile runs once at server startup
 * (instrumentation.ts). Removing a user from `DAAX_ADMIN_USERS` does NOT revoke
 * their admin role until the app RESTARTS, and any unconsumed pending grant
 * (an allow-listed admin who never logged in) persists across boots until it is
 * either consumed at first login or reconcile prunes it on a later boot with the
 * entry removed. To revoke immediately, restart the app (or delete the grant via
 * the RBAC store). A future enhancement could expire stale pending grants by age.
 *
 * @param env    environment to read `DAAX_ADMIN_USERS` from (injectable for tests).
 * @param dryRun when true, compute + return the plan without applying it.
 */
export async function reconcile(
  env: NodeJS.ProcessEnv = process.env,
  dryRun = false,
): Promise<ReconcilePlan> {
  const entries = parseAdminAllowlist(env.DAAX_ADMIN_USERS);

  const plan = await withTransaction(async (client) => {
    // Serialise concurrent replica boots on a fixed advisory key (xact-scoped).
    await client.query("SELECT pg_advisory_xact_lock($1)", [
      RECONCILE_LOCK_KEY,
    ]);

    const users = await client.query<{
      subject: string;
      email: string | null;
      username: string | null;
    }>("SELECT subject, email, username FROM users");

    const existingUserRoles = await client.query<{
      subject: string;
      role: string;
    }>("SELECT subject, role FROM user_roles WHERE granted_by = $1", [
      GRANT_RECONCILE,
    ]);

    const existingPending = await client.query<{
      identifier: string;
      role: string;
    }>("SELECT identifier, role FROM pending_grants");

    const computed = computeReconcilePlan(
      entries,
      users.rows,
      existingUserRoles.rows,
      existingPending.rows,
      ADMIN_ROLE,
    );

    if (dryRun) return computed;

    for (const g of computed.userRoleGrantsToAdd) {
      await client.query(
        `INSERT INTO user_roles (subject, role, granted_by)
         VALUES ($1, $2, $3)
         ON CONFLICT (subject, role) DO NOTHING`,
        [g.subject, g.role, GRANT_RECONCILE],
      );
    }
    // Prune ONLY reconcile-owned user_roles — UI / default / group grants survive.
    for (const g of computed.userRoleGrantsToPrune) {
      await client.query(
        "DELETE FROM user_roles WHERE subject = $1 AND role = $2 AND granted_by = $3",
        [g.subject, g.role, GRANT_RECONCILE],
      );
    }
    for (const g of computed.pendingGrantsToAdd) {
      await client.query(
        `INSERT INTO pending_grants (identifier, role, granted_by)
         VALUES ($1, $2, $3)
         ON CONFLICT (identifier, role) DO NOTHING`,
        [g.identifier, g.role, GRANT_RECONCILE],
      );
    }
    for (const g of computed.pendingGrantsToPrune) {
      await client.query(
        "DELETE FROM pending_grants WHERE identifier = $1 AND role = $2",
        [g.identifier, g.role],
      );
    }
    return computed;
  });

  if (!dryRun) {
    await writeAudit({
      event: "reconcile",
      outcome: "applied",
      detail: JSON.stringify({
        added: plan.userRoleGrantsToAdd.length,
        pruned: plan.userRoleGrantsToPrune.length,
        pendingAdded: plan.pendingGrantsToAdd.length,
        pendingPruned: plan.pendingGrantsToPrune.length,
      }),
    });
  }
  return plan;
}
