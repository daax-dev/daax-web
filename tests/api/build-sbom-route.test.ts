/**
 * Tests for GET /api/build/sbom — mocks the whitelisted SBOM reader and auth.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const { mockReadSbom, mockRequireAuth } = vi.hoisted(() => ({
  mockReadSbom: vi.fn(),
  mockRequireAuth: vi.fn(),
}));

vi.mock("@/lib/build/build-info", () => ({
  readSbom: mockReadSbom,
  SBOM_COMPONENTS: ["app"],
  SBOM_FORMATS: ["cyclonedx", "spdx"],
}));

vi.mock("@/lib/auth", () => ({
  requireAuth: mockRequireAuth,
}));

import { GET } from "@/app/api/build/sbom/route";

function req(query: string): NextRequest {
  return new NextRequest(`http://localhost/api/build/sbom${query}`);
}

const SBOM = JSON.stringify({ bomFormat: "CycloneDX", components: [] });

describe("GET /api/build/sbom", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadSbom.mockReturnValue({
      ok: true,
      content: SBOM,
      format: "cyclonedx",
    });
    mockRequireAuth.mockResolvedValue({ authenticated: true, user: {} });
  });
  afterEach(() => vi.restoreAllMocks());

  it("defaults to app/cyclonedx and serves as an attachment", async () => {
    const res = await GET(req(""));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/json");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Content-Disposition")).toBe(
      'attachment; filename="daax-app-cyclonedx.json"',
    );
    expect(await res.text()).toBe(SBOM);
    expect(mockReadSbom).toHaveBeenCalledWith("app", "cyclonedx");
  });

  it("honors inline and the format param", async () => {
    mockReadSbom.mockReturnValue({ ok: true, content: SBOM, format: "spdx" });
    const res = await GET(req("?component=app&format=spdx&inline=1"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toBe(
      'inline; filename="daax-app-spdx.json"',
    );
    expect(mockReadSbom).toHaveBeenCalledWith("app", "spdx");
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireAuth.mockResolvedValue({
      authenticated: false,
      response: NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      ),
    });
    const res = await GET(req(""));
    expect(res.status).toBe(401);
    expect(mockReadSbom).not.toHaveBeenCalled();
  });

  it("returns 400 for an unknown component/format", async () => {
    const res = await GET(req("?component=web&format=cyclonedx"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("unknown SBOM component/format");
    expect(body.components).toEqual(["app"]);
    expect(mockReadSbom).not.toHaveBeenCalled();
  });

  it("returns 404 when not bundled (not-found / placeholder)", async () => {
    for (const reason of ["not-found", "placeholder"] as const) {
      mockReadSbom.mockReturnValue({ ok: false, reason });
      const res = await GET(req("?component=app&format=cyclonedx"));
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.available).toBe(false);
    }
  });

  it("returns 500 for server-side read problems (error/oversize/mismatch)", async () => {
    for (const reason of ["error", "oversize", "mismatch"] as const) {
      mockReadSbom.mockReturnValue({ ok: false, reason });
      const res = await GET(req("?component=app&format=cyclonedx"));
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe("Failed to read SBOM");
      expect(body.reason).toBe(reason);
    }
  });
});
