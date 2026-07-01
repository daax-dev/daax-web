/**
 * Tests for GET /api/build/images — mocks image collection and auth.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextResponse } from "next/server";

const { mockCollectImages, mockRequireAuth } = vi.hoisted(() => ({
  mockCollectImages: vi.fn(),
  mockRequireAuth: vi.fn(),
}));

vi.mock("@/lib/build/images", () => ({ collectImages: mockCollectImages }));
vi.mock("@/lib/auth", () => ({ requireAuth: mockRequireAuth }));

import { GET } from "@/app/api/build/images/route";

const IMAGES = [
  {
    category: "runtime",
    name: "App runtime base",
    ref: "node:22-bookworm-slim",
    digest: "sha256:abc",
    present: true,
  },
];

describe("GET /api/build/images", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCollectImages.mockResolvedValue(IMAGES);
    mockRequireAuth.mockResolvedValue({ authenticated: true, user: {} });
  });
  afterEach(() => vi.restoreAllMocks());

  it("returns the image list with no-store caching", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({ images: IMAGES });
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireAuth.mockResolvedValue({
      authenticated: false,
      response: NextResponse.json({ error: "nope" }, { status: 401 }),
    });
    const res = await GET();
    expect(res.status).toBe(401);
    expect(mockCollectImages).not.toHaveBeenCalled();
  });

  it("returns 500 when collection throws", async () => {
    mockCollectImages.mockRejectedValue(new Error("docker down"));
    const res = await GET();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to collect images" });
  });
});
