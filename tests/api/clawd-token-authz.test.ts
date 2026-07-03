/**
 * Tests for GET /api/clawd/token authorization guard (#188).
 *
 * The route returns the clawd gateway URL + bearer token from env. Before the
 * fix it was unauthenticated, disclosing a live credential to any direct caller.
 * requireAuth is mocked so the guard mechanism is asserted directly, not the
 * host-dev LOCAL_OPERATOR env bypass.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockRequireAuth } = vi.hoisted(() => ({ mockRequireAuth: vi.fn() }));

vi.mock("@/lib/auth", () => ({ requireAuth: mockRequireAuth }));

import { GET } from "@/app/api/clawd/token/route";

const GATEWAY_URL = "https://gateway.example.test";
const GATEWAY_TOKEN = "super-secret-gateway-token";

describe("GET /api/clawd/token authz (#188)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CLAWD_GATEWAY_URL", GATEWAY_URL);
    vi.stubEnv("CLAWD_GATEWAY_TOKEN", GATEWAY_TOKEN);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 401 and discloses NEITHER token NOR url when unauthenticated", async () => {
    mockRequireAuth.mockResolvedValue({
      authenticated: false,
      response: new Response(
        JSON.stringify({ error: "Authentication required" }),
        { status: 401 },
      ),
    });

    const res = await GET();
    expect(res.status).toBe(401);

    // Credential-related 401 responses must not be cacheable by intermediaries.
    expect(res.headers.get("Cache-Control")).toBe(
      "no-store, no-cache, must-revalidate",
    );
    expect(res.headers.get("Pragma")).toBe("no-cache");
    expect(res.headers.get("Expires")).toBe("0");

    const raw = await res.text();
    // The sensitive values must not appear anywhere in the response body.
    expect(raw).not.toContain(GATEWAY_TOKEN);
    expect(raw).not.toContain(GATEWAY_URL);

    const body = JSON.parse(raw);
    expect(body.token).toBeUndefined();
    expect(body.url).toBeUndefined();
  });

  it("returns { url, token } for an authenticated request", async () => {
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

    const res = await GET();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toEqual({ url: GATEWAY_URL, token: GATEWAY_TOKEN });
  });
});
