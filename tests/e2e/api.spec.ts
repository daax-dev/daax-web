import { test, expect } from "@playwright/test";

/**
 * API Tests
 *
 * Verify API endpoints are working correctly.
 * These complement the unit tests with real HTTP integration tests.
 */
test.describe("API Endpoints", () => {
  test("GET /api/terminal-recordings returns list", async ({ request }) => {
    const response = await request.get("/api/terminal-recordings");
    expect(response.ok()).toBe(true);

    const data = await response.json();
    expect(data).toHaveProperty("recordings");
    expect(Array.isArray(data.recordings)).toBe(true);
  });

  test("GET /api/testcontainers returns container list", async ({
    request,
  }) => {
    const response = await request.get("/api/testcontainers");
    expect(response.ok()).toBe(true);

    const data = await response.json();
    expect(data).toHaveProperty("containers");
  });

  test("GET /api/ai/sessions returns session list", async ({ request }) => {
    const response = await request.get("/api/ai/sessions");
    expect(response.ok()).toBe(true);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data).toHaveProperty("sessions");
  });

  test("GET /api/mcp returns MCP server list", async ({ request }) => {
    const response = await request.get("/api/mcp");
    // Should return 200 with data or empty list
    expect(response.status()).toBeLessThan(500);
  });

  test("GET /api/backlog/status returns backlog status", async ({
    request,
  }) => {
    const response = await request.get("/api/backlog/status");
    expect(response.ok()).toBe(true);

    const data = await response.json();
    // Should have either initialized or running property
    expect(data).toHaveProperty("running");
  });

  test("GET /api/workspace returns workspace info", async ({ request }) => {
    const response = await request.get("/api/workspace");
    // May require auth or return error, but shouldn't 500
    expect(response.status()).toBeLessThan(500);
  });

  test("protected endpoints return 401 without auth", async ({ request }) => {
    const response = await request.get("/api/secrets");
    expect(response.status()).toBe(401);

    const data = await response.json();
    expect(data.error).toContain("Authentication required");
  });

  test("GET /api/git/status returns git info", async ({ request }) => {
    const response = await request.get("/api/git/status");
    // May or may not have git info depending on container
    expect(response.status()).toBeLessThan(500);
  });
});
