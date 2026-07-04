/**
 * Route-authz sweep for the registry / catalog / release mutation routes (#197).
 *
 * A cluster of routes that create/update/delete persisted records (MCP registry,
 * gateway config, API-test templates, catalog build specs, releases) or trigger
 * real resource usage (`docker pull` / `docker build`) previously had NO
 * `requireAuth` call. This suite is the regression guard: for EVERY guarded
 * route+method it asserts that an UNAUTHENTICATED request
 *   (a) returns 401,
 *   (b) fires NO state mutation / side effect (the underlying DB/registry/docker
 *       layer is mocked and asserted NOT to have been called), and — for the two
 *       routes that read before they mutate (build-start, release-build) — that
 *       the pre-mutation read (`getBuildSpecById` / `getRelease`) also never
 *       fires, and
 *   (c) that `requireAuth` itself was invoked.
 * These assertions confirm the mutation/side-effect layer is unreachable without
 * auth; they do not assert where in the handler body the guard call sits
 * relative to body parsing or `params` resolution.
 * A representative authenticated subset asserts the request passes the guard and
 * reaches the mutation layer. A separate case below covers `GET /api/mcp/gateway`
 * without `?discover=true`, which is read-only and intentionally stays public.
 *
 * `@/lib/auth` is mocked so the real host-dev LOCAL_OPERATOR bypass never runs —
 * the guard mechanism is asserted deterministically, independent of
 * DAAX_REQUIRE_AUTH. The data/docker layers are mocked so nothing touches a real
 * DB, filesystem, or Docker daemon.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import { EventEmitter } from "events";

// ---------------------------------------------------------------------------
// Hoisted mock fns we assert on (must NOT run when unauthenticated).
// ---------------------------------------------------------------------------
const m = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  // mcp-registry
  addMcp: vi.fn(),
  updateMcp: vi.fn(),
  deleteMcp: vi.fn(),
  submitMcp: vi.fn(),
  approveSubmission: vi.fn(),
  rejectSubmission: vi.fn(),
  // mcp-gateway
  updateGatewayConfig: vi.fn(),
  syncDiscoveredMcps: vi.fn(),
  setMcpState: vi.fn(),
  enableMcp: vi.fn(),
  disableMcp: vi.fn(),
  toggleMcp: vi.fn(),
  recordMcpUsage: vi.fn(),
  bulkSetMcpEnabled: vi.fn(),
  enableContextOnly: vi.fn(),
  resetToAllEnabled: vi.fn(),
  setActiveContext: vi.fn(),
  // api-tools storage
  saveTemplate: vi.fn(),
  deleteTemplate: vi.fn(),
  // catalog
  createBuildSpec: vi.fn(),
  updateBuildSpec: vi.fn(),
  deleteBuildSpec: vi.fn(),
  createBuildJob: vi.fn(),
  getBuildSpecById: vi.fn(),
  // releases-db
  getRelease: vi.fn(),
  updateRelease: vi.fn(),
  deleteRelease: vi.fn(),
  saveFeatureSnapshot: vi.fn(),
  // child_process
  spawn: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Module mocks — full surface each handler imports; the mutation fns are the
// hoisted spies, the read fns return inert values so authenticated paths run.
// ---------------------------------------------------------------------------
vi.mock("@/lib/auth", () => ({ requireAuth: m.requireAuth }));

vi.mock("@/lib/mcp-registry", () => ({
  addMcp: m.addMcp,
  updateMcp: m.updateMcp,
  deleteMcp: m.deleteMcp,
  submitMcp: m.submitMcp,
  approveSubmission: m.approveSubmission,
  rejectSubmission: m.rejectSubmission,
  getAllMcps: vi.fn(() => []),
  loadRegistry: vi.fn(() => ({ lastUpdated: "" })),
  getMcpById: vi.fn(),
  getSubmissions: vi.fn(() => []),
}));

vi.mock("@/lib/mcp-gateway", () => ({
  updateGatewayConfig: m.updateGatewayConfig,
  syncDiscoveredMcps: m.syncDiscoveredMcps,
  loadGatewayState: vi.fn(() => ({ mcpStates: {}, config: {} })),
  getEnabledMcps: vi.fn(() => []),
  getRecommendedMcps: vi.fn(() => []),
  getMcpState: vi.fn(),
  setMcpState: m.setMcpState,
  enableMcp: m.enableMcp,
  disableMcp: m.disableMcp,
  toggleMcp: m.toggleMcp,
  recordMcpUsage: m.recordMcpUsage,
  bulkSetMcpEnabled: m.bulkSetMcpEnabled,
  enableContextOnly: m.enableContextOnly,
  resetToAllEnabled: m.resetToAllEnabled,
  setActiveContext: m.setActiveContext,
  getMcpsByContext: vi.fn(() => []),
  AVAILABLE_CONTEXTS: [],
}));

vi.mock("@/lib/mcp-discovery", () => ({
  discoverAllMcps: vi.fn(() => ({ discovered: [], sources: [], timestamp: 0 })),
}));

vi.mock("@/lib/api-tools/storage", () => ({
  listTemplates: vi.fn(() => []),
  saveTemplate: m.saveTemplate,
  deleteTemplate: m.deleteTemplate,
}));

vi.mock("@/lib/settings", () => ({
  isSubFeatureVisible: vi.fn(() => true),
  DEFAULT_PLUGINS: [],
}));

vi.mock("@/lib/catalog", () => ({
  getAllBuildSpecs: vi.fn(() => []),
  createBuildSpec: m.createBuildSpec,
  getBuildSpecById: m.getBuildSpecById,
  updateBuildSpec: m.updateBuildSpec,
  deleteBuildSpec: m.deleteBuildSpec,
  createBuildJob: m.createBuildJob,
}));

vi.mock("@/lib/releases-db", () => ({
  getRelease: m.getRelease,
  updateRelease: m.updateRelease,
  deleteRelease: m.deleteRelease,
  getReleaseShares: vi.fn(() => []),
  getFeatureSnapshots: vi.fn(() => []),
  saveFeatureSnapshot: m.saveFeatureSnapshot,
}));

vi.mock("@/lib/sbom-syft", () => ({
  generateRealSbom: vi.fn(async () => null),
}));

vi.mock("child_process", async () => {
  const actual =
    await vi.importActual<typeof import("child_process")>("child_process");
  return { ...actual, default: { ...actual, spawn: m.spawn }, spawn: m.spawn };
});

// Route handlers (imported AFTER mocks).
import { POST as mcpPOST } from "@/app/api/mcp/route";
import {
  PATCH as mcpIdPATCH,
  DELETE as mcpIdDELETE,
} from "@/app/api/mcp/[id]/route";
import {
  GET as gatewayGET,
  POST as gatewayPOST,
} from "@/app/api/mcp/gateway/route";
import {
  POST as gatewayIdPOST,
  PATCH as gatewayIdPATCH,
} from "@/app/api/mcp/gateway/[id]/route";
import { POST as gatewayBulkPOST } from "@/app/api/mcp/gateway/bulk/route";
import { POST as submitPOST } from "@/app/api/mcp/submit/route";
import { POST as submitIdPOST } from "@/app/api/mcp/submit/[id]/route";
import {
  POST as templatesPOST,
  DELETE as templatesDELETE,
} from "@/app/api/api-tools/templates/route";
import { POST as buildsPOST } from "@/app/api/catalog/builds/route";
import {
  PUT as buildsIdPUT,
  DELETE as buildsIdDELETE,
} from "@/app/api/catalog/builds/[id]/route";
import { POST as buildsStartPOST } from "@/app/api/catalog/builds/[id]/start/route";
import {
  PUT as releasesIdPUT,
  DELETE as releasesIdDELETE,
} from "@/app/api/releases/[id]/route";
import { POST as releasesBuildPOST } from "@/app/api/releases/[id]/build/route";
import { POST as dockerPullPOST } from "@/app/api/docker/pull/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
type Handler = (req: Request, ctx?: unknown) => Promise<Response>;

interface RouteCase {
  label: string;
  handler: Handler;
  method: string;
  url: string;
  body?: unknown;
  params?: Record<string, string>;
  /** Mutation/side-effect spies that must NOT fire on an unauthenticated call. */
  sideEffects: Array<() => ReturnType<typeof vi.fn>>;
}

