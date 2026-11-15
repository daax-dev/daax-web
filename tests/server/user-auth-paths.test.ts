/**
 * Per-user credential stores and the legacy-dir migration (dx#119).
 * Host-mode layout (HOST_WORKSPACE_PATH unset), against a temp HOME.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  getUserAuthPaths,
  legacyCredentialsOwner,
} from "@/server/docker/auth-paths";

const A = "aaaaaaaa-0000-4000-8000-00000000000a";
const ADMIN = "cccccccc-0000-4000-8000-00000000000c";
const LEGACY = {
  claudeHostPath: "/legacy/.daax/claude",
  openCodeHostPath: "/legacy/.daax/opencode",
};

let home: string;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "daax-user-auth-"));
  vi.stubEnv("HOME", home);
});
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(home, { recursive: true, force: true });
});

describe("getUserAuthPaths", () => {
  it("gives each user their own store, created 0700 on first use", () => {
    const p = getUserAuthPaths(A, LEGACY, { DAAX_ADMIN_USERS: ADMIN });
    expect(p.legacy).toBe(false);
    expect(p.claudeHostPath).toBe(join(home, ".daax", "users", A, "claude"));
    expect(p.openCodeHostPath).toBe(
      join(home, ".daax", "users", A, "opencode"),
    );
    expect(existsSync(p.claudeHostPath)).toBe(true);
    expect(statSync(p.claudeHostPath).mode & 0o777).toBe(0o700);
  });

  it("never hands one user another user's store", () => {
    const a = getUserAuthPaths(A, LEGACY, {});
    const b = getUserAuthPaths(
      "bbbbbbbb-0000-4000-8000-00000000000b",
      LEGACY,
      {},
    );
    expect(a.claudeHostPath).not.toBe(b.claudeHostPath);
    expect(a.claudeHostPath).not.toBe(LEGACY.claudeHostPath);
  });

  it("maps the legacy shared store to the operator and the legacy admin only", () => {
    expect(getUserAuthPaths("local", LEGACY, {}).legacy).toBe(true);
    const env = { DAAX_ADMIN_USERS: `${ADMIN} someone@example.com` };
    expect(getUserAuthPaths(ADMIN, LEGACY, env)).toEqual({
      ...LEGACY,
      legacy: true,
    });
    expect(getUserAuthPaths(A, LEGACY, env).legacy).toBe(false);
  });

  it("DAAX_LEGACY_CREDENTIALS_OWNER overrides the first admin subject", () => {
    const env = {
      DAAX_ADMIN_USERS: ADMIN,
      DAAX_LEGACY_CREDENTIALS_OWNER: A.toUpperCase(),
    };
    expect(legacyCredentialsOwner(env)).toBe(A);
    expect(getUserAuthPaths(A, LEGACY, env).legacy).toBe(true);
    expect(getUserAuthPaths(ADMIN, LEGACY, env).legacy).toBe(false);
  });

  it("a hostile owner key cannot escape the users dir", () => {
    const p = getUserAuthPaths("../../etc", LEGACY, {});
    expect(
      p.claudeHostPath.startsWith(join(home, ".daax", "users") + "/"),
    ).toBe(true);
    expect(p.claudeHostPath).not.toContain("..");
  });

  it("does not move or delete anything (non-destructive migration)", () => {
    getUserAuthPaths("local", LEGACY, {});
    expect(existsSync(join(home, ".daax", "users"))).toBe(false);
  });
});
