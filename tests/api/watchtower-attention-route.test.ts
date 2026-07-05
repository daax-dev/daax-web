/**
 * Tests for GET /api/watchtower/attention (issue #153).
 *
 * Auth is mocked via the established route-test pattern (vi.hoisted +
 * vi.mock("@/lib/auth")). The Watchtower client is mocked so the aggregation,
 * status derivation, fail-soft `ok` flag, per-session non-poisoning, and the
 * session cap are exercised without network I/O. The real TTL cache is reset
 * between cases so results don't bleed across tests.
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
import { reset as resetCache } from "@/lib/attention/cache";

/** A fresh (non-aborted) request for the handler under test. */
const req = () => new Request("http://localhost/api/watchtower/attention");

describe("GET /api/watchtower/attention", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCache();
    mockRequireAuth.mockResolvedValue({ authenticated: true, user: {} });
  });

  it("returns 401 from the auth layer when unauthenticated", async () => {
    mockRequireAuth.mockResolvedValue({
      authenticated: false,
      response: NextResponse.json({ error: "nope" }, { status: 401 }),
    });
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(mockFetchActiveSessions).not.toHaveBeenCalled();
  });

  it("returns ok:false when Watchtower is unreachable", async () => {
    mockFetchActiveSessions.mockResolvedValue({
      reachable: false,
      sessions: [],
    });
    const res = await GET(req());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: false, sessions: [], truncated: false });
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

    const res = await GET(req());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.truncated).toBe(false);
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
    const res = await GET(req());
    const body = await res.json();
    expect(body).toEqual({ ok: true, sessions: [], truncated: false });
  });

  it("still returns healthy cards when one session's tool fetch rejects (non-poisoning)", async () => {
    const now = Date.now();
    mockFetchActiveSessions.mockResolvedValue({
      reachable: true,
      sessions: [
        {
          id: "sess-bad",
          host: "h1",
          active: true,
          created_at: new Date(now - 5_000).toISOString(),
        },
        {
          id: "sess-good",
          host: "h2",
          active: true,
          created_at: new Date(now - 5_000).toISOString(),
        },
      ],
    });
    mockFetchSessionTools.mockImplementation(async (id: string) => {
      if (id === "sess-bad") throw new Error("boom");
      return [
        { startedAt: now - 1_000, name: "Read", error: null, durationMs: 5 },
      ];
    });

    const res = await GET(req());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    const byId = Object.fromEntries(
      body.sessions.map((s: { id: string }) => [s.id, s]),
    );
    // Both cards present; the failed one degrades to a tools-less card.
    expect(Object.keys(byId).sort()).toEqual(["sess-bad", "sess-good"]);
    expect(byId["sess-bad"].lastTool).toBeNull();
    expect(byId["sess-good"].lastTool).toBe("Read");
  });

  it("degrades a malformed session (non-string host) to a minimal card instead of a 500", async () => {
    const now = Date.now();
    mockFetchActiveSessions.mockResolvedValue({
      reachable: true,
      sessions: [
        // Schema drift: numeric host makes buildCard throw (.trim on a number).
        { id: "sess-malformed", host: 123, active: true },
        {
          id: "sess-good",
          host: "h2",
          active: true,
          created_at: new Date(now - 5_000).toISOString(),
        },
      ],
    });
    mockFetchSessionTools.mockResolvedValue([]);

    const res = await GET(req());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    const byId = Object.fromEntries(
      body.sessions.map((s: { id: string }) => [s.id, s]),
    );
    expect(Object.keys(byId).sort()).toEqual(["sess-good", "sess-malformed"]);
    // Malformed record falls back to a static idle card, not a 500.
    expect(byId["sess-malformed"]).toMatchObject({
      id: "sess-malformed",
      status: "idle",
      lastTool: null,
      toolCount: 0,
    });
  });

  it("does no upstream work when the client has already aborted", async () => {
    const ac = new AbortController();
    ac.abort();
    const abortedReq = new Request(
      "http://localhost/api/watchtower/attention",
      {
        signal: ac.signal,
      },
    );
    const res = await GET(abortedReq);
    const body = await res.json();
    expect(body).toEqual({ ok: false, sessions: [], truncated: false });
    expect(mockFetchActiveSessions).not.toHaveBeenCalled();
  });

  it("caps the session list and flags truncation", async () => {
    const now = Date.now();
    const sessions = Array.from({ length: 105 }, (_, i) => ({
      id: `sess-${i}`,
      host: `h${i}`,
      active: true,
      created_at: new Date(now - 5_000).toISOString(),
    }));
    mockFetchActiveSessions.mockResolvedValue({ reachable: true, sessions });
    mockFetchSessionTools.mockResolvedValue([]);

    const res = await GET(req());
    const body = await res.json();
    expect(body.truncated).toBe(true);
    expect(body.sessions).toHaveLength(100);
    // Only capped sessions incur a tool fetch — no unbounded fan-out.
    expect(mockFetchSessionTools).toHaveBeenCalledTimes(100);
  });
});