function buildRequest(c: RouteCase): Request {
  const init: RequestInit = { method: c.method };
  if (c.body !== undefined) {
    init.body = JSON.stringify(c.body);
    init.headers = { "content-type": "application/json" };
  }
  return new Request(c.url, init);
}

function invoke(c: RouteCase): Promise<Response> {
  const req = buildRequest(c);
  return c.params
    ? c.handler(req, { params: Promise.resolve(c.params) })
    : c.handler(req);
}

function setUnauthenticated() {
  m.requireAuth.mockResolvedValue({
    authenticated: false,
    response: NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    ),
  });
}

function setAuthenticated() {
  m.requireAuth.mockResolvedValue({
    authenticated: true,
    user: {
      username: "tester",
      email: null,
      groups: [],
      authenticated: true,
      pictureUrl: null,
    },
  });
}

// A minimal child-process stand-in for the spawn()-based routes.
function makeProc() {
  const proc = Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    killed: false,
    kill: vi.fn(),
  });
  return proc;
}

// ---------------------------------------------------------------------------
// The full guarded route+method matrix (#197).
// ---------------------------------------------------------------------------
const ROUTES: RouteCase[] = [
  {
    label: "POST /api/mcp",
    handler: mcpPOST as unknown as Handler,
    method: "POST",
    url: "http://localhost/api/mcp",
    body: {
      id: "x",
      name: "x",
      description: "d",
      version: "1",
      category: "tools",
    },
    sideEffects: [() => m.addMcp],
  },
  {
    label: "PATCH /api/mcp/[id]",
    handler: mcpIdPATCH as unknown as Handler,
    method: "PATCH",
    url: "http://localhost/api/mcp/x",
    body: { name: "y" },
    params: { id: "x" },
    sideEffects: [() => m.updateMcp],
  },
  {
    label: "DELETE /api/mcp/[id]",
    handler: mcpIdDELETE as unknown as Handler,
    method: "DELETE",
    url: "http://localhost/api/mcp/x",
    params: { id: "x" },
    sideEffects: [() => m.deleteMcp],
  },
  {
    // GET mutates gateway state via syncDiscoveredMcps when ?discover=true.
    label: "GET /api/mcp/gateway?discover=true",
    handler: gatewayGET as unknown as Handler,
    method: "GET",
    url: "http://localhost/api/mcp/gateway?discover=true",
    sideEffects: [() => m.syncDiscoveredMcps],
  },
  {
    label: "POST /api/mcp/gateway",
    handler: gatewayPOST as unknown as Handler,
    method: "POST",
    url: "http://localhost/api/mcp/gateway",
    body: { action: "updateConfig", config: {} },
    sideEffects: [() => m.updateGatewayConfig],
  },
  {
    label: "POST /api/mcp/gateway/[id]",
    handler: gatewayIdPOST as unknown as Handler,
    method: "POST",
    url: "http://localhost/api/mcp/gateway/x",
    body: { action: "enable" },
    params: { id: "x" },
    sideEffects: [() => m.enableMcp],
  },
  {
    label: "PATCH /api/mcp/gateway/[id]",
    handler: gatewayIdPATCH as unknown as Handler,
    method: "PATCH",
    url: "http://localhost/api/mcp/gateway/x",
    body: { enabled: true },
    params: { id: "x" },
    sideEffects: [() => m.setMcpState],
  },
  {
    label: "POST /api/mcp/gateway/bulk",
    handler: gatewayBulkPOST as unknown as Handler,
    method: "POST",
    url: "http://localhost/api/mcp/gateway/bulk",
    body: { action: "resetAll" },
    sideEffects: [() => m.resetToAllEnabled],
  },
  {
    label: "POST /api/mcp/submit",
    handler: submitPOST as unknown as Handler,
    method: "POST",
    url: "http://localhost/api/mcp/submit",
    body: {
      name: "n",
      description: "d",
      version: "1",
      category: "tools",
      submittedBy: "u",
    },
    sideEffects: [() => m.submitMcp],
  },
  {
    label: "POST /api/mcp/submit/[id]",
    handler: submitIdPOST as unknown as Handler,
    method: "POST",
    url: "http://localhost/api/mcp/submit/x",
    body: { action: "approve", reviewedBy: "u" },
    params: { id: "x" },
    sideEffects: [() => m.approveSubmission, () => m.rejectSubmission],
  },
  {
    label: "POST /api/api-tools/templates",
    handler: templatesPOST as unknown as Handler,
    method: "POST",
    url: "http://localhost/api/api-tools/templates",
    body: { type: "rest", name: "tmpl", data: { a: 1 } },
    sideEffects: [() => m.saveTemplate],
  },
  {
    label: "DELETE /api/api-tools/templates",
    handler: templatesDELETE as unknown as Handler,
    method: "DELETE",
    url: "http://localhost/api/api-tools/templates?type=rest&name=tmpl",
    sideEffects: [() => m.deleteTemplate],
  },
  {
    label: "POST /api/catalog/builds",
    handler: buildsPOST as unknown as Handler,
    method: "POST",
    url: "http://localhost/api/catalog/builds",
    body: { name: "b", base: "x", output: "y" },
    sideEffects: [() => m.createBuildSpec],
  },
  {
    label: "PUT /api/catalog/builds/[id]",
    handler: buildsIdPUT as unknown as Handler,
    method: "PUT",
    url: "http://localhost/api/catalog/builds/x",
    body: { name: "b" },
    params: { id: "x" },
    sideEffects: [() => m.updateBuildSpec],
  },
  {
    label: "DELETE /api/catalog/builds/[id]",
    handler: buildsIdDELETE as unknown as Handler,
    method: "DELETE",
    url: "http://localhost/api/catalog/builds/x",
    params: { id: "x" },
    sideEffects: [() => m.deleteBuildSpec],
  },
  {
    label: "POST /api/catalog/builds/[id]/start",
    handler: buildsStartPOST as unknown as Handler,
    method: "POST",
    url: "http://localhost/api/catalog/builds/x/start",
    params: { id: "x" },
    // Guard is first — neither the read (getBuildSpecById) nor the job creation
    // (createBuildJob) may run before auth.
    sideEffects: [() => m.getBuildSpecById, () => m.createBuildJob],
  },
  {
    label: "PUT /api/releases/[id]",
    handler: releasesIdPUT as unknown as Handler,
    method: "PUT",
    url: "http://localhost/api/releases/x",
    body: { name: "r" },
    params: { id: "x" },
    sideEffects: [() => m.updateRelease],
  },
  {
    label: "DELETE /api/releases/[id]",
    handler: releasesIdDELETE as unknown as Handler,
    method: "DELETE",
    url: "http://localhost/api/releases/x",
    params: { id: "x" },
    sideEffects: [() => m.deleteRelease],
  },
  {
    label: "POST /api/releases/[id]/build",
    handler: releasesBuildPOST as unknown as Handler,
    method: "POST",
    url: "http://localhost/api/releases/x/build",
    params: { id: "x" },
    // Guard is first — no release read and no `docker build` spawn may run.
    sideEffects: [() => m.getRelease, () => m.spawn],
  },
  {
    label: "POST /api/docker/pull",
    handler: dockerPullPOST as unknown as Handler,
    method: "POST",
    url: "http://localhost/api/docker/pull",
    body: { image: "nginx:latest" },
    // Guard is first — no `docker pull` spawn may run.
    sideEffects: [() => m.spawn],
  },
];

