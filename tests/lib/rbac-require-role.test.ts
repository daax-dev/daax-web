import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock next/headers so we can drive the forward-auth headers per test.
const mockHeaders = vi.fn();
vi.mock("next/headers", () => ({
  headers: () => mockHeaders(),
}));

// Mock NextResponse.json to a plain object carrying { body, status }.
vi.mock("next/server", () => ({
  NextResponse: {
    json: vi.fn((body, init) => ({ body, status: init?.status })),
  },
}));

// Mock the RBAC store + db config so requireRole's branch logic is tested in
// isolation (no real Postgres). The DECISION logic (deriveAuthContext /
// evaluateAuthDecision) is left REAL so the trust evaluation is exercised.
// vi.hoisted lets the mock factories reference these vi.fns despite hoisting.
const { jitProvision, writeAudit, isDbConfigured } = vi.hoisted(() => ({
  jitProvision: vi.fn(),
  writeAudit: vi.fn(async () => {}),
  isDbConfigured: vi.fn(() => true),
}));
vi.mock("@/lib/rbac/store", () => ({ jitProvision, writeAudit }));
vi.mock("@/lib/db/config", () => ({ isDbConfigured }));

import { requireRole } from "@/lib/auth";

function mkHeaders(h: Record<string, string>): Headers {
  return {
    get: (name: string) => {
      const key = name.toLowerCase();
      return Object.prototype.hasOwnProperty.call(h, key) ? h[key] : null;
    },
  } as Headers;
}

const SUBJECT = "abcabcab-1111-2222-3333-444455556666";

describe("requireRole enforcement (F5 #101)", () => {
  const savedEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    isDbConfigured.mockReturnValue(true);
    delete process.env.DAAX_REQUIRE_AUTH;
    delete process.env.DAAX_PROXY_SECRET;
  });

  afterEach(() => {
    process.env = { ...savedEnv };
  });

  it("denies (401) an unauthenticated request in strict mode and audits it", async () => {
    process.env.DAAX_REQUIRE_AUTH = "1";
    mockHeaders.mockReturnValue(mkHeaders({})); // no forwarded identity

    const res = await requireRole("admin:db:read");
    expect(res.authorized).toBe(false);
    if (!res.authorized) expect(res.response.status).toBe(401);
    expect(jitProvision).not.toHaveBeenCalled();
    expect(writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "deny", event: "authz" }),
    );
  });

  it("allows the local operator (host-dev bypass) without touching the DB", async () => {
    // No DAAX_REQUIRE_AUTH + no header → allow-operator.
    mockHeaders.mockReturnValue(mkHeaders({}));

    const res = await requireRole("admin:users:write");
    expect(res.authorized).toBe(true);
    if (res.authorized) expect(res.subject).toBeNull();
    expect(jitProvision).not.toHaveBeenCalled();
    expect(writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "allow", detail: "local-operator" }),
    );
  });

  it("allows an authenticated user whose role grants the permission", async () => {
    mockHeaders.mockReturnValue(
      mkHeaders({ "x-forwarded-user": SUBJECT, "x-forwarded-email": "a@x.z" }),
    );
    jitProvision.mockResolvedValueOnce({ isNew: false, roles: ["admin"] });

    const res = await requireRole("admin:db:read");
    expect(res.authorized).toBe(true);
    if (res.authorized) expect(res.subject).toBe(SUBJECT);
    expect(jitProvision).toHaveBeenCalledWith(
      expect.objectContaining({ subject: SUBJECT }),
    );
    expect(writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "allow", subject: SUBJECT }),
    );
  });

  it("forbids (403) an authenticated user whose roles do NOT grant the permission", async () => {
    mockHeaders.mockReturnValue(mkHeaders({ "x-forwarded-user": SUBJECT }));
    jitProvision.mockResolvedValueOnce({ isNew: false, roles: ["user"] });

    const res = await requireRole("admin:db:read");
    expect(res.authorized).toBe(false);
    if (!res.authorized) expect(res.response.status).toBe(403);
    expect(writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "deny", subject: SUBJECT }),
    );
  });

  it("fails CLOSED (403) for an authenticated user when Postgres is unconfigured", async () => {
    mockHeaders.mockReturnValue(mkHeaders({ "x-forwarded-user": SUBJECT }));
    isDbConfigured.mockReturnValue(false);

    const res = await requireRole("terminal:exec");
    expect(res.authorized).toBe(false);
    if (!res.authorized) expect(res.response.status).toBe(403);
    expect(jitProvision).not.toHaveBeenCalled();
    expect(writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "deny", detail: "db-unconfigured" }),
    );
  });

  it("fails CLOSED (403) when the identity store errors (decision denied, not crashed)", async () => {
    mockHeaders.mockReturnValue(mkHeaders({ "x-forwarded-user": SUBJECT }));
    jitProvision.mockRejectedValueOnce(new Error("connection refused"));

    const res = await requireRole("terminal:exec");
    expect(res.authorized).toBe(false);
    if (!res.authorized) expect(res.response.status).toBe(403);
    expect(writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "deny" }),
    );
  });
});
