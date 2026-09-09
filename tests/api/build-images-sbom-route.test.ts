/**
 * Tests for GET /api/build/images/sbom — mocks auth, the ref whitelist, and syft.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const {
  mockRequireAuth,
  mockFindKnownImageRef,
  mockResolveImageId,
  mockGenerateRealSbom,
} = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockFindKnownImageRef: vi.fn(),
  mockResolveImageId: vi.fn(),
  mockGenerateRealSbom: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireAuth: mockRequireAuth }));
vi.mock("@/lib/build/images", () => ({
  findKnownImageRef: mockFindKnownImageRef,
  resolveImageId: mockResolveImageId,
}));
vi.mock("@/lib/host-docker", () => ({ getDocker: vi.fn(() => ({})) }));
vi.mock("@/lib/sbom-syft", () => ({ generateRealSbom: mockGenerateRealSbom }));

import {
  GET,
  MAX_CACHED_SBOMS,
  __resetImageSbomState,
} from "@/app/api/build/images/sbom/route";

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
    __resetImageSbomState();
    mockRequireAuth.mockResolvedValue({ authenticated: true, user: {} });
    // Default: a static (non-stack) known ref that is not pulled locally, so
    // the scan/cache identity falls back to the ref itself.
    mockFindKnownImageRef.mockImplementation(async (ref: string) => ({
      category: "platform",
      name: ref,
      ref,
    }));
    mockResolveImageId.mockResolvedValue(null);
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

  it("coalesces concurrent scans for the same ref into one syft run", async () => {
    let resolveScan!: (v: string) => void;
    mockGenerateRealSbom.mockReturnValue(
      new Promise<string>((r) => {
        resolveScan = r;
      }),
    );
    const p1 = GET(req("?ref=img-coalesce:1"));
    const p2 = GET(req("?ref=img-coalesce:1"));
    await Promise.resolve(); // let both requests register on the in-flight map
    resolveScan(REAL_SBOM);
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(mockGenerateRealSbom).toHaveBeenCalledTimes(1);
  });

  it("serves a repeat request from the cache without rescanning", async () => {
    await GET(req("?ref=img-cached:1"));
    await GET(req("?ref=img-cached:1"));
    expect(mockGenerateRealSbom).toHaveBeenCalledTimes(1);
  });

  it("bounds the result cache (LRU): the oldest ref is evicted and rescanned", async () => {
    // Fill the cache to its bound, then one more distinct ref evicts the first.
    for (let i = 0; i < MAX_CACHED_SBOMS; i++) {
      await GET(req(`?ref=img-lru-${i}:1`));
    }
    expect(mockGenerateRealSbom).toHaveBeenCalledTimes(MAX_CACHED_SBOMS);
    // Touch the oldest so it becomes most-recent (a hit must not rescan)...
    await GET(req("?ref=img-lru-0:1"));
    expect(mockGenerateRealSbom).toHaveBeenCalledTimes(MAX_CACHED_SBOMS);
    // ...so the eviction victim is img-lru-1, not img-lru-0.
    await GET(req("?ref=img-lru-extra:1"));
    expect(mockGenerateRealSbom).toHaveBeenCalledTimes(MAX_CACHED_SBOMS + 1);
    await GET(req("?ref=img-lru-0:1"));
    expect(mockGenerateRealSbom).toHaveBeenCalledTimes(MAX_CACHED_SBOMS + 1);
    await GET(req("?ref=img-lru-1:1"));
    expect(mockGenerateRealSbom).toHaveBeenCalledTimes(MAX_CACHED_SBOMS + 2);
    expect(mockGenerateRealSbom).toHaveBeenLastCalledWith("img-lru-1:1");
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
    mockFindKnownImageRef.mockResolvedValue(null);
    res = await GET(req("?ref=evil/image:latest"));
    expect(res.status).toBe(400);
    expect(mockGenerateRealSbom).not.toHaveBeenCalled();
  });

  it("scans and caches a stack ref by its immutable image ID, not its tag", async () => {
    mockFindKnownImageRef.mockResolvedValue({
      category: "stack",
      name: "daax-postgres",
      ref: "postgres:18-alpine",
      imageId: "sha256:pg-old",
    });
    await GET(req("?ref=postgres:18-alpine"));
    expect(mockGenerateRealSbom).toHaveBeenLastCalledWith("sha256:pg-old");
    // Same tag, same image → cache hit.
    await GET(req("?ref=postgres:18-alpine"));
    expect(mockGenerateRealSbom).toHaveBeenCalledTimes(1);
    // The tag now runs a replaced image → a fresh scan, not the old SBOM.
    mockFindKnownImageRef.mockResolvedValue({
      category: "stack",
      name: "daax-postgres",
      ref: "postgres:18-alpine",
      imageId: "sha256:pg-new",
    });
    await GET(req("?ref=postgres:18-alpine"));
    expect(mockGenerateRealSbom).toHaveBeenCalledTimes(2);
    expect(mockGenerateRealSbom).toHaveBeenLastCalledWith("sha256:pg-new");
  });

  it("resolves a static ref to the image ID it currently points at", async () => {
    mockResolveImageId.mockResolvedValue("sha256:node-id");
    await GET(req("?ref=node:22-bookworm-slim"));
    expect(mockResolveImageId).toHaveBeenCalledWith(
      "node:22-bookworm-slim",
      expect.anything(),
    );
    expect(mockGenerateRealSbom).toHaveBeenLastCalledWith("sha256:node-id");
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
