/**
 * Tests for GET /api/build — mocks the build-info collector and auth.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextResponse } from "next/server";

const { mockCollectBuildInfo, mockRequireAuth } = vi.hoisted(() => ({
  mockCollectBuildInfo: vi.fn(),
  mockRequireAuth: vi.fn(),
}));

vi.mock("@/lib/build/build-info", () => ({
  collectBuildInfo: mockCollectBuildInfo,
}));

vi.mock("@/lib/auth", () => ({
  requireAuth: mockRequireAuth,
}));

import { GET } from "@/app/api/build/route";

const FIXTURE = {
  version: "v0.1.0+abcdef1",
  gitSha: "abcdef1234567890",
  buildTime: "2026-07-01T00:00:00Z",
  nodeVersion: "v22.0.0",
  nextVersion: "16.1.6",
  branch: "sbom",
  hostname: "dev",
  sbomAvailable: true,
  sboms: [{ component: "app", format: "cyclonedx" }],
};

describe("GET /api/build", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCollectBuildInfo.mockReturnValue(FIXTURE);
    mockRequireAuth.mockResolvedValue({ authenticated: true, user: {} });
  });
  afterEach(() => vi.restoreAllMocks());

  it("returns build info with no-store caching", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual(FIXTURE);
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireAuth.mockResolvedValue({
      authenticated: false,
      response: NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      ),
    });
    const res = await GET();
    expect(res.status).toBe(401);
    expect(mockCollectBuildInfo).not.toHaveBeenCalled();
  });

  it("returns 500 when collection throws", async () => {
    mockCollectBuildInfo.mockImplementation(() => {
      throw new Error("boom");
    });
    const res = await GET();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to collect build info" });
  });
});
