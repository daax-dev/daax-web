/**
 * Authz tests for GET /api/files (#194).
 *
 * The route recursively reads every .jsonl file under the workspace and returns
 * their full contents. Those logs can contain tokens/transcripts, so the route
 * must require authentication BEFORE any filesystem walk.
 *
 * Pattern mirrors build-images-route.test.ts: mock `@/lib/auth` so the real
 * LOCAL_OPERATOR bypass never runs — the guard is asserted deterministically
 * regardless of DAAX_REQUIRE_AUTH. `fs`/`fs/promises` are partial-mocked so the
 * walk is fully controllable and machine-independent (no real paths).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextResponse } from "next/server";

const {
  mockRequireAuth,
  mockExistsSync,
  mockReaddir,
  mockReadFile,
  mockStat,
  mockRealpath,
} = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockExistsSync: vi.fn(),
  mockReaddir: vi.fn(),
  mockReadFile: vi.fn(),
  mockStat: vi.fn(),
  mockRealpath: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireAuth: mockRequireAuth }));

// Both named and default exports are provided for ESM/CJS interop — the route
// imports named bindings, but esbuild interop may resolve them via `default`.
vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return {
    ...actual,
    existsSync: mockExistsSync,
    default: { ...actual, existsSync: mockExistsSync },
  };
});

vi.mock("fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs/promises")>();
  const overrides = {
    readdir: mockReaddir,
    readFile: mockReadFile,
    stat: mockStat,
    realpath: mockRealpath,
  };
  return { ...actual, ...overrides, default: { ...actual, ...overrides } };
});

import { GET } from "@/app/api/files/route";

function req(url = "http://localhost/api/files"): Request {
  return new Request(url);
}

// Minimal Dirent-like entry (only isDirectory/isFile are used by the route).
function dirent(name: string, isDir: boolean) {
  return { name, isDirectory: () => isDir, isFile: () => !isDir };
}

const AUTH_USER = {
  username: "tester",
  email: null,
  groups: [],
  authenticated: true as const,
  pictureUrl: null,
};

describe("GET /api/files authorization (#194)", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // getWorkspacePath() returns "/workspace" when it exists — steer to a
    // deterministic root and stub the walk fixture beneath it.
    mockExistsSync.mockImplementation((p: string) => p === "/workspace");
    mockRealpath.mockImplementation(async (p: string) => p);
    mockStat.mockResolvedValue({ mtime: new Date("2024-01-01T00:00:00.000Z") });
    mockReadFile.mockResolvedValue("line-one\nline-two\n");
    mockReaddir.mockImplementation(async (dir: string) => {
      if (dir === "/workspace") return [dirent("myproj", true)];
      if (dir === "/workspace/myproj") return [dirent(".logs", true)];
      if (dir === "/workspace/myproj/.logs")
        return [dirent("decisions.jsonl", false)];
      return [];
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it("returns 401 with no file content when unauthenticated (walk never runs)", async () => {
    mockRequireAuth.mockResolvedValue({
      authenticated: false,
      response: NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      ),
    });

    const res = await GET(req());

    expect(res.status).toBe(401);
    // No fs-touching helper reachable from the handler may run before the
    // auth check — requireAuth() must be the first thing in the handler,
    // ahead of getWorkspacePath() (existsSync) and the recursive walk
    // (readdir/readFile/stat/realpath).
    expect(mockExistsSync).not.toHaveBeenCalled();
    expect(mockReaddir).not.toHaveBeenCalled();
    expect(mockReadFile).not.toHaveBeenCalled();
    expect(mockStat).not.toHaveBeenCalled();
    expect(mockRealpath).not.toHaveBeenCalled();

    // Body must carry the auth error and leak no file listing/content.
    const body = await res.json();
    expect(body.error).toBe("Authentication required");
    expect(body.files).toBeUndefined();
    expect(body.projects).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("line-one");
  });

  it("returns the expected .jsonl listing when authenticated", async () => {
    mockRequireAuth.mockResolvedValue({
      authenticated: true,
      user: AUTH_USER,
    });

    const res = await GET(req());

    expect(res.status).toBe(200);
    expect(mockReaddir).toHaveBeenCalled();

    const body = await res.json();
    expect(body.projectList).toEqual(["myproj"]);
    expect(body.projects.myproj.files).toHaveLength(1);

    const file = body.projects.myproj.files[0];
    expect(file.name).toBe("decisions.jsonl");
    expect(file.path).toBe("decisions.jsonl");
    expect(file.recordCount).toBe(2);
    expect(file.content).toBe("line-one\nline-two\n");

    // Backwards-compatible flat list is prefixed with the project name.
    expect(body.files).toHaveLength(1);
    expect(body.files[0].path).toBe("myproj/decisions.jsonl");
    expect(body.files[0].content).toBe("line-one\nline-two\n");
  });
});
