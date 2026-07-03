/**
 * Tests for GET /api/git/status auth + path confinement (issue #189).
 *
 * The handler executes git with cwd = the requested path, so it now (1) requires
 * authentication and (2) confines `path` to the operator-configured workspace
 * root. Auth is mocked following the established route-test pattern
 * (vi.hoisted + vi.mock("@/lib/auth")); the real isValidPath/resolveWorkspaceRoot
 * run so the 400 confinement check is exercised end-to-end.
 *
 * The workspace root itself is ALSO mocked (vi.mock("@/lib/settings"), same
 * pattern as tests/lib/worktree-manager-delete.test.ts) and pinned to a
 * dedicated temp directory. Without this, resolveWorkspaceRoot() would fall
 * through to the operator's REAL getSettings().basePath: if that were ever
 * configured as "/" (isValidPath's explicit root-base special case treats
 * every absolute path as in-root), "/etc/passwd" would no longer be outside
 * the root and the 400 assertion below would silently start failing on that
 * machine. Pinning basePath to a fixed non-root temp dir makes the test
 * deterministic regardless of the host's configured settings.
 */
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  afterAll,
} from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const { mockRequireAuth, mockGetSettings } = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockGetSettings: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireAuth: mockRequireAuth }));
// Control the workspace root independent of the operator's real settings
// (see file-header note above).
vi.mock("@/lib/settings", () => ({ getSettings: mockGetSettings }));

import { GET } from "@/app/api/git/status/route";

// Real temp dir so realpath-based confinement in isValidPath resolves cleanly,
// and so the "outside root" fixture below is guaranteed to be outside it
// regardless of the machine this test runs on.
const workspaceRoot = mkdtempSync(join(tmpdir(), "git-status-authz-root-"));

afterAll(() => {
  rmSync(workspaceRoot, { recursive: true, force: true });
});

function req(path?: string): NextRequest {
  const url = path
    ? `http://localhost/api/git/status?path=${encodeURIComponent(path)}`
    : "http://localhost/api/git/status";
  return new NextRequest(url);
}

describe("GET /api/git/status auth + confinement (#189)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Host-mode namespace: no container translation of the temp workspace root.
    vi.stubEnv("HOST_WORKSPACE_PATH", "");
    mockGetSettings.mockReturnValue({ basePath: workspaceRoot });
    // Default: authenticated (individual tests override for the 401 case).
    mockRequireAuth.mockResolvedValue({ authenticated: true, user: {} });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
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
    // /etc/passwd is never inside the pinned temp workspace root, so this is
    // rejected regardless of the host's real (unmocked) configured basePath.
    const res = await GET(req("/etc/passwd"));
    expect(res.status).toBe(400);
    expect(mockRequireAuth).toHaveBeenCalled();
  });

  it("returns 400 when the path query parameter is missing", async () => {
    const res = await GET(req());
    expect(res.status).toBe(400);
  });
});
