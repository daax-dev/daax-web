import { describe, it, expect } from "vitest";
import { parseAdminAllowlist } from "@/lib/rbac/allowlist";
import { computeReconcilePlan } from "@/lib/rbac/reconcile-plan";

const SUBJECT = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

describe("reconcile diff logic (F5 #101)", () => {
  it("grants directly to an existing user matched by email", () => {
    const entries = parseAdminAllowlist("jp@example.com");
    const plan = computeReconcilePlan(
      entries,
      [{ subject: SUBJECT, email: "jp@example.com", username: "jp" }],
      [], // no existing reconcile grants
      [], // no pending grants
    );
    expect(plan.userRoleGrantsToAdd).toEqual([
      { subject: SUBJECT, role: "admin" },
    ]);
    expect(plan.pendingGrantsToAdd).toEqual([]);
    expect(plan.userRoleGrantsToPrune).toEqual([]);
  });

  it("creates a PENDING grant for an allow-listed admin who has not logged in", () => {
    const entries = parseAdminAllowlist("newadmin@example.com");
    const plan = computeReconcilePlan(entries, [], [], []);
    expect(plan.pendingGrantsToAdd).toEqual([
      { identifier: "newadmin@example.com", role: "admin" },
    ]);
    expect(plan.userRoleGrantsToAdd).toEqual([]);
  });

  it("is idempotent: already-applied grants produce no adds", () => {
    const entries = parseAdminAllowlist(`${SUBJECT}, pending@example.com`);
    const plan = computeReconcilePlan(
      entries,
      [{ subject: SUBJECT, email: null, username: null }],
      [{ subject: SUBJECT, role: "admin" }], // already granted by reconcile
      [{ identifier: "pending@example.com", role: "admin" }], // already pending
    );
    expect(plan.userRoleGrantsToAdd).toEqual([]);
    expect(plan.pendingGrantsToAdd).toEqual([]);
    expect(plan.userRoleGrantsToPrune).toEqual([]);
    expect(plan.pendingGrantsToPrune).toEqual([]);
  });

  it("prunes a reconcile grant no longer on the allow-list", () => {
    const entries = parseAdminAllowlist(""); // allow-list emptied
    const plan = computeReconcilePlan(
      entries,
      [{ subject: SUBJECT, email: "jp@example.com", username: "jp" }],
      [{ subject: SUBJECT, role: "admin" }], // stale reconcile grant
      [{ identifier: "old@example.com", role: "admin" }], // stale pending
    );
    expect(plan.userRoleGrantsToPrune).toEqual([
      { subject: SUBJECT, role: "admin" },
    ]);
    expect(plan.pendingGrantsToPrune).toEqual([
      { identifier: "old@example.com", role: "admin" },
    ]);
    expect(plan.userRoleGrantsToAdd).toEqual([]);
  });

  it("only reconcile-owned grants are candidates for pruning (caller passes reconcile-only)", () => {
    // The pure function is fed ONLY reconcile grants (store.ts filters by
    // granted_by='reconcile'); a UI grant never appears here, so it can never be
    // pruned. Model that: an existing user with a UI grant not represented in the
    // reconcile-grant input is untouched.
    const entries = parseAdminAllowlist("");
    const plan = computeReconcilePlan(
      entries,
      [{ subject: SUBJECT, email: null, username: null }],
      [], // reconcile grants only — UI grant intentionally absent
      [],
    );
    expect(plan.userRoleGrantsToPrune).toEqual([]);
  });

  it("transitions pending→direct when the user later exists", () => {
    // Same admin, now with a users row: entry matches the user, so a direct
    // grant is desired and the stale pending row is pruned.
    const entries = parseAdminAllowlist("late@example.com");
    const plan = computeReconcilePlan(
      entries,
      [{ subject: SUBJECT, email: "late@example.com", username: null }],
      [],
      [{ identifier: "late@example.com", role: "admin" }],
    );
    expect(plan.userRoleGrantsToAdd).toEqual([
      { subject: SUBJECT, role: "admin" },
    ]);
    expect(plan.pendingGrantsToPrune).toEqual([
      { identifier: "late@example.com", role: "admin" },
    ]);
  });
});
