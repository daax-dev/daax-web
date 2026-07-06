import { describe, it, expect } from "vitest";
import {
  classifyAllowlistToken,
  parseAdminAllowlist,
  entryMatchesUser,
  isUserAllowlisted,
  parseGroupRoleMap,
  rolesForGroups,
  canonicalizeSubject,
} from "@/lib/rbac/allowlist";

const SUBJECT = "11111111-2222-3333-4444-555555555555";

describe("canonicalizeSubject (F5 #101)", () => {
  it("lowercases a UUID subject so casing cannot fork the identity key", () => {
    const upper = "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE";
    expect(canonicalizeSubject(upper)).toBe(upper.toLowerCase());
    // idempotent for an already-lowercase UUID
    expect(canonicalizeSubject(upper.toLowerCase())).toBe(upper.toLowerCase());
  });

  it("leaves a non-UUID subject untouched (never blindly lowercased)", () => {
    expect(canonicalizeSubject("JPoley")).toBe("JPoley");
    expect(canonicalizeSubject("Alice@Example.com")).toBe("Alice@Example.com");
  });
});

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

  it("subject UUID entries match case-insensitively (canonical lowercase value)", () => {
    const upper = SUBJECT.toUpperCase();
    // Uppercase env entry is canonicalised to lowercase.
    const upperEntry = classifyAllowlistToken(upper)!;
    expect(upperEntry.value).toBe(SUBJECT); // lowercased
    // Uppercase env entry matches a lowercase forwarded subject.
    expect(
      entryMatchesUser(upperEntry, {
        subject: SUBJECT,
        email: null,
        username: null,
      }),
    ).toBe(true);
    // Lowercase env entry matches an uppercase forwarded subject.
    const lowerEntry = classifyAllowlistToken(SUBJECT)!;
    expect(
      entryMatchesUser(lowerEntry, {
        subject: upper,
        email: null,
        username: null,
      }),
    ).toBe(true);
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

  it("lowercases role names (roles are seeded lowercase); group names stay case-sensitive", () => {
    const map = parseGroupRoleMap("eng:Admin, Ops:USER");
    expect(map.get("eng")).toEqual(new Set(["admin"]));
    expect(map.get("Ops")).toEqual(new Set(["user"]));
    expect(map.has("ops")).toBe(false);

    expect(rolesForGroups(["eng"], map)).toEqual(["admin"]);
    expect(rolesForGroups(["Ops"], map)).toEqual(["user"]);
  });
});
