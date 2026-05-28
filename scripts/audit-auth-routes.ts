#!/usr/bin/env bun
/**
 * Auth Route Auditor
 *
 * Scans all app/api route.ts files and reports which ones use requireAuth().
 * Run: bun run scripts/audit-auth-routes.ts
 *
 * Catches drift when new API routes are added without auth protection.
 */

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { Glob } from "bun";

const __dirname = dirname(fileURLToPath(import.meta.url));
const API_DIR = join(__dirname, "..", "app", "api");

interface RouteInfo {
  path: string;
  methods: string[];
  hasRequireAuth: boolean;
  protectedMethods: string[];
}

async function scanRoutes(): Promise<RouteInfo[]> {
  const glob = new Glob("**/route.ts");
  const routes: RouteInfo[] = [];

  for await (const file of glob.scan(API_DIR)) {
    const fullPath = `${API_DIR}/${file}`;
    const content = readFileSync(fullPath, "utf-8");

    // Find exported HTTP methods
    const methodPattern =
      /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)/g;
    const methods: string[] = [];
    let match;
    while ((match = methodPattern.exec(content)) !== null) {
      methods.push(match[1]);
    }

    // Check if requireAuth is imported and called (not just mentioned in comments)
    const hasRequireAuthImport = /import\s+.*requireAuth.*from/.test(content);
    const hasRequireAuthCall = /requireAuth\s*\(/.test(content);
    const hasRequireAuth = hasRequireAuthImport && hasRequireAuthCall;

    // Try to determine which specific methods use requireAuth
    // (rough heuristic: look at function bodies)
    const protectedMethods: string[] = [];
    if (hasRequireAuth) {
      for (const method of methods) {
        // Find the function body and check if it calls requireAuth
        const funcPattern = new RegExp(
          `export\\s+(?:async\\s+)?function\\s+${method}\\b[\\s\\S]*?(?=export\\s+(?:async\\s+)?function|$)`,
        );
        const funcMatch = content.match(funcPattern);
        if (funcMatch && funcMatch[0].includes("requireAuth")) {
          protectedMethods.push(method);
        }
      }
    }

    routes.push({
      path: file.replace(/\/route\.ts$/, ""),
      methods,
      hasRequireAuth,
      protectedMethods,
    });
  }

  return routes.sort((a, b) => a.path.localeCompare(b.path));
}

async function main() {
  const routes = await scanRoutes();

  console.log("=== API Route Auth Audit ===\n");

  // Summary stats
  const protectedCount = routes.filter((r) => r.hasRequireAuth).length;
  const unprotectedWithWrites = routes.filter(
    (r) =>
      !r.hasRequireAuth &&
      r.methods.some((m) => ["POST", "PUT", "PATCH", "DELETE"].includes(m)),
  );

  console.log(`Total routes:     ${routes.length}`);
  console.log(`With requireAuth: ${protectedCount}`);
  console.log(`Unprotected:      ${routes.length - protectedCount}`);
  console.log(
    `Unprotected with write methods: ${unprotectedWithWrites.length}`,
  );
  console.log();

  // Protected routes
  console.log("--- Protected Routes ---");
  for (const route of routes.filter((r) => r.hasRequireAuth)) {
    const protMethods = route.protectedMethods.join(", ");
    const allMethods = route.methods.join(", ");
    const unprotected = route.methods.filter(
      (m) => !route.protectedMethods.includes(m),
    );
    const unprotStr =
      unprotected.length > 0 ? ` (public: ${unprotected.join(", ")})` : "";
    console.log(
      `  /api/${route.path}  [${allMethods}]  auth: ${protMethods}${unprotStr}`,
    );
  }
  console.log();

  // Unprotected routes with write methods (potential issues)
  if (unprotectedWithWrites.length > 0) {
    console.log("--- WARNING: Unprotected Write Routes ---");
    for (const route of unprotectedWithWrites) {
      const writeMethods = route.methods.filter((m) =>
        ["POST", "PUT", "PATCH", "DELETE"].includes(m),
      );
      console.log(
        `  /api/${route.path}  [${writeMethods.join(", ")}]  *** NO AUTH ***`,
      );
    }
    console.log();
  }

  // All read-only routes
  console.log("--- Public Read-Only Routes ---");
  const readOnly = routes.filter(
    (r) =>
      !r.hasRequireAuth &&
      r.methods.every((m) => ["GET", "HEAD", "OPTIONS"].includes(m)),
  );
  for (const route of readOnly) {
    console.log(`  /api/${route.path}  [${route.methods.join(", ")}]`);
  }

  // Exit with error if there are unprotected write routes (useful in CI)
  if (unprotectedWithWrites.length > 0) {
    console.log(
      `\n[ERROR] ${unprotectedWithWrites.length} route(s) have write methods without requireAuth.`,
    );
    console.log(
      "Review these routes and add auth protection or add to the allowlist.",
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
