import { describe, it, expect } from "vitest";
import {
  identityIsSuperAdmin,
  dbConsoleWritesEnabled,
  SUPERADMIN_ENV,
  DB_CONSOLE_WRITES_ENV,
} from "@/lib/db-console/super-admin";
import type { UserIdentity } from "@/lib/rbac/allowlist";

function env(overrides: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return { ...process.env, ...overrides } as NodeJS.ProcessEnv;
}

const alice: UserIdentity = {
  subject: "11111111-1111-1111-1111-111111111111",
  email: "alice@example.com",
  username: "alice",
};

describe("db-console super-admin gate (F6 #102)", () => {
  describe("identityIsSuperAdmin (env allow-list, disjoint from RBAC)", () => {
    it("fails closed when the allow-list is unset/empty", () => {
      expect(
        identityIsSuperAdmin(alice, env({ [SUPERADMIN_ENV]: undefined })),
      ).toBe(false);
      expect(identityIsSuperAdmin(alice, env({ [SUPERADMIN_ENV]: "  " }))).toBe(
        false,
      );
    });

    it("matches by subject (exact)", () => {
      expect(
        identityIsSuperAdmin(alice, env({ [SUPERADMIN_ENV]: alice.subject })),
      ).toBe(true);
    });

    it("matches by email/username (case-insensitive)", () => {
      expect(
        identityIsSuperAdmin(
          alice,
          env({ [SUPERADMIN_ENV]: "ALICE@EXAMPLE.COM" }),
        ),
      ).toBe(true);
      expect(
        identityIsSuperAdmin(alice, env({ [SUPERADMIN_ENV]: "alice" })),
      ).toBe(true);
    });

    it("does NOT match an admin who is not on the allow-list", () => {
      const bob: UserIdentity = {
        subject: "22222222-2222-2222-2222-222222222222",
        email: "bob@example.com",
        username: "bob",
      };
      expect(
        identityIsSuperAdmin(
          bob,
          env({ [SUPERADMIN_ENV]: "alice@example.com" }),
        ),
      ).toBe(false);
    });
  });

  describe("dbConsoleWritesEnabled (D4 — off by default)", () => {
    it("is false when unset", () => {
      expect(
        dbConsoleWritesEnabled(env({ [DB_CONSOLE_WRITES_ENV]: undefined })),
      ).toBe(false);
    });

    it.each(["1", "true", "TRUE", "yes", "on"])("is true for %j", (v) => {
      expect(dbConsoleWritesEnabled(env({ [DB_CONSOLE_WRITES_ENV]: v }))).toBe(
        true,
      );
    });

    it.each(["0", "false", "no", "off", ""])("is false for %j", (v) => {
      expect(dbConsoleWritesEnabled(env({ [DB_CONSOLE_WRITES_ENV]: v }))).toBe(
        false,
      );
    });
  });
});
