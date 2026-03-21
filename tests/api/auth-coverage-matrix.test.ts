/**
 * Auth Coverage Matrix Test
 *
 * Validates that all API routes requiring authentication properly reject
 * unauthenticated requests with 401, and that public routes work without auth.
 *
 * Pattern: vi.hoisted + vi.mock("@/lib/auth") + setupAuthenticatedUser helper
 * (same approach as backlog-tasks-route.test.ts)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Hoist mock functions
// ---------------------------------------------------------------------------
const { mockRequireAuth, mockGetAuthUser } = vi.hoisted(() => {
  const _mockRequireAuth = vi.fn();
  const _mockGetAuthUser = vi.fn();
  return {
    mockRequireAuth: _mockRequireAuth,
    mockGetAuthUser: _mockGetAuthUser,
  };
});

// ---------------------------------------------------------------------------
// Mock auth module
// ---------------------------------------------------------------------------
vi.mock("@/lib/auth", () => ({
  requireAuth: mockRequireAuth,
  getAuthUser: mockGetAuthUser,
}));

// ---------------------------------------------------------------------------
// Mock heavy dependencies that route handlers import
// ---------------------------------------------------------------------------

// Backlog store
const mockBacklogStore = {
  getProject: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
};
vi.mock("@/server/backlog-multi-store", () => ({
  multiBacklogStore: mockBacklogStore,
  getMultiBacklogStore: () => mockBacklogStore,
}));

// Secrets
vi.mock("@/lib/secrets", () => ({
  getSecrets: vi.fn(() => ({})),
  saveSecrets: vi.fn(),
}));
vi.mock("@/lib/github-app", () => ({
  isGitHubAppConfigured: vi.fn(() => false),
  isGitHubAuthorized: vi.fn(() => false),
  getAuthorizationUrl: vi.fn(),
  exchangeCodeForToken: vi.fn(),
  verifyToken: vi.fn(),
  getGitHubToken: vi.fn(),
}));

// AI sessions (Docker-based)
vi.mock("@/server/ai-session-manager", () => ({
  getSessionManager: vi.fn(() => ({
    listSessions: vi.fn(async () => []),
    createSession: vi.fn(),
    getSession: vi.fn(),
    terminateSession: vi.fn(),
  })),
}));

// MCP config
vi.mock("@/lib/mcp-config", () => ({
  getMcpConfig: vi.fn(() => ({ servers: {} })),
  updateMcpConfig: vi.fn(),
}));

// Git worktree
vi.mock("@/lib/git-worktree", () => ({
  createWorktree: vi.fn(),
  listWorktrees: vi.fn(async () => []),
}));

// Terminal recordings
vi.mock("@/lib/terminal-recordings", () => ({
  getRecording: vi.fn(),
  updateRecording: vi.fn(),
  deleteRecording: vi.fn(),
  createPRForRecording: vi.fn(),
}));

// Docker operations
vi.mock("@/lib/docker", () => ({
  listContainers: vi.fn(async () => []),
  getContainer: vi.fn(),
  createContainer: vi.fn(),
  startContainer: vi.fn(),
  stopContainer: vi.fn(),
  restartContainer: vi.fn(),
  removeContainer: vi.fn(),
  cleanupContainers: vi.fn(),
}));

// Releases
vi.mock("@/lib/releases", () => ({
  getReleases: vi.fn(async () => []),
  createRelease: vi.fn(),
}));

// Devcontainers
vi.mock("@/lib/devcontainer-config", () => ({
  createDevContainerRepo: vi.fn(),
  pushDevContainerConfig: vi.fn(),
  saveDevContainer: vi.fn(),
}));

// Workflow editor
vi.mock("@/lib/workflow-editor", () => ({
  createWorkflow: vi.fn(),
}));

// API tools credentials
vi.mock("@/lib/api-tools-credentials", () => ({
  getCredentials: vi.fn(() => []),
  saveCredential: vi.fn(),
  deleteCredential: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTestRequest(url: string, options?: RequestInit): NextRequest {
  return new Request(url, options) as unknown as NextRequest;
}

function setupUnauthenticated() {
  mockRequireAuth.mockResolvedValue({
    authenticated: false,
    response: new Response(
      JSON.stringify({ error: "Authentication required" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    ),
  });
  mockGetAuthUser.mockResolvedValue({
    username: null,
    email: null,
    groups: [],
    authenticated: false,
    pictureUrl: null,
  });
}

// ---------------------------------------------------------------------------
// Route definitions: which methods on which routes require auth
// ---------------------------------------------------------------------------

interface ProtectedRoute {
  /** Human-readable label */
  label: string;
  /** HTTP method */
  method: "POST" | "PATCH" | "DELETE" | "GET";
  /** URL for the request */
  url: string;
  /** Import path for the module */
  importPath: string;
  /** The export name that handles this method */
  handlerExport: string;
  /** Extra request init (body, etc.) */
  requestInit?: RequestInit;
  /** Route params for dynamic routes */
  routeParams?: Record<string, string>;
}

