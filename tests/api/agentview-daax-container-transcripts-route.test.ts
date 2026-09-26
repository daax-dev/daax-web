/** GET /api/agentview-daax/container-transcripts/[sessionId] — daax's own fact. */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockRequireAuth, mockLstat } = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockLstat: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ requireAuth: mockRequireAuth }));
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    default: { ...actual, lstat: mockLstat },
    lstat: mockLstat,
  };
});

import { GET } from "@/app/api/agentview-daax/container-transcripts/[sessionId]/route";

const ID = "4db77e81-4da9-4567-a755-ad316e8df7ba";
const ctx = (sessionId: string) => ({
  params: Promise.resolve({ sessionId }),
});
const get = (sessionId: string) =>
  GET(new Request("http://localhost/x"), ctx(sessionId));

beforeEach(() => {
  mockRequireAuth.mockResolvedValue({ authenticated: true });
  mockLstat.mockReset();
  vi.stubEnv("HOST_WORKSPACE_PATH", "/host/prj");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("container transcript route", () => {
  it("answers exists for a regular file at the literal container path", async () => {
    mockLstat.mockResolvedValue({ isFile: () => true });
    const res = await get(ID);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ exists: true });
    expect(mockLstat).toHaveBeenCalledWith(
      "/workspace/.daax/claude/projects/-workspace/4db77e81-4da9-4567-a755-ad316e8df7ba.jsonl",
    );
  });

  it("answers absent for ENOENT", async () => {
    mockLstat.mockRejectedValue(
      Object.assign(new Error("missing"), { code: "ENOENT" }),
    );
    const res = await get(ID);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ exists: false });
  });

  it("reports an unreadable store as a reason, not as absence", async () => {
    mockLstat.mockRejectedValue(
      Object.assign(new Error("denied"), { code: "EACCES" }),
    );
    const res = await get(ID);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      reason: "reading the container store failed: EACCES",
    });
  });

  it.each(["../../../etc/passwd", "..%2F..%2Fetc", `${ID}/../x`, "not-a-uuid"])(
    "refuses %j before building a path",
    async (bad) => {
      const res = await get(bad);
      expect(res.status).toBe(400);
      expect(mockLstat).not.toHaveBeenCalled();
    },
  );

  it("refuses in host mode, where there is no container store", async () => {
    vi.stubEnv("HOST_WORKSPACE_PATH", "");
    const res = await get(ID);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      reason: "daax is in host mode; there is no container store",
    });
    expect(mockLstat).not.toHaveBeenCalled();
  });

  it("requires authentication", async () => {
    mockRequireAuth.mockResolvedValue({
      authenticated: false,
      response: new Response("{}", { status: 401 }),
    });
    const res = await get(ID);
    expect(res.status).toBe(401);
    expect(mockLstat).not.toHaveBeenCalled();
  });
});
