import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Drive next/headers per test (only its identity matters — the header VALUES
// are irrelevant because evaluateAuthDecision/deriveAuthContext are mocked).
const mockHeaders = vi.fn(() => ({ get: () => null }) as unknown as Headers);
vi.mock("next/headers", () => ({ headers: () => mockHeaders() }));

// NextResponse.json → plain { body, status } so we can assert on the 403.
vi.mock("next/server", () => ({
  NextResponse: {
    json: vi.fn((body, init) => ({ body, status: init?.status })),
  },
}));

// requireSuperAdmin LAYERS ON TOP of requireRole — mock the RBAC layer so these
// tests isolate the STRICTER env super-admin gate (the layer under test).
const { requireRole } = vi.hoisted(() => ({ requireRole: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireRole }));

// The trust decision + identity derivation are mocked so each test can pin the
// caller as deny / local-operator / forwarded-identity deterministically.
const { evaluateAuthDecision, deriveAuthContext } = vi.hoisted(() => ({
  evaluateAuthDecision: vi.fn(),
  deriveAuthContext: vi.fn(),
}));
vi.mock("@/lib/auth-trust", () => ({
  evaluateAuthDecision,
  deriveAuthContext,
}));

// Audit sink — assert the gate records allow/deny outcomes.
const { writeAudit } = vi.hoisted(() => ({
  writeAudit: vi.fn(async () => {}),
}));
vi.mock("@/lib/rbac/store", () => ({ writeAudit }));

import {
  requireSuperAdmin,
  resolveSuperAdmin,
  SUPERADMIN_ENV,
} from "@/lib/db-console/super-admin";
import type { AuthUser } from "@/lib/auth-types";

const SUPER_SUBJECT = "11111111-1111-1111-1111-111111111111";
const NON_SUPER_SUBJECT = "22222222-2222-2222-2222-222222222222";

const USER: AuthUser = {
  authenticated: true,
  email: null,
  username: null,
  groups: [],
  pictureUrl: null,
};

/** An authorized RoleResult, as requireRole would return on allow. */
function roleAllow(subject: string | null) {
  return { authorized: true as const, user: USER, subject };
}

/** Build the deriveAuthContext return for a forwarded identity. */
function ctxFor(subject: string | null, email: string | null = null) {
  return {
    user: { ...USER, email },
    subject,
    rawUsername: null,
  };
}

describe("db-console super-admin GATE (requireSuperAdmin / resolveSuperAdmin) — F6 #102", () => {
  const savedEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    mockHeaders.mockReturnValue({ get: () => null } as unknown as Headers);
    // Allow-list contains only the super subject (subject-kind entry).
    process.env[SUPERADMIN_ENV] = SUPER_SUBJECT;
  });

  afterEach(() => {
    for (const k of Object.keys(process.env)) {
      if (!(k in savedEnv)) delete process.env[k];
    }
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v !== undefined) process.env[k] = v;
    }
    delete process.env[SUPERADMIN_ENV];
  });

  describe("requireSuperAdmin", () => {
    it("propagates the RBAC denial WITHOUT reaching the env gate (fails closed on requireRole)", async () => {
      const denied = {
        authorized: false as const,
        response: { body: { error: "Forbidden" }, status: 403 },
      };
      requireRole.mockResolvedValueOnce(denied);

      const gate = await requireSuperAdmin("admin:db:read");
      expect(gate).toBe(denied);
      // The env layer never ran: no decision evaluation, no super-admin audit.
      expect(evaluateAuthDecision).not.toHaveBeenCalled();
      expect(writeAudit).not.toHaveBeenCalled();
    });

    it("DENIES (403) an authenticated non-super-admin (RBAC-authorized but not allow-listed) and audits it", async () => {
      // RBAC layer authorizes the subject (e.g. a normal `admin`)...
      requireRole.mockResolvedValueOnce(roleAllow(NON_SUPER_SUBJECT));
      // ...but the env super-admin gate must still refuse: not allow-listed.
      evaluateAuthDecision.mockReturnValue({
        decision: "allow-user",
        user: USER,
      });
      deriveAuthContext.mockReturnValue(ctxFor(NON_SUPER_SUBJECT));

      const gate = await requireSuperAdmin("admin:db:read", {
        route: "/api/admin/db",
      });
      expect(gate.authorized).toBe(false);
      if (!gate.authorized) expect(gate.response.status).toBe(403);
      expect(writeAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "authz-superadmin",
          outcome: "deny",
          subject: NON_SUPER_SUBJECT,
          detail: "not-superadmin",
        }),
      );
    });

    it("treats the local-operator bypass as SUPER-ADMIN (host-dev root) and audits an allow", async () => {
      requireRole.mockResolvedValueOnce(roleAllow(null));
      evaluateAuthDecision.mockReturnValue({
        decision: "allow-operator",
        user: USER,
      });

      const gate = await requireSuperAdmin("admin:db:write");
      expect(gate.authorized).toBe(true);
      // Identity derivation is never needed for the operator bypass.
      expect(deriveAuthContext).not.toHaveBeenCalled();
      expect(writeAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "authz-superadmin",
          outcome: "allow",
          detail: "local-operator",
        }),
      );
    });

    it("ALLOWS an authenticated, allow-listed super-admin subject and audits an allow", async () => {
      requireRole.mockResolvedValueOnce(roleAllow(SUPER_SUBJECT));
      evaluateAuthDecision.mockReturnValue({
        decision: "allow-user",
        user: USER,
      });
      deriveAuthContext.mockReturnValue(ctxFor(SUPER_SUBJECT));

      const gate = await requireSuperAdmin("admin:db:read");
      expect(gate.authorized).toBe(true);
      expect(writeAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "authz-superadmin",
          outcome: "allow",
          subject: SUPER_SUBJECT,
          detail: "allowlisted",
        }),
      );
    });
  });

  describe("resolveSuperAdmin", () => {
    it("reports unauthenticated when the decision is deny", async () => {
      evaluateAuthDecision.mockReturnValue({ decision: "deny", status: 401 });
      expect(await resolveSuperAdmin()).toEqual({
        authenticated: false,
        isSuperAdmin: false,
      });
    });

    it("reports the local operator as authenticated super-admin", async () => {
      evaluateAuthDecision.mockReturnValue({
        decision: "allow-operator",
        user: USER,
      });
      expect(await resolveSuperAdmin()).toEqual({
        authenticated: true,
        isSuperAdmin: true,
      });
    });

    it("denies super-admin to an authenticated non-allow-listed subject", async () => {
      evaluateAuthDecision.mockReturnValue({
        decision: "allow-user",
        user: USER,
      });
      deriveAuthContext.mockReturnValue(ctxFor(NON_SUPER_SUBJECT));
      expect(await resolveSuperAdmin()).toEqual({
        authenticated: true,
        isSuperAdmin: false,
      });
    });

    it("grants super-admin to an authenticated allow-listed subject", async () => {
      evaluateAuthDecision.mockReturnValue({
        decision: "allow-user",
        user: USER,
      });
      deriveAuthContext.mockReturnValue(ctxFor(SUPER_SUBJECT));
      expect(await resolveSuperAdmin()).toEqual({
        authenticated: true,
        isSuperAdmin: true,
      });
    });
  });
});
