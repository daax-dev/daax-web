/**
 * Tests for POST /api/terminal/ticket (F1b, issue #95; tenancy claims dx#119).
 * requirePrincipal and the settings store are mocked; the real ws-ticket mint
 * and the real host-shell admin decision run against env values.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockRequireAuthIdentity, mockEffective } = vi.hoisted(() => ({
  mockRequireAuthIdentity: vi.fn(),
  mockEffective: vi.fn(),
}));

// requirePrincipal("terminal:exec") is the gate now. The helper below builds
// its result from the same fixtures the pre-#119 cases used.
vi.mock("@/lib/auth", () => ({ requirePrincipal: mockRequireAuthIdentity }));
vi.mock("@/lib/tenancy/settings-store", () => ({
  getEffectiveSettings: mockEffective,
}));

import { POST } from "@/app/api/terminal/ticket/route";
import { verifyTicket } from "@/lib/ws-ticket";

const ADMIN = "62d9d61c-cae1-49d0-aa94-ff34091199b7";
const OTHER = "0b7c4a1e-5f3d-4e2a-9c81-7d6e5f4a3b21";

function authed(
  subject: string | null,
  opts: {
    operator?: boolean;
    username?: string;
    email?: string;
    admin?: boolean;
  } = {},
) {
  const operator = opts.operator ?? false;
  const admin = opts.admin ?? (operator || subject === ADMIN);
  return {
    authorized: true,
    principal: {
      subject,
      operator,
      admin,
      permissions: admin
        ? ["terminal:exec", "recording:write", "admin:users:read"]
        : ["terminal:exec", "recording:write"],
    },
    user: {
      username: opts.username ?? "Alice Display",
      email: opts.email ?? null,
      groups: [],
      authenticated: true,
      pictureUrl: null,
    },
    subject,
  };
}

async function mintedPayload() {
  const res = await POST();
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(typeof body.exp).toBe("number");
  const verified = verifyTicket(body.token);
  if (!verified.valid) throw new Error(`ticket invalid: ${verified.reason}`);
  return verified.payload;
}

describe("POST /api/terminal/ticket", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEffective.mockResolvedValue({ settings: {}, locked: [] });
    vi.stubEnv("DAAX_WS_TOKEN_SECRET", "ws-token-secret-value");
    vi.stubEnv("DAAX_ADMIN_USERS", `${ADMIN} jason.poley@gmail.com jpoley`);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireAuthIdentity.mockResolvedValue({
      authorized: false,
      response: new Response(
        JSON.stringify({ error: "Authentication required" }),
        { status: 401 },
      ),
    });

    const res = await POST();
    expect(res.status).toBe(401);
  });

  it("returns 503 when the WS token secret is unset", async () => {
    vi.stubEnv("DAAX_WS_TOKEN_SECRET", "");
    mockRequireAuthIdentity.mockResolvedValue(authed(ADMIN));

    const res = await POST();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("ws-ticketing-disabled");
  });

  it("names the subject, not the display name", async () => {
    mockRequireAuthIdentity.mockResolvedValue(authed(ADMIN));
    const payload = await mintedPayload();
    expect(payload.sub).toBe("62d9d61c-cae1-49d0-aa94-ff34091199b7");
  });

  it("an admin's ticket carries the host-shell claim", async () => {
    mockRequireAuthIdentity.mockResolvedValue(authed(ADMIN));
    const payload = await mintedPayload();
    expect(payload.hostShell).toBe(true);
    expect(payload.operator).toBeUndefined();
  });

  it("an email or username in the list is not enough: only the subject counts", async () => {
    mockRequireAuthIdentity.mockResolvedValue(
      authed(OTHER, { username: "jpoley", email: "jason.poley@gmail.com" }),
    );
    const payload = await mintedPayload();
    expect(payload.hostShell).toBeUndefined();
  });

  it("a list naming no subject UUID mints no claim", async () => {
    vi.stubEnv("DAAX_ADMIN_USERS", "jason.poley@gmail.com jpoley");
    mockRequireAuthIdentity.mockResolvedValue(authed(ADMIN));
    const payload = await mintedPayload();
    expect(payload.hostShell).toBeUndefined();
  });

  it("a non-admin's ticket does not carry the host-shell claim", async () => {
    mockRequireAuthIdentity.mockResolvedValue(
      authed(OTHER, { username: "mallory", email: "mallory@example.com" }),
    );
    const payload = await mintedPayload();
    expect(payload.sub).toBe("0b7c4a1e-5f3d-4e2a-9c81-7d6e5f4a3b21");
    expect(payload.hostShell).toBeUndefined();
  });

  it("an empty DAAX_ADMIN_USERS mints no host-shell claim, even for the operator's subject", async () => {
    vi.stubEnv("DAAX_ADMIN_USERS", "");
    mockRequireAuthIdentity.mockResolvedValue(authed(ADMIN));
    const payload = await mintedPayload();
    expect(payload.hostShell).toBeUndefined();
  });

  it("the local-operator bypass is admin, as on the HTTP plane", async () => {
    vi.stubEnv("DAAX_ADMIN_USERS", "");
    mockRequireAuthIdentity.mockResolvedValue(authed(null, { operator: true }));
    const payload = await mintedPayload();
    expect(payload.sub).toBe("local");
    expect(payload.operator).toBe(true);
    expect(payload.hostShell).toBe(true);
  });

  // ---- dx#119 tenancy claims ----

  it("requires terminal:exec (a 403 from the gate is returned as-is)", async () => {
    mockRequireAuthIdentity.mockResolvedValue({
      authorized: false,
      response: new Response("{}", { status: 403 }),
    });
    const res = await POST();
    expect(res.status).toBe(403);
    expect(mockRequireAuthIdentity).toHaveBeenCalledWith(
      "terminal:exec",
      expect.anything(),
    );
  });

  it("signs the caller's permissions and admin flag", async () => {
    mockRequireAuthIdentity.mockResolvedValue(authed(OTHER));
    const user = await mintedPayload();
    expect(user.perms).toEqual(["terminal:exec", "recording:write"]);
    expect(user.admin).toBeUndefined();

    mockRequireAuthIdentity.mockResolvedValue(authed(ADMIN));
    const admin = await mintedPayload();
    expect(admin.admin).toBe(true);
  });

  it("signs the user's server-side settings and locks", async () => {
    mockEffective.mockResolvedValue({
      settings: { containerImage: "daax-agent:locked", mountRoot: "users/b" },
      locked: ["containerImage", "mountRoot"],
    });
    mockRequireAuthIdentity.mockResolvedValue(authed(OTHER));
    const payload = await mintedPayload();
    expect(mockEffective).toHaveBeenCalledWith(OTHER);
    expect(payload.settings).toEqual({
      containerImage: "daax-agent:locked",
      mountRoot: "users/b",
    });
    expect(payload.locked).toEqual(["containerImage", "mountRoot"]);
  });

  it("fails closed (503) when the settings store is unavailable", async () => {
    mockEffective.mockRejectedValue(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockRequireAuthIdentity.mockResolvedValue(authed(OTHER));
    const res = await POST();
    expect(res.status).toBe(503);
  });

  it("the operator has no settings row and carries no policy", async () => {
    mockRequireAuthIdentity.mockResolvedValue(authed(null, { operator: true }));
    const payload = await mintedPayload();
    expect(mockEffective).not.toHaveBeenCalled();
    expect(payload.settings).toBeUndefined();
  });
});