// We test a representative subset covering every auth-protected route file.
// Each entry represents one handler that calls requireAuth().
const PROTECTED_ROUTES: ProtectedRoute[] = [
  {
    label: "POST /api/backlog/tasks",
    method: "POST",
    url: "http://localhost/api/backlog/tasks",
    importPath: "@/app/api/backlog/tasks/route",
    handlerExport: "POST",
    requestInit: {
      method: "POST",
      body: JSON.stringify({ project: "/workspace/test", task: { title: "t" } }),
    },
  },
  {
    label: "PATCH /api/backlog/tasks/[id]",
    method: "PATCH",
    url: "http://localhost/api/backlog/tasks/task-1",
    importPath: "@/app/api/backlog/tasks/[id]/route",
    handlerExport: "PATCH",
    requestInit: {
      method: "PATCH",
      body: JSON.stringify({ project: "/workspace/test", updates: { status: "Done" } }),
    },
    routeParams: { id: "task-1" },
  },
  {
    label: "DELETE /api/backlog/tasks/[id]",
    method: "DELETE",
    url: "http://localhost/api/backlog/tasks/task-1",
    importPath: "@/app/api/backlog/tasks/[id]/route",
    handlerExport: "DELETE",
    requestInit: {
      method: "DELETE",
      body: JSON.stringify({ project: "/workspace/test" }),
    },
    routeParams: { id: "task-1" },
  },
  {
    label: "GET /api/secrets",
    method: "GET",
    url: "http://localhost/api/secrets",
    importPath: "@/app/api/secrets/route",
    handlerExport: "GET",
  },
  {
    label: "POST /api/secrets",
    method: "POST",
    url: "http://localhost/api/secrets",
    importPath: "@/app/api/secrets/route",
    handlerExport: "POST",
    requestInit: {
      method: "POST",
      body: JSON.stringify({ githubToken: "test" }),
    },
  },
  {
    label: "DELETE /api/secrets",
    method: "DELETE",
    url: "http://localhost/api/secrets",
    importPath: "@/app/api/secrets/route",
    handlerExport: "DELETE",
    requestInit: { method: "DELETE" },
  },
  {
    label: "POST /api/testcontainers",
    method: "POST",
    url: "http://localhost/api/testcontainers",
    importPath: "@/app/api/testcontainers/route",
    handlerExport: "POST",
    requestInit: {
      method: "POST",
      body: JSON.stringify({ image: "nginx:latest", name: "test" }),
    },
  },
  {
    label: "POST /api/testcontainers/cleanup",
    method: "POST",
    url: "http://localhost/api/testcontainers/cleanup",
    importPath: "@/app/api/testcontainers/cleanup/route",
    handlerExport: "POST",
    requestInit: { method: "POST" },
  },
  {
    label: "POST /api/mcp/config",
    method: "POST",
    url: "http://localhost/api/mcp/config",
    importPath: "@/app/api/mcp/config/route",
    handlerExport: "POST",
    requestInit: {
      method: "POST",
      body: JSON.stringify({ servers: {} }),
    },
  },
];

// ---------------------------------------------------------------------------
// Public route checks (should NOT require auth)
// ---------------------------------------------------------------------------

interface PublicRoute {
  label: string;
  url: string;
  importPath: string;
  handlerExport: string;
}

const PUBLIC_ROUTES: PublicRoute[] = [
  {
    label: "GET /api/backlog/tasks",
    url: "http://localhost/api/backlog/tasks?project=/workspace/test",
    importPath: "@/app/api/backlog/tasks/route",
    handlerExport: "GET",
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Auth Coverage Matrix", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Protected routes return 401 without authentication", () => {
    for (const route of PROTECTED_ROUTES) {
      it(`${route.label} → 401`, async () => {
        setupUnauthenticated();

        // Dynamic import of the route handler
        const mod = await import(route.importPath);
        const handler = mod[route.handlerExport];
        expect(handler).toBeDefined();

        const request = createTestRequest(route.url, route.requestInit);

        // Build args: some routes take (request, { params })
        const args: unknown[] = [request];
        if (route.routeParams) {
          args.push({ params: Promise.resolve(route.routeParams) });
        }

        const response = await handler(...args);
        expect(response.status).toBe(401);

        const data = await response.json();
        expect(data.error).toBeDefined();
      });
    }
  });

  describe("Public routes work without authentication", () => {
    for (const route of PUBLIC_ROUTES) {
      it(`${route.label} → not 401`, async () => {
        setupUnauthenticated();

        // Provide mock data for public routes
        mockBacklogStore.getProject.mockReturnValue({
          path: "/workspace/test",
          name: "Test",
          tasks: [],
          documents: [],
          decisions: [],
          milestones: [],
          config: { statuses: [], labels: [], milestones: [], dateFormat: "YYYY-MM-DD", projectName: "Test" },
          taskCount: 0,
          lastUpdated: new Date().toISOString(),
        });

        const mod = await import(route.importPath);
        const handler = mod[route.handlerExport];
        expect(handler).toBeDefined();

        const request = createTestRequest(route.url);
        const response = await handler(request);

        // Public route should not return 401
        expect(response.status).not.toBe(401);
      });
    }
  });

  describe("requireAuth is called by protected handlers", () => {
    it("tracks that requireAuth was invoked for protected routes", async () => {
      setupUnauthenticated();

      // Pick one representative route
      const mod = await import("@/app/api/secrets/route");
      const request = createTestRequest("http://localhost/api/secrets");
      await mod.GET(request);

      expect(mockRequireAuth).toHaveBeenCalled();
    });
  });
});
