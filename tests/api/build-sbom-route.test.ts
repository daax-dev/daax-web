/**
 * Tests for GET /api/build/sbom — mocks the whitelisted SBOM reader.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const { mockReadRealSbom } = vi.hoisted(() => ({
  mockReadRealSbom: vi.fn<(c: string, f: string) => string | null>(),
}));

vi.mock("@/lib/build/build-info", () => ({
  readRealSbom: mockReadRealSbom,
  SBOM_COMPONENTS: ["app"],
  SBOM_FORMATS: ["cyclonedx", "spdx"],
}));

import { GET } from "@/app/api/build/sbom/route";

function req(query: string): NextRequest {
  return new NextRequest(`http://localhost/api/build/sbom${query}`);
}

const SBOM = JSON.stringify({ bomFormat: "CycloneDX", components: [] });

describe("GET /api/build/sbom", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadRealSbom.mockReturnValue(SBOM);
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
    expect(mockReadRealSbom).toHaveBeenCalledWith("app", "cyclonedx");
  });

  it("honors inline and the format param", async () => {
    const res = await GET(req("?component=app&format=spdx&inline=1"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toBe(
      'inline; filename="daax-app-spdx.json"',
    );
    expect(mockReadRealSbom).toHaveBeenCalledWith("app", "spdx");
  });

  it("returns 400 for an unknown component/format", async () => {
    const res = await GET(req("?component=web&format=cyclonedx"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("unknown SBOM component/format");
    expect(body.components).toEqual(["app"]);
    expect(mockReadRealSbom).not.toHaveBeenCalled();
  });

  it("returns 404 when no real SBOM is bundled", async () => {
    mockReadRealSbom.mockReturnValue(null);
    const res = await GET(req("?component=app&format=cyclonedx"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.available).toBe(false);
    expect(body.component).toBe("app");
  });
});
