import { describe, it, expect } from "vitest";
import {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  ADMIN_ROLE,
  DEFAULT_ROLE,
  roleHasPermission,
  rolesGrantPermission,
  permissionsForRoles,
  rolesAreAdmin,
} from "@/lib/rbac/permissions";

describe("rbac permission resolution (F5 #101)", () => {
  it("admin role grants every catalog permission", () => {
    for (const perm of PERMISSIONS) {
      expect(roleHasPermission(ADMIN_ROLE, perm)).toBe(true);
    }
  });

  it("default user role grants the non-privileged baseline only", () => {
    expect(roleHasPermission(DEFAULT_ROLE, "terminal:exec")).toBe(true);
    expect(roleHasPermission(DEFAULT_ROLE, "containers:write")).toBe(true);
    expect(roleHasPermission(DEFAULT_ROLE, "recording:write")).toBe(true);
    // Privileged permissions are NOT held by the default role.
    expect(roleHasPermission(DEFAULT_ROLE, "admin:users:read")).toBe(false);
    expect(roleHasPermission(DEFAULT_ROLE, "admin:users:write")).toBe(false);
    expect(roleHasPermission(DEFAULT_ROLE, "admin:db:read")).toBe(false);
    expect(roleHasPermission(DEFAULT_ROLE, "settings:write")).toBe(false);
    expect(roleHasPermission(DEFAULT_ROLE, "mcp:manage")).toBe(false);
  });

  it("unknown role grants no permissions", () => {
    expect(roleHasPermission("nonexistent", "terminal:exec")).toBe(false);
    expect(permissionsForRoles(["nonexistent"])).toEqual([]);
  });

  it("rolesGrantPermission is a union across roles", () => {
    // A user with only the default role cannot read admin users.
    expect(rolesGrantPermission([DEFAULT_ROLE], "admin:users:read")).toBe(
      false,
    );
    // Adding admin grants it.
    expect(
      rolesGrantPermission([DEFAULT_ROLE, ADMIN_ROLE], "admin:users:read"),
    ).toBe(true);
    // Empty roles → never authorized.
    expect(rolesGrantPermission([], "terminal:exec")).toBe(false);
  });

  it("permissionsForRoles dedups and sorts the union", () => {
    const perms = permissionsForRoles([DEFAULT_ROLE, DEFAULT_ROLE]);
    expect(perms).toEqual([...perms].sort());
    expect(new Set(perms).size).toBe(perms.length);
    expect(perms).toContain("terminal:exec");
    expect(perms).not.toContain("admin:users:read");
  });

  it("rolesAreAdmin reflects the admin-UI gating permission", () => {
    expect(rolesAreAdmin([ADMIN_ROLE])).toBe(true);
    expect(rolesAreAdmin([DEFAULT_ROLE])).toBe(false);
    expect(rolesAreAdmin([])).toBe(false);
  });

  it("the ROLE_PERMISSIONS catalog is frozen (cannot be mutated at runtime)", () => {
    expect(Object.isFrozen(ROLE_PERMISSIONS)).toBe(true);
  });
});
