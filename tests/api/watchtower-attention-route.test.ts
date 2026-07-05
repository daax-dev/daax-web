/**
 * Tests for GET /api/watchtower/attention (issue #153).
 *
 * Auth is mocked via the established route-test pattern (vi.hoisted +
 * vi.mock("@/lib/auth")). The Watchtower client is mocked so the aggregation,
 * status derivation, and fail-soft `ok` flag are exercised without network I/O.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const { mockRequireAuth, mockFetchActiveSessions, mockFetchSessionTools } =
  vi.hoisted(() => ({
    mockRequireAuth: vi.fn(),
    mockFetchActiveSessions: vi.fn(),
    mockFetchSessionTools: vi.fn(),
  }));

vi.mock("@/lib/auth", () => ({ requireAuth: mockRequireAuth }));
vi.mock("@/lib/watchtower/client", () => ({
  watchtowerBaseUrl: () => "http://localhost:4220",
  fetchActiveSessions: mockFetchActiveSessions,
  fetchSessionTools: mockFetchSessionTools,
}));

import { GET } from "@/app/api/watchtower/attention/route";

describe("GET /api/watchtower/attention", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue({ authenticated: true, user: {} });
  });

  it("returns 401 from the auth layer when unauthenticated", async () => {
    mockRequireAuth.mockResolvedValue({
      authenticated: false,
      response: NextResponse.json({ error: "nope" }, { status: 401 }),
    });
    const res = await GET();
    expect(res.status).toBe(401);
    expect(mockFetchActiveSessions).not.toHaveBeenCalled();
  });

  it("returns ok:false when Watchtower is unreachable", async () => {
    mockFetchActiveSessions.mockResolvedValue({
      reachable: false,
      sessions: [],
    });
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: false, sessions: [] });
    expect(mockFetchSessionTools).not.toHaveBeenCalled();
  });

  it("aggregates sessions with derived status + sparkline", async () => {
    const now = Date.now();
    mockFetchActiveSessions.mockResolvedValue({
      reachable: true,
      sessions: [
        {
          id: "sess-1",
          host: "galway",
          working_dir: "/workspace",
          git_branch: "main",
          active: true,
          created_at: new Date(now - 20_000).toISOString(),
        },
      ],
    });
    mockFetchSessionTools.mockResolvedValue([
      { startedAt: now - 2_000, name: "Bash", error: null, durationMs: 10 },
    ]);

    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.sessions).toHaveLength(1);
    expect(body.sessions[0].id).toBe("sess-1");
    expect(body.sessions[0].status).toBe("working");
    expect(body.sessions[0].lastTool).toBe("Bash");
    expect(Array.isArray(body.sessions[0].sparkline)).toBe(true);
  });

  it("returns an empty session list without error when none are active", async () => {
    mockFetchActiveSessions.mockResolvedValue({
      reachable: true,
      sessions: [],
    });
    const res = await GET();
    const body = await res.json();
    expect(body).toEqual({ ok: true, sessions: [] });
  });
});
