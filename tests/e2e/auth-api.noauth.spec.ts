/**
 * Unauthenticated API Tests
 *
 * Verifies that ALL endpoints return 401 when accessed without auth
 * through Traefik+PocketID ForwardAuth.
 *
 * Requires: DAAX_AUTH_BASE_URL
 */

import { test, expect } from "./fixtures/auth-fixtures";

// When going through Traefik ForwardAuth, ALL requests without a valid session
// should be blocked by the middleware (typically 401 or redirect to login).
// Traefik returns either 401 or 302 depending on the request Accept header.

test.describe("Unauthenticated API - should be blocked by ForwardAuth", () => {
  const apiEndpoints = [
    { method: "GET" as const, path: "/api/config" },
    { method: "GET" as const, path: "/api/auth/user" },
    { method: "GET" as const, path: "/api/backlog/projects" },
    { method: "GET" as const, path: "/api/secrets" },
    { method: "GET" as const, path: "/api/testcontainers" },
    { method: "POST" as const, path: "/api/testcontainers" },
    { method: "POST" as const, path: "/api/backlog/tasks" },
    { method: "POST" as const, path: "/api/mcp/config" },
    { method: "POST" as const, path: "/api/secrets" },
    { method: "DELETE" as const, path: "/api/secrets" },
  ];

  for (const { method, path } of apiEndpoints) {
    test(`${method} ${path} → blocked (401 or redirect)`, async ({
      unauthenticatedRequest,
    }) => {
      let response;
      switch (method) {
        case "GET":
          response = await unauthenticatedRequest.get(path);
          break;
        case "POST":
          response = await unauthenticatedRequest.post(path, {
            data: {},
          });
          break;
        case "DELETE":
          response = await unauthenticatedRequest.delete(path);
          break;
      }

      // Traefik ForwardAuth blocks with 401, or browser-like requests get 302 to login
      // Either way, we should NOT get a successful response
      const status = response.status();
      expect(
        status === 401 || status === 302 || status === 307,
        `Expected 401/302/307 for ${method} ${path}, got ${status}`
      ).toBe(true);

      // Verify no data leakage on 401
      if (status === 401) {
        const text = await response.text();
        // Should not contain sensitive data
        expect(text).not.toContain("githubToken");
        expect(text).not.toContain("password");
      }
    });
  }
});
