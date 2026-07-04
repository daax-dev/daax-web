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

const { mockRequireAuth, mockGetSettings } = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockGetSettings: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireAuth: mockRequireAuth }));
vi.mock("@/lib/settings", () => ({
  getSettings: mockGetSettings,
  DEFAULT_SETTINGS: { basePath: "~/prj" },
}));

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
});
