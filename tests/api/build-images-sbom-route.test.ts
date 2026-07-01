/**
 * Tests for GET /api/build/images/sbom — mocks auth, the ref whitelist, and syft.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const { mockRequireAuth, mockIsKnownImageRef, mockGenerateRealSbom } =
  vi.hoisted(() => ({
    mockRequireAuth: vi.fn(),
    mockIsKnownImageRef: vi.fn(),
    mockGenerateRealSbom: vi.fn(),
  }));

vi.mock("@/lib/auth", () => ({ requireAuth: mockRequireAuth }));
vi.mock("@/lib/build/images", () => ({ isKnownImageRef: mockIsKnownImageRef }));
vi.mock("@/lib/sbom-syft", () => ({ generateRealSbom: mockGenerateRealSbom }));

import { GET } from "@/app/api/build/images/sbom/route";

function req(query: string): NextRequest {
  return new NextRequest(`http://localhost/api/build/images/sbom${query}`);
}

// A real CycloneDX SBOM (> 512 bytes) so checkSbom accepts it.
const REAL_SBOM = JSON.stringify({
  bomFormat: "CycloneDX",
  specVersion: "1.6",
  components: Array.from({ length: 20 }, (_, i) => ({
    type: "library",
    name: `p${i}`,
    version: "1.0.0",
  })),
});

describe("GET /api/build/images/sbom", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue({ authenticated: true, user: {} });
    mockIsKnownImageRef.mockReturnValue(true);
    mockGenerateRealSbom.mockResolvedValue(REAL_SBOM);
  });
  afterEach(() => vi.restoreAllMocks());

  // NB: the route memoizes results per ref in-process, so each test uses a
  // distinct ref to avoid cross-test cache hits.
  it("generates and serves the SBOM for a known image", async () => {
    const res = await GET(req("?ref=img-ok:1&inline=1"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/json");
    expect(res.headers.get("Content-Disposition")).toContain("inline");
    expect(await res.text()).toBe(REAL_SBOM);
    expect(mockGenerateRealSbom).toHaveBeenCalledWith("img-ok:1");
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireAuth.mockResolvedValue({
      authenticated: false,
      response: NextResponse.json({ error: "nope" }, { status: 401 }),
    });
    const res = await GET(req("?ref=img-auth:1"));
    expect(res.status).toBe(401);
    expect(mockGenerateRealSbom).not.toHaveBeenCalled();
  });

  it("returns 400 for a missing or non-whitelisted ref", async () => {
    let res = await GET(req(""));
    expect(res.status).toBe(400);
    mockIsKnownImageRef.mockReturnValue(false);
    res = await GET(req("?ref=evil/image:latest"));
    expect(res.status).toBe(400);
    expect(mockGenerateRealSbom).not.toHaveBeenCalled();
  });

  it("returns 404 when syft yields nothing (image absent)", async () => {
    mockGenerateRealSbom.mockResolvedValue(null);
    const res = await GET(req("?ref=img-absent:1"));
    expect(res.status).toBe(404);
    expect((await res.json()).available).toBe(false);
  });

  it("returns 500 when syft throws", async () => {
    mockGenerateRealSbom.mockRejectedValue(new Error("docker error"));
    const res = await GET(req("?ref=img-throw:1"));
    expect(res.status).toBe(500);
  });
});
