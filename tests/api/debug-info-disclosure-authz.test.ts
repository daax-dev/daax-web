/**
 * Auth tests for the debug/info-disclosure routes (issue #199).
 *
 * These four routes previously leaked host paths and environment details
 * (HOME/USER/PWD/HOST_WORKSPACE_PATH, workspace listings) with no auth check:
 *   - GET/DELETE /api/settings/debug
 *   - GET        /api/debug/workspace
 *   - GET        /api/test-path
 *   - GET        /api/workspace
 *
 * Each now calls requireAuth() before disclosing anything. Auth is mocked
 * following the established route-test pattern (vi.hoisted + vi.mock("@/lib/auth")).
 * getSettings is mocked so an authenticated request never touches the operator's
 * real settings/filesystem in the 401 path (the handlers short-circuit before it).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const { mockRequireAuth, mockGetSettings, mockExistsSync, mockReaddirSync } =
  vi.hoisted(() => ({
    mockRequireAuth: vi.fn(),
    mockGetSettings: vi.fn(),
    mockExistsSync: vi.fn(),
    mockReaddirSync: vi.fn(),
  }));

vi.mock("@/lib/auth", () => ({ requireAuth: mockRequireAuth }));
vi.mock("@/lib/settings", () => ({
  getSettings: mockGetSettings,
  DEFAULT_SETTINGS: { basePath: "~/prj" },
}));
// Mock the filesystem so the authed happy-path for /api/workspace (which does a
// directory walk() via existsSync/readdirSync) and /api/test-path stay hermetic.
// Everything else on `fs` is passed through untouched. Both named and default
// exports are overridden — the routes import named bindings, but esbuild interop
// may resolve them via `default`.
vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  const overrides = {
    existsSync: mockExistsSync,
    readdirSync: mockReaddirSync,
  };
  return { ...actual, ...overrides, default: { ...actual, ...overrides } };
});

import {
  GET as settingsDebugGET,
  DELETE as settingsDebugDELETE,
} from "@/app/api/settings/debug/route";
import { GET as debugWorkspaceGET } from "@/app/api/debug/workspace/route";
import { GET as testPathGET } from "@/app/api/test-path/route";
import { GET as workspaceGET } from "@/app/api/workspace/route";

function unauthResult() {
  return {
    authenticated: false,
    response: NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    ),
  };
}

describe("debug/info-disclosure routes require auth (#199)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSettings.mockReturnValue({ basePath: "~/prj" });
    // Filesystem defaults for the authed happy-path: the workspace base exists
    // and lists no entries, so walk() returns an empty directory set cleanly.
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue([]);
    // Default: unauthenticated. Individual tests override for the authed case.
    mockRequireAuth.mockResolvedValue(unauthResult());
  });

  it("GET /api/settings/debug returns 401 when unauthenticated", async () => {
    const res = await settingsDebugGET();
    expect(res.status).toBe(401);
    expect(mockRequireAuth).toHaveBeenCalled();
  });

  it("DELETE /api/settings/debug returns 401 when unauthenticated", async () => {
    const res = await settingsDebugDELETE();
    expect(res.status).toBe(401);
    expect(mockRequireAuth).toHaveBeenCalled();
  });

  it("GET /api/debug/workspace returns 401 when unauthenticated", async () => {
    const res = await debugWorkspaceGET();
    expect(res.status).toBe(401);
    expect(mockRequireAuth).toHaveBeenCalled();
  });

  it("GET /api/test-path returns 401 when unauthenticated", async () => {
    const res = await testPathGET();
    expect(res.status).toBe(401);
    expect(mockRequireAuth).toHaveBeenCalled();
  });

  it("GET /api/workspace returns 401 when unauthenticated", async () => {
    const res = await workspaceGET(
      new NextRequest("http://localhost/api/workspace"),
    );
    expect(res.status).toBe(401);
    expect(mockRequireAuth).toHaveBeenCalled();
  });

  it("does not leak environment details in the 401 body (settings/debug)", async () => {
    const res = await settingsDebugGET();
    const body = await res.json();
    expect(body).not.toHaveProperty("environment");
    expect(JSON.stringify(body)).not.toContain("HOST_WORKSPACE_PATH");
  });

  it("GET /api/settings/debug proceeds when authenticated", async () => {
    mockRequireAuth.mockResolvedValue({ authenticated: true, user: {} });
    const res = await settingsDebugGET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("environment");
  });

  it("GET /api/debug/workspace proceeds when authenticated", async () => {
    mockRequireAuth.mockResolvedValue({ authenticated: true, user: {} });
    const res = await debugWorkspaceGET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("settings");
    expect(body).toHaveProperty("environment");
  });

  it("GET /api/test-path proceeds when authenticated", async () => {
    mockRequireAuth.mockResolvedValue({ authenticated: true, user: {} });
    const res = await testPathGET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.paths)).toBe(true);
  });

  it("GET /api/workspace proceeds when authenticated", async () => {
    mockRequireAuth.mockResolvedValue({ authenticated: true, user: {} });
    const res = await workspaceGET(
      new NextRequest("http://localhost/api/workspace"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.directories)).toBe(true);
  });
});
