/**
 * lib/tenancy/ownership.ts — the reusable owner/admin gate (dx#119).
 */
import { describe, it, expect } from "vitest";

import {
  OPERATOR_OWNER,
  canAccessOwned,
  filterOwned,
  hasPermission,
  ownerDirName,
  ownerFromLabels,
  ownerKeyFor,
  requireOwnerOrAdmin,
  type Principal,
} from "@/lib/tenancy/ownership";

const A = "aaaaaaaa-0000-4000-8000-00000000000a";
const B = "bbbbbbbb-0000-4000-8000-00000000000b";
const user = (subject: string): Principal => ({
  subject,
  operator: false,
  admin: false,
  permissions: ["terminal:exec"],
});
const admin: Principal = {
  subject: "cccccccc-0000-4000-8000-00000000000c",
  operator: false,
  admin: true,
  permissions: [],
};
const operator: Principal = {
  subject: null,
  operator: true,
  admin: true,
  permissions: [],
};

describe("requireOwnerOrAdmin", () => {
  it("allows the owner", () => {
    expect(requireOwnerOrAdmin(user(A), { owner: A })).toEqual({ ok: true });
  });

  it("matches the owner case-insensitively (canonical UUIDs)", () => {
    expect(requireOwnerOrAdmin(user(A), { owner: A.toUpperCase() }).ok).toBe(
      true,
    );
  });

  it("another tenant's resource is a 404, not a 403", () => {
    expect(requireOwnerOrAdmin(user(A), { owner: B })).toEqual({
      ok: false,
      status: 404,
      reason: "not-owner",
    });
  });

  it("missing and not-yours produce the same status", () => {
    const missing = requireOwnerOrAdmin(user(A), null);
    const theirs = requireOwnerOrAdmin(user(A), { owner: B });
    expect(missing.ok).toBe(false);
    expect(theirs.ok).toBe(false);
    if (!missing.ok && !theirs.ok) expect(missing.status).toBe(theirs.status);
  });

  it("an unowned (legacy) resource is admin-only", () => {
    expect(requireOwnerOrAdmin(user(A), { owner: null }).ok).toBe(false);
    expect(requireOwnerOrAdmin(user(A), {}).ok).toBe(false);
    expect(requireOwnerOrAdmin(user(A), { owner: "  " }).ok).toBe(false);
    expect(requireOwnerOrAdmin(admin, { owner: null }).ok).toBe(true);
  });

  it("an admin acts on everyone's resources", () => {
    expect(requireOwnerOrAdmin(admin, { owner: A }).ok).toBe(true);
    expect(requireOwnerOrAdmin(admin, { owner: B }).ok).toBe(true);
  });

  it("a principal with no subject and no operator flag owns nothing", () => {
    const anon: Principal = { ...user(A), subject: null };
    expect(canAccessOwned(anon, { owner: "local" })).toBe(false);
    expect(ownerKeyFor(anon)).toBeNull();
  });
});

describe("owner keys", () => {
  it("is the subject, or 'local' for the operator", () => {
    expect(ownerKeyFor(user(A))).toBe(A);
    expect(ownerKeyFor(operator)).toBe(OPERATOR_OWNER);
  });

  it("filterOwned keeps only the caller's items unless admin", () => {
    const items = [{ o: A }, { o: B }, { o: undefined }];
    expect(filterOwned(user(A), items, (i) => i.o)).toEqual([{ o: A }]);
    expect(filterOwned(admin, items, (i) => i.o)).toHaveLength(3);
  });

  it("hasPermission reads the principal's permissions", () => {
    expect(hasPermission(user(A), "terminal:exec")).toBe(true);
    expect(hasPermission(user(A), "recording:write")).toBe(false);
  });
});

describe("ownerFromLabels", () => {
  it("reads dockerode label objects", () => {
    expect(ownerFromLabels({ "daax.owner": A, x: "y" })).toBe(A);
    expect(ownerFromLabels({ x: "y" })).toBeNull();
    expect(ownerFromLabels(null)).toBeNull();
  });

  it("reads docker ps '{{json .}}' label strings", () => {
    expect(ownerFromLabels(`a=b,daax.owner=${A},c=d`)).toBe(A);
    expect(ownerFromLabels("daax.ownerx=evil")).toBeNull();
    expect(ownerFromLabels("")).toBeNull();
  });
});

describe("ownerDirName", () => {
  it("passes UUIDs and simple keys through, lowercased", () => {
    expect(ownerDirName(A.toUpperCase())).toBe(A);
    expect(ownerDirName("local")).toBe("local");
  });

  it.each(["../etc", "a/b", "..", ".hidden", "x\0y", "a b"])(
    "hex-encodes %j so it can never traverse",
    (key) => {
      const dir = ownerDirName(key);
      expect(dir).toMatch(/^x-[0-9a-f]+$/);
    },
  );
});
