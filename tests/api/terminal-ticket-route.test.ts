/**
 * Tests for POST /api/terminal/ticket (F1b, issue #95).
 * requireAuthIdentity is mocked; the real ws-ticket mint and the real
 * host-shell admin decision run against env values.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockRequireAuthIdentity } = vi.hoisted(() => ({
  mockRequireAuthIdentity: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireAuthIdentity: mockRequireAuthIdentity }));

import { POST } from "@/app/api/terminal/ticket/route";
import { verifyTicket } from "@/lib/ws-ticket";

const ADMIN = "62d9d61c-cae1-49d0-aa94-ff34091199b7";
const OTHER = "0b7c4a1e-5f3d-4e2a-9c81-7d6e5f4a3b21";

function authed(
  subject: string | null,
  opts: { operator?: boolean; username?: string; email?: string } = {},
) {
  return {
    authenticated: true,
    operator: opts.operator ?? false,
    user: {
      username: "Alice Display",
      email: opts.email ?? null,
      groups: [],
      authenticated: true,
      pictureUrl: null,
    },
    identity: {
      subject,
      username: opts.username ?? null,
      email: opts.email ?? null,
    },
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
    vi.stubEnv("DAAX_WS_TOKEN_SECRET", "ws-token-secret-value");
    vi.stubEnv("DAAX_ADMIN_USERS", `${ADMIN} jason.poley@gmail.com jpoley`);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireAuthIdentity.mockResolvedValue({
      authenticated: false,
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

  it("an admin by email carries it too, with the email the terminal re-checks", async () => {
    mockRequireAuthIdentity.mockResolvedValue(
      authed(OTHER, { email: "jason.poley@gmail.com" }),
    );
    const payload = await mintedPayload();
    expect(payload.hostShell).toBe(true);
    expect(payload.email).toBe("jason.poley@gmail.com");
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
});
