#!/usr/bin/env bun
/**
 * Auth Route Auditor
 *
 * Scans all app/api route.ts files and reports which ones use requireAuth().
 * Run: bun run scripts/audit-auth-routes.ts
 *
 * Catches drift when new API routes are added without auth protection.
 */

import { existsSync, readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

import { computeAuthDrift, type RouteInfo } from "./auth-audit-lib";

const __dirname = dirname(fileURLToPath(import.meta.url));
const API_DIR = join(__dirname, "..", "app", "api");
const ALLOWLIST_PATH = join(__dirname, "auth-audit-allowlist.json");

function loadAllowlist(): string[] {
  if (!existsSync(ALLOWLIST_PATH)) return [];
  // Fail fast and loud on a malformed allowlist: silently treating it as empty
  // would make every baselined route explode into a "new offender" and produce
  // a confusing CI failure. main() catches the throw and exits non-zero.
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(ALLOWLIST_PATH, "utf-8"));
  } catch (err) {
    throw new Error(
      `Failed to parse ${ALLOWLIST_PATH}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const routes = (parsed as { routes?: unknown })?.routes;
  if (!Array.isArray(routes)) {
    throw new Error(`${ALLOWLIST_PATH} must contain a "routes" array.`);
  }
  const normalized = routes.map((r) => {
    if (typeof r !== "string") {
      throw new Error(
        `${ALLOWLIST_PATH}: every entry in "routes" must be a string (got ${typeof r}).`,
      );
    }
    return r.trim();
  });
  return [...new Set(normalized)];
}

export async function scanRoutes(): Promise<RouteInfo[]> {
  // Dynamic import with an opaque specifier so this module's pure helpers
  // (computeAuthDrift, etc.) can be imported by Vitest without Vite trying to
  // resolve the Bun-only `bun` module. Only the CLI path reaches this.
  const bunModule = "bun";
  const { Glob } = await import(/* @vite-ignore */ bunModule);
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

  // Auth-drift gate (F4, #96): fail CI only on NEW unprotected write routes
  // (those not in the accepted baseline allowlist), so the existing backlog
  // doesn't wedge every PR. Stale allowlist entries are reported as a warning.
  const allowlist = loadAllowlist();
  const { offenders, stale } = computeAuthDrift(routes, allowlist);

  const plural = (n: number, one: string, many: string) =>
    `${n} ${n === 1 ? one : many}`;

  console.log(
    `\nAuth-drift gate: ${allowlist.length} allowlisted, ${plural(offenders.length, "new offender", "new offenders")}, ${plural(stale.length, "stale entry", "stale entries")}.`,
  );

  if (stale.length > 0) {
    console.log(
      `\n[WARN] ${plural(stale.length, "allowlist entry is", "allowlist entries are")} no longer unprotected write routes (fixed/removed) — prune from auth-audit-allowlist.json:`,
    );
    for (const p of stale) console.log(`  /api/${p}`);
  }

  if (offenders.length > 0) {
    console.log(
      `\n[ERROR] ${offenders.length} NEW route(s) have write methods without requireAuth and are not in the baseline allowlist:`,
    );
    for (const p of offenders) console.log(`  /api/${p}  *** NO AUTH ***`);
    console.log(
      "\nAdd requireAuth to these routes. Do NOT add new entries to " +
        "scripts/auth-audit-allowlist.json without security review.",
    );
    process.exit(1);
  }
}

// Only run the CLI when executed directly (`bun run scripts/audit-auth-routes.ts`),
// not when imported by tests for the pure helpers above.
if (import.meta.main) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
