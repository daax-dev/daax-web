/**
 * API Route Existence Tests
 *
 * This test suite validates that all API routes called from client code
 * actually exist and export the expected HTTP methods.
 *
 * This prevents issues where client code calls API endpoints that don't exist,
 * which was the root cause of the provenance page crash (missing /api/devcontainer route).
 */

import { describe, it, expect } from "vitest";
import { existsSync } from "fs";
import { join } from "path";

// Map of API routes that are called from client code
// Key: API path as called from client
// Value: Expected HTTP methods that should be exported
// Note: importPath uses @ alias configured in vitest for reliable module resolution
const CLIENT_API_CALLS: Record<
  string,
  { path: string; importPath: string; methods: string[] }
> = {
  // DevContainer API - called from /provenance/create page
  "/api/devcontainer": {
    path: "app/api/devcontainer/route.ts",
    importPath: "@/app/api/devcontainer/route",
    methods: ["GET", "POST"],
  },

  // Catalog APIs - called from various provenance pages
  "/api/catalog/bases": {
    path: "app/api/catalog/bases/route.ts",
    importPath: "@/app/api/catalog/bases/route",
    methods: ["GET"],
  },
  "/api/catalog/features": {
    path: "app/api/catalog/features/route.ts",
    importPath: "@/app/api/catalog/features/route",
    methods: ["GET"],
  },
  "/api/catalog/builds": {
    path: "app/api/catalog/builds/route.ts",
    importPath: "@/app/api/catalog/builds/route",
    methods: ["GET", "POST"],
  },
  "/api/catalog/images": {
    path: "app/api/catalog/images/route.ts",
    importPath: "@/app/api/catalog/images/route",
    methods: ["GET"],
  },
  "/api/catalog/dashboard/stats": {
    path: "app/api/catalog/dashboard/stats/route.ts",
    importPath: "@/app/api/catalog/dashboard/stats/route",
    methods: ["GET"],
  },

  // Git APIs - called from AI coding page for worktrees
  "/api/git/status": {
    path: "app/api/git/status/route.ts",
    importPath: "@/app/api/git/status/route",
    methods: ["GET"],
  },
  "/api/git/worktree": {
    path: "app/api/git/worktree/route.ts",
    importPath: "@/app/api/git/worktree/route",
    methods: ["GET", "POST", "DELETE"],
  },

  // Backlog API - called from backlog components
  "/api/backlog/status": {
    path: "app/api/backlog/status/route.ts",
    importPath: "@/app/api/backlog/status/route",
    methods: ["GET"],
  },

  // Provenance Admin APIs (note: hyphenated path)
  "/api/provenance-admin/tables": {
    path: "app/api/provenance-admin/tables/route.ts",
    importPath: "@/app/api/provenance-admin/tables/route",
    methods: ["GET"],
  },
};

describe("API Route Existence", () => {
  const projectRoot = process.cwd();

  describe("all client-called API routes exist", () => {
    Object.entries(CLIENT_API_CALLS).forEach(([apiPath, config]) => {
      it(`${apiPath} route file exists`, () => {
        const fullPath = join(projectRoot, config.path);
        const exists = existsSync(fullPath);

        expect(
          exists,
          `API route ${apiPath} is called from client code but the route file does not exist at ${config.path}`,
        ).toBe(true);
      });
    });
  });

  describe("API routes export expected HTTP methods", () => {
    Object.entries(CLIENT_API_CALLS).forEach(([apiPath, config]) => {
      const fullPath = join(projectRoot, config.path);

      // Only test if the file exists
      if (!existsSync(fullPath)) {
        it.skip(`${apiPath} exports expected methods (file missing)`, () => {});
        return;
      }

      config.methods.forEach((method) => {
        it(`${apiPath} exports ${method} handler`, async () => {
          // Use path alias for reliable module resolution in all environments
          const routeModule = await import(config.importPath);

          expect(
            routeModule[method],
            `API route ${apiPath} should export a ${method} handler`,
          ).toBeDefined();

          expect(
            typeof routeModule[method],
            `${method} handler should be a function`,
          ).toBe("function");
        });
      });
    });
  });
});

describe("API Route Structure Validation", () => {
  it("all route files follow Next.js App Router conventions", async () => {
    // Verify that route files are named correctly
    const routeFiles = Object.values(CLIENT_API_CALLS).map((c) => c.path);

    for (const routeFile of routeFiles) {
      expect(
        routeFile.endsWith("route.ts") || routeFile.endsWith("route.js"),
        `Route file ${routeFile} should be named route.ts or route.js`,
      ).toBe(true);

      expect(
        routeFile.startsWith("app/api/"),
        `Route file ${routeFile} should be in app/api/ directory`,
      ).toBe(true);
    }
  });
});
