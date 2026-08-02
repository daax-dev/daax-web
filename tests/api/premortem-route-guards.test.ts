/**
 * Auth + path-confinement tests for the routes hardened in the 2026-08 security
 * premortem remediation:
 *   - GET  /api/workflow-editor/load  (A9: was unauth + unconfined file read)
 *   - POST /api/backlog/status        (A4/A9: was unauth; absolute projectName)
 *   - GET  /api/workspace             (A10: ?basePath= arbitrary dir listing)
 *   - GET/POST /api/devcontainer      (A4: unauth in-handler write route)
 *
 * `@/lib/auth` is mocked so the guard is asserted regardless of the real
 * LOCAL_OPERATOR bypass / DAAX_REQUIRE_AUTH posture.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextResponse } from "next/server";

const WORKSPACE_ROOT = "/workspace";

const { mockRequireAuth } = vi.hoisted(() => ({ mockRequireAuth: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireAuth: mockRequireAuth }));

// Fixed, machine-independent workspace root for confinement math.
vi.mock("@/lib/settings", () => ({
  getSettings: () => ({ basePath: "~/prj" }),
  expandPath: (p: string) => (p === "~/prj" ? WORKSPACE_ROOT : p),
}));
vi.mock("@/lib/path-utils", () => ({
  expandPath: (p: string) => (p === "~/prj" ? WORKSPACE_ROOT : p),
  isValidPort: (p: unknown) => typeof p === "number" && p >= 1024 && p <= 65535,
}));

// backlog/status pulls in the subprocess server + devcontainer libs; stub the
// heavy modules so the test isolates the guard/confinement logic.
vi.mock("@/server/backlog-server", () => ({
  backlogServer: {
    getStatus: () => ({ running: false }),
    healthCheck: async () => ({ healthy: false }),
    start: vi.fn(),
    stop: vi.fn(),
    restart: vi.fn(),
  },
  isBacklogInitialized: () => true,
  initializeBacklog: vi.fn(),
}));

import { GET as loadGET } from "@/app/api/workflow-editor/load/route";
import { POST as backlogPOST } from "@/app/api/backlog/status/route";
import { GET as workspaceGET } from "@/app/api/workspace/route";
import {
  GET as devcontainerGET,
  POST as devcontainerPOST,
} from "@/app/api/devcontainer/route";

const AUTH_USER = {
  username: "tester",
  email: null,
  groups: [],
  authenticated: true as const,
  pictureUrl: null,
};
const authed = () =>
  mockRequireAuth.mockResolvedValue({ authenticated: true, user: AUTH_USER });
const unauthed = () =>
  mockRequireAuth.mockResolvedValue({
    authenticated: false,
    response: NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    ),
  });

function req(url: string, method = "GET", body?: unknown): Request {
  return new Request(url, {
    method,
    ...(body !== undefined
      ? {
          body: JSON.stringify(body),
          headers: { "content-type": "application/json" },
        }
      : {}),
  });
}

let prevHostWorkspace: string | undefined;
beforeEach(() => {
  vi.clearAllMocks();
  prevHostWorkspace = process.env.HOST_WORKSPACE_PATH;
  delete process.env.HOST_WORKSPACE_PATH; // host mode
});
afterEach(() => {
  if (prevHostWorkspace === undefined) delete process.env.HOST_WORKSPACE_PATH;
  else process.env.HOST_WORKSPACE_PATH = prevHostWorkspace;
});

describe("GET /api/workflow-editor/load (A9)", () => {
  it("returns 401 when unauthenticated", async () => {
    unauthed();
    const res = await loadGET(
      req("http://localhost/api/workflow-editor/load?project=/etc") as never,
    );
    expect(res.status).toBe(401);
  });

  it("rejects a project path that escapes the workspace root (403)", async () => {
    authed();
    const res = await loadGET(
      req("http://localhost/api/workflow-editor/load?project=/etc") as never,
    );
    expect(res.status).toBe(403);
  });
});

describe("POST /api/backlog/status (A4/A9)", () => {
  it("returns 401 when unauthenticated", async () => {
    unauthed();
    const res = await backlogPOST(
      req("http://localhost/api/backlog/status", "POST", {
        action: "start",
        projectName: "daax",
        port: 6006,
      }),
    );
    expect(res.status).toBe(401);
  });

  it("rejects an ABSOLUTE projectName with 400 (path.join root-replacement)", async () => {
    authed();
    const res = await backlogPOST(
      req("http://localhost/api/backlog/status", "POST", {
        action: "start",
        projectName: "/etc/cron.d",
        port: 6006,
      }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects a `..` traversal projectName with 400", async () => {
    authed();
    const res = await backlogPOST(
      req("http://localhost/api/backlog/status", "POST", {
        action: "start",
        projectName: "../../../../etc",
        port: 6006,
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe("GET /api/workspace (A10)", () => {
  it("rejects a ?basePath= that escapes the allowed root (403)", async () => {
    authed();
    const res = await workspaceGET(
      req("http://localhost/api/workspace?basePath=/etc"),
    );
    expect(res.status).toBe(403);
  });

  it("returns 401 when unauthenticated", async () => {
    unauthed();
    const res = await workspaceGET(
      req("http://localhost/api/workspace?basePath=/etc"),
    );
    expect(res.status).toBe(401);
  });
});

describe("GET/POST /api/devcontainer (A4)", () => {
  it("GET returns 401 when unauthenticated (guard runs before any fs work)", async () => {
    unauthed();
    const res = await devcontainerGET(
      req("http://localhost/api/devcontainer?action=init-workflows") as never,
    );
    expect(res.status).toBe(401);
  });

  it("POST returns 401 when unauthenticated", async () => {
    unauthed();
    const res = await devcontainerPOST(
      req(
        "http://localhost/api/devcontainer?action=generate",
        "POST",
        {},
      ) as never,
    );
    expect(res.status).toBe(401);
  });
});
