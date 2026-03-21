/**
 * Authenticated API Tests
 *
 * Verifies API endpoints work correctly when authenticated via Pocket ID.
 * Runs against a live Traefik+PocketID deployment.
 *
 * Requires: DAAX_AUTH_BASE_URL, auth-setup project to have run first.
 */

import { test, expect } from "./fixtures/auth-fixtures";

test.describe("Authenticated API - Public GET endpoints", () => {
  test("GET /api/backlog/projects returns 200", async ({ authenticatedRequest }) => {
    const response = await authenticatedRequest.get("/api/backlog/projects");
    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.projects).toBeDefined();
  });

  test("GET /api/config returns 200", async ({ authenticatedRequest }) => {
    const response = await authenticatedRequest.get("/api/config");
    expect(response.status()).toBe(200);
  });

  test("GET /api/auth/user returns authenticated user", async ({ authenticatedRequest }) => {
    const response = await authenticatedRequest.get("/api/auth/user");
    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.authenticated).toBe(true);
    expect(data.username).toBeTruthy();
  });
});

test.describe("Authenticated API - Protected endpoints", () => {
  test("GET /api/secrets returns 200", async ({ authenticatedRequest }) => {
    const response = await authenticatedRequest.get("/api/secrets");
    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.github).toBeDefined();
  });

  test("POST /api/mcp/config returns non-401", async ({ authenticatedRequest }) => {
    const response = await authenticatedRequest.post("/api/mcp/config", {
      data: { servers: {} },
    });
    // May return 200 or 400 (bad input), but NOT 401
    expect(response.status()).not.toBe(401);
  });
});

test.describe("Authenticated API - Backlog CRUD", () => {
  test("GET /api/backlog/tasks returns tasks", async ({ authenticatedRequest }) => {
    // First get a project
    const projectsRes = await authenticatedRequest.get("/api/backlog/projects");
    const projectsData = await projectsRes.json();

    if (projectsData.projects?.length > 0) {
      const projectPath = projectsData.projects[0].path;
      const tasksRes = await authenticatedRequest.get(
        `/api/backlog/tasks?project=${encodeURIComponent(projectPath)}`
      );
      expect(tasksRes.status()).toBe(200);
      const tasksData = await tasksRes.json();
      expect(tasksData.tasks).toBeDefined();
      expect(Array.isArray(tasksData.tasks)).toBe(true);
    }
  });
});
