/**
 * Tests for GET /api/git/status auth + path confinement (issue #189).
 *
 * The handler executes git with cwd = the requested path, so it now (1) requires
 * authentication and (2) confines `path` to the operator-configured workspace
 * root. Auth is mocked following the established route-test pattern
 * (vi.hoisted + vi.mock("@/lib/auth")); the real isValidPath/resolveWorkspaceRoot
 * run so the 400 confinement check is exercised end-to-end.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const { mockRequireAuth } = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireAuth: mockRequireAuth }));

import { GET } from "@/app/api/git/status/route";

function req(path?: string): NextRequest {
  const url = path
    ? `http://localhost/api/git/status?path=${encodeURIComponent(path)}`
    : "http://localhost/api/git/status";
  return new NextRequest(url);
}

describe("GET /api/git/status auth + confinement (#189)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: authenticated (individual tests override for the 401 case).
    mockRequireAuth.mockResolvedValue({ authenticated: true, user: {} });
  });

  it("returns 401 when unauthenticated (before touching the filesystem)", async () => {
    mockRequireAuth.mockResolvedValue({
      authenticated: false,
      response: NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      ),
    });

    const res = await GET(req("/etc"));
    expect(res.status).toBe(401);
  });

  it("returns 400 for a path outside the workspace root", async () => {
    // /etc/passwd is never inside any home-based workspace root, so this is
    // rejected regardless of host/container mode.
    const res = await GET(req("/etc/passwd"));
    expect(res.status).toBe(400);
    expect(mockRequireAuth).toHaveBeenCalled();
  });

  it("returns 400 when the path query parameter is missing", async () => {
    const res = await GET(req());
    expect(res.status).toBe(400);
  });
});
