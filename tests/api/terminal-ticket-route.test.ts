/**
 * Tests for POST /api/terminal/ticket (F1b, issue #95).
 * requireAuth is mocked; the real ws-ticket mint runs against an env secret.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockRequireAuth } = vi.hoisted(() => ({ mockRequireAuth: vi.fn() }));

vi.mock("@/lib/auth", () => ({ requireAuth: mockRequireAuth }));

import { POST } from "@/app/api/terminal/ticket/route";
import { verifyTicket } from "@/lib/ws-ticket";

describe("POST /api/terminal/ticket", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DAAX_WS_TOKEN_SECRET = "ws-token-secret-value";
  });
  afterEach(() => {
    delete process.env.DAAX_WS_TOKEN_SECRET;
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireAuth.mockResolvedValue({
      authenticated: false,
      response: new Response(
        JSON.stringify({ error: "Authentication required" }),
        {
          status: 401,
        },
      ),
    });

    const res = await POST();
    expect(res.status).toBe(401);
  });

  it("returns 503 when the WS token secret is unset", async () => {
    delete process.env.DAAX_WS_TOKEN_SECRET;
    mockRequireAuth.mockResolvedValue({
      authenticated: true,
      user: {
        username: "alice",
        email: null,
        groups: [],
        authenticated: true,
        pictureUrl: null,
      },
    });

    const res = await POST();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("ws-ticketing-disabled");
  });

  it("mints a verifiable ticket for the authenticated user", async () => {
    mockRequireAuth.mockResolvedValue({
      authenticated: true,
      user: {
        username: "alice",
        email: null,
        groups: [],
        authenticated: true,
        pictureUrl: null,
      },
    });

    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.token).toBe("string");
    expect(typeof body.exp).toBe("number");

    const verified = verifyTicket(body.token);
    expect(verified.valid).toBe(true);
    if (verified.valid) expect(verified.payload.sub).toBe("alice");
  });
});
