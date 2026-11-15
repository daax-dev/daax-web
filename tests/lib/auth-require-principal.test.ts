/**
 * requirePrincipal (lib/auth.ts, dx#119): the HTTP-plane principal resolution
 * that every owner-scoped route uses. Same harness as rbac-require-role: the
 * trust decision runs for real; the RBAC store and DB config are mocked.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockHeaders = vi.fn();
vi.mock("next/headers", () => ({ headers: () => mockHeaders() }));
vi.mock("next/server", () => ({
  NextResponse: {
    json: vi.fn((body, init) => ({ body, status: init?.status })),
  },
}));

const { jitProvision, writeAudit, isDbConfigured } = vi.hoisted(() => ({
  jitProvision: vi.fn(),
  writeAudit: vi.fn(async () => {}),
  isDbConfigured: vi.fn(() => true),
}));
vi.mock("@/lib/rbac/store", () => ({ jitProvision, writeAudit }));
vi.mock("@/lib/db/config", () => ({ isDbConfigured }));

import { requirePrincipal } from "@/lib/auth";

const SUBJECT = "abcabcab-1111-2222-3333-444455556666";
const SECRET = "proxy-secret-value";

function mkHeaders(h: Record<string, string>): Headers {
  return {
    get: (name: string) => h[name.toLowerCase()] ?? null,
  } as Headers;
}
const forwarded = () =>
  mkHeaders({ "x-forwarded-user": SUBJECT, "x-daax-proxy-secret": SECRET });

describe("requirePrincipal (dx#119)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    isDbConfigured.mockReturnValue(true);
    vi.stubEnv("DAAX_REQUIRE_AUTH", "1");
    vi.stubEnv("DAAX_PROXY_SECRET", SECRET);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("a default-role user is a non-admin principal with the user permissions", async () => {
    mockHeaders.mockReturnValue(forwarded());
    jitProvision.mockResolvedValue({ roles: ["user"], isNew: false });
    const r = await requirePrincipal();
    expect(r.authorized).toBe(true);
    if (r.authorized) {
      expect(r.principal).toMatchObject({
        subject: SUBJECT,
        operator: false,
        admin: false,
      });
      expect(r.principal.permissions).toEqual(
        expect.arrayContaining([
          "terminal:exec",
          "containers:write",
          "recording:write",
          "settings:write",
        ]),
      );
      expect(r.principal.permissions).not.toContain("admin:settings:write");
    }
  });

  it("an admin-role user is an admin principal", async () => {
    mockHeaders.mockReturnValue(forwarded());
    jitProvision.mockResolvedValue({ roles: ["admin"], isNew: false });
    const r = await requirePrincipal("admin:settings:write");
    expect(r.authorized && r.principal.admin).toBe(true);
  });

  it("a missing permission is a 403 and is audited", async () => {
    mockHeaders.mockReturnValue(forwarded());
    jitProvision.mockResolvedValue({ roles: [], isNew: false });
    const r = await requirePrincipal("terminal:exec");
    expect(r.authorized).toBe(false);
    if (!r.authorized) expect(r.response.status).toBe(403);
    expect(writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "deny", permission: "terminal:exec" }),
    );
  });

  it("a permission-less resolution writes no audit row", async () => {
    mockHeaders.mockReturnValue(forwarded());
    jitProvision.mockResolvedValue({ roles: ["user"], isNew: false });
    await requirePrincipal();
    expect(writeAudit).not.toHaveBeenCalled();
  });

  it("fails closed (403) when the identity store is unconfigured", async () => {
    isDbConfigured.mockReturnValue(false);
    mockHeaders.mockReturnValue(forwarded());
    const r = await requirePrincipal();
    expect(r.authorized).toBe(false);
    if (!r.authorized) expect(r.response.status).toBe(403);
  });

  it("unauthenticated is a 401", async () => {
    mockHeaders.mockReturnValue(mkHeaders({}));
    const r = await requirePrincipal();
    expect(r.authorized).toBe(false);
    if (!r.authorized) expect(r.response.status).toBe(401);
  });

  it("the host-dev operator bypass is an admin principal without a DB", async () => {
    vi.stubEnv("DAAX_REQUIRE_AUTH", "");
    vi.stubEnv("DAAX_PROXY_SECRET", "");
    vi.stubEnv("HOST", "127.0.0.1");
    isDbConfigured.mockReturnValue(false);
    mockHeaders.mockReturnValue(mkHeaders({}));
    const r = await requirePrincipal("terminal:exec");
    expect(r.authorized).toBe(true);
    if (r.authorized) {
      expect(r.principal).toMatchObject({
        subject: null,
        operator: true,
        admin: true,
      });
    }
    expect(jitProvision).not.toHaveBeenCalled();
  });
});
