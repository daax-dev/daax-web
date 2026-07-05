import { describe, it, expect } from "vitest";
import {
  classifyAllowlistToken,
  parseAdminAllowlist,
  entryMatchesUser,
  isUserAllowlisted,
  parseGroupRoleMap,
  rolesForGroups,
} from "@/lib/rbac/allowlist";

const SUBJECT = "11111111-2222-3333-4444-555555555555";

describe("admin allow-list parsing + matching (F5 #101)", () => {
  it("classifies a UUID token as a subject match", () => {
    const e = classifyAllowlistToken(SUBJECT);
    expect(e).toEqual({ raw: SUBJECT, kind: "subject", value: SUBJECT });
  });

  it("classifies an email/username token as a lowercased attr match", () => {
    expect(classifyAllowlistToken("JP@Example.com")).toEqual({
      raw: "JP@Example.com",
      kind: "attr",
      value: "jp@example.com",
    });
    expect(classifyAllowlistToken("  jpoley  ")).toEqual({
      raw: "jpoley",
      kind: "attr",
      value: "jpoley",
    });
  });

  it("empty/whitespace tokens classify to null", () => {
    expect(classifyAllowlistToken("   ")).toBeNull();
    expect(classifyAllowlistToken("")).toBeNull();
  });

  it("parses comma/whitespace-separated lists and dedups", () => {
    const entries = parseAdminAllowlist(
      `${SUBJECT}, jp@example.com jpoley, jp@example.com`,
    );
    expect(entries).toHaveLength(3);
    expect(entries.map((e) => e.value)).toEqual([
      SUBJECT,
      "jp@example.com",
      "jpoley",
    ]);
  });

  it("undefined/empty allow-list yields no entries", () => {
    expect(parseAdminAllowlist(undefined)).toEqual([]);
    expect(parseAdminAllowlist("")).toEqual([]);
  });

  it("subject entry matches ONLY on exact subject, never on attrs", () => {
    const entry = classifyAllowlistToken(SUBJECT)!;
    expect(
      entryMatchesUser(entry, {
        subject: SUBJECT,
        email: "x@y.z",
        username: "someone",
      }),
    ).toBe(true);
    expect(
      entryMatchesUser(entry, {
        subject: "other-subject",
        email: SUBJECT, // must NOT match — subject is exact against users.subject
        username: SUBJECT,
      }),
    ).toBe(false);
  });

  it("attr entry matches email OR username case-insensitively", () => {
    const entry = classifyAllowlistToken("JP@Example.com")!;
    expect(
      entryMatchesUser(entry, {
        subject: SUBJECT,
        email: "jp@EXAMPLE.com",
        username: null,
      }),
    ).toBe(true);
    const uEntry = classifyAllowlistToken("JPoley")!;
    expect(
      entryMatchesUser(uEntry, {
        subject: SUBJECT,
        email: null,
        username: "jpoley",
      }),
    ).toBe(true);
    expect(
      entryMatchesUser(uEntry, {
        subject: SUBJECT,
        email: "nomatch@x.z",
        username: "different",
      }),
    ).toBe(false);
  });

  it("isUserAllowlisted is a union over entries", () => {
    const entries = parseAdminAllowlist("jp@example.com, admin2");
    expect(
      isUserAllowlisted(entries, {
        subject: SUBJECT,
        email: "jp@example.com",
        username: "jp",
      }),
    ).toBe(true);
    expect(
      isUserAllowlisted(entries, {
        subject: SUBJECT,
        email: "nobody@x.z",
        username: "nobody",
      }),
    ).toBe(false);
  });

  it("parses a group→role map and resolves roles for groups", () => {
    const map = parseGroupRoleMap("daax-admins:admin, devs:user , broken");
    expect(map.get("daax-admins")).toEqual(new Set(["admin"]));
    expect(map.get("devs")).toEqual(new Set(["user"]));
    expect(map.has("broken")).toBe(false);

    expect(rolesForGroups(["daax-admins"], map)).toEqual(["admin"]);
    expect(rolesForGroups(["daax-admins", "devs"], map)).toEqual([
      "admin",
      "user",
    ]);
    expect(rolesForGroups(["unmapped"], map)).toEqual([]);
  });
});
