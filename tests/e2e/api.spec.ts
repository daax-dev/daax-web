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

  test("GET /api/containers returns container list or 503", async ({
    request,
  }) => {
    const response = await request.get("/api/containers");
    const data = await response.json();

    if (response.ok()) {
      // Docker reachable: read-only host listing.
      expect(data).toHaveProperty("containers");
      expect(Array.isArray(data.containers)).toBe(true);
      expect(data).toHaveProperty("total");
      // Sensitive / unused fields must not be present in the payload.
      for (const c of data.containers) {
        expect(c).not.toHaveProperty("labels");
        expect(c).not.toHaveProperty("createdAt");
      }
    } else {
      // Docker unavailable: clear 503 instead of a generic 500.
      expect(response.status()).toBe(503);
      expect(data).toHaveProperty("error", "Docker daemon not available");
    }
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

  test("protected endpoints reject a malformed forwarded identity with 401", async ({
    request,
  }) => {
    // The e2e server runs NON-strict (no DAAX_REQUIRE_AUTH): a request with NO
    // x-forwarded-user header is treated as the trusted local operator — the
    // zero-friction host-dev bypass in lib/auth-trust (allow-operator), so it
    // returns 200, not 401. That is by design and predates the #181 middleware.
    //
    // A PRESENT-but-empty x-forwarded-user, however, is a MALFORMED credential:
    // deriveAuthContext() trims it to null, the operator bypass is skipped
    // (rawUserHeader !== null), and evaluateAuthDecision() denies with 401 even
    // in non-strict mode. That is the real rejection path this test asserts —
    // exercising a genuine 401 without needing a live proxy or strict mode.
    const response = await request.get("/api/secrets", {
      headers: { "x-forwarded-user": "" },
    });
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