describe("registry/catalog/release mutation routes require auth (#197)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.spawn.mockImplementation(() => makeProc() as never);
    m.deleteRelease.mockResolvedValue(true);
    m.addMcp.mockReturnValue({ id: "x" });
    m.createBuildSpec.mockResolvedValue({ id: "x" });
  });

  describe("unauthenticated → 401 and NO side effect", () => {
    for (const c of ROUTES) {
      it(`${c.label} rejects with 401 and mutates nothing`, async () => {
        setUnauthenticated();

        const res = await invoke(c);

        expect(res.status).toBe(401);
        for (const getSpy of c.sideEffects) {
          expect(getSpy()).not.toHaveBeenCalled();
        }
      });
    }
  });

  describe("requireAuth is invoked by every guarded handler", () => {
    for (const c of ROUTES) {
      it(`${c.label} calls requireAuth`, async () => {
        setUnauthenticated();
        await invoke(c);
        expect(m.requireAuth).toHaveBeenCalled();
      });
    }
  });

  describe("authenticated → passes the guard and reaches the mutation layer", () => {
    // Representative subset covering registry, gateway, catalog, releases-db,
    // and the docker-spawn path.
    const SUBSET = new Set([
      "POST /api/mcp",
      "GET /api/mcp/gateway?discover=true",
      "POST /api/catalog/builds",
      "DELETE /api/releases/[id]",
      "POST /api/docker/pull",
    ]);

    for (const c of ROUTES.filter((r) => SUBSET.has(r.label))) {
      it(`${c.label} reaches the handler when authenticated`, async () => {
        setAuthenticated();

        const res = await invoke(c);

        // Not blocked by the guard.
        expect(res.status).not.toBe(401);
        // The primary side effect fired (proof the guard was passed).
        expect(c.sideEffects[c.sideEffects.length - 1]()).toHaveBeenCalled();
      });
    }
  });

  describe("GET /api/mcp/gateway read-only view stays public", () => {
    // Only ?discover=true mutates gateway state; the plain read view returns
    // non-sensitive state (enabled flags, priority, config) and must remain
    // reachable without authentication.
    it("unauthenticated plain GET is not blocked and never calls requireAuth", async () => {
      setUnauthenticated();

      const res = await gatewayGET(
        new Request("http://localhost/api/mcp/gateway"),
      );

      expect(res.status).not.toBe(401);
      expect(m.requireAuth).not.toHaveBeenCalled();
      expect(m.syncDiscoveredMcps).not.toHaveBeenCalled();
    });

    it("unauthenticated ?discover=true is still guarded and mutates nothing", async () => {
      setUnauthenticated();

      const res = await gatewayGET(
        new Request("http://localhost/api/mcp/gateway?discover=true"),
      );

      expect(res.status).toBe(401);
      expect(m.requireAuth).toHaveBeenCalled();
      expect(m.syncDiscoveredMcps).not.toHaveBeenCalled();
    });
  });
});
