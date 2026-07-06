import { describe, it, expect } from "vitest";
import {
  isUnprotectedWriteRoute,
  computeAuthDrift,
  detectRouteAuth,
  type RouteInfo,
} from "@/scripts/auth-audit-lib";

function route(partial: Partial<RouteInfo> & { path: string }): RouteInfo {
  return {
    methods: [],
    hasAuthGuard: false,
    protectedMethods: [],
    ...partial,
  };
}

describe("audit-auth-routes drift logic (F4, #96)", () => {
  describe("isUnprotectedWriteRoute", () => {
    it("flags a write route with no requireAuth", () => {
      expect(
        isUnprotectedWriteRoute(
          route({ path: "x", methods: ["POST"], hasAuthGuard: false }),
        ),
      ).toBe(true);
    });

    it("does not flag a write route whose write method is guarded", () => {
      expect(
        isUnprotectedWriteRoute(
          route({
            path: "x",
            methods: ["POST"],
            hasAuthGuard: true,
            protectedMethods: ["POST"],
          }),
        ),
      ).toBe(false);
    });

    it("does not flag a read-only route without auth", () => {
      expect(
        isUnprotectedWriteRoute(
          route({ path: "x", methods: ["GET"], hasAuthGuard: false }),
        ),
      ).toBe(false);
    });

    it("flags when ANY method is a write (mixed GET+DELETE)", () => {
      expect(
        isUnprotectedWriteRoute(
          route({
            path: "x",
            methods: ["GET", "DELETE"],
            hasAuthGuard: false,
          }),
        ),
      ).toBe(true);
    });

    it("flags a PARTIALLY-guarded route (GET guarded, POST open)", () => {
      // The key per-method case: file has requireAuth, but a write method is
      // not covered. A file-level check would wrongly pass this.
      expect(
        isUnprotectedWriteRoute(
          route({
            path: "x",
            methods: ["GET", "POST"],
            hasAuthGuard: true,
            protectedMethods: ["GET"],
          }),
        ),
      ).toBe(true);
    });

    it("does not flag when every write method is guarded", () => {
      expect(
        isUnprotectedWriteRoute(
          route({
            path: "x",
            methods: ["GET", "POST"],
            hasAuthGuard: true,
            protectedMethods: ["POST"],
          }),
        ),
      ).toBe(false);
    });
  });

  describe("detectRouteAuth (requireAuth OR requireRole, F5 #101)", () => {
    const requireAuthRoute = `
      import { requireAuth } from "@/lib/auth";
      export async function POST() {
        const auth = await requireAuth();
        if (!auth.authenticated) return auth.response;
        return new Response();
      }
    `;
    const requireRoleRoute = `
      import { requireRole } from "@/lib/auth";
      export async function POST() {
        const auth = await requireRole("admin:users:write");
        if (!auth.authorized) return auth.response;
        return new Response();
      }
    `;

    it("treats a requireAuth-guarded write method as guarded", () => {
      const { hasAuthGuard, protectedMethods } = detectRouteAuth(
        requireAuthRoute,
        ["POST"],
      );
      expect(hasAuthGuard).toBe(true);
      expect(protectedMethods).toEqual(["POST"]);
    });

    it("treats a requireRole-guarded write method as guarded (stronger than requireAuth)", () => {
      const { hasAuthGuard, protectedMethods } = detectRouteAuth(
        requireRoleRoute,
        ["POST"],
      );
      expect(hasAuthGuard).toBe(true);
      expect(protectedMethods).toEqual(["POST"]);
    });

    it("treats a requireSuperAdmin-guarded write method as guarded (F6 #102)", () => {
      const requireSuperAdminRoute = `
        import { requireSuperAdmin } from "@/lib/db-console/super-admin";
        export async function POST() {
          const gate = await requireSuperAdmin("admin:db:write");
          if (!gate.authorized) return gate.response;
          return new Response();
        }
      `;
      const { hasAuthGuard, protectedMethods } = detectRouteAuth(
        requireSuperAdminRoute,
        ["POST"],
      );
      expect(hasAuthGuard).toBe(true);
      expect(protectedMethods).toEqual(["POST"]);
    });

    it("recognises a mix of GET(requireRole) + POST(requireRole) per method", () => {
      const mixed = `
        import { requireRole } from "@/lib/auth";
        export async function GET() {
          const a = await requireRole("admin:db:read");
          if (!a.authorized) return a.response;
        }
        export async function POST() {
          const a = await requireRole("admin:users:write");
          if (!a.authorized) return a.response;
        }
      `;
      const { hasAuthGuard, protectedMethods } = detectRouteAuth(mixed, [
        "GET",
        "POST",
      ]);
      expect(hasAuthGuard).toBe(true);
      expect(protectedMethods.sort()).toEqual(["GET", "POST"]);
    });

    it("does NOT count a mere comment mention of requireRole", () => {
      const commentOnly = `
        // TODO: gate this with requireRole() later
        export async function POST() { return new Response(); }
      `;
      const { hasAuthGuard, protectedMethods } = detectRouteAuth(commentOnly, [
        "POST",
      ]);
      expect(hasAuthGuard).toBe(false);
      expect(protectedMethods).toEqual([]);
    });

    it("reports a route as UNGUARDED when requireAuth is imported but only invoked in a comment", () => {
      // The dangerous case: the guard IS imported (so a naive file-level check
      // passes) but the only call site is a commented-out placeholder. The
      // write route is actually open and must be flagged.
      const commentedCall = `
        import { requireAuth } from "@/lib/auth";
        export async function POST() {
          // await requireAuth() -- planned, not yet wired
          return new Response();
        }
      `;
      const { hasAuthGuard, protectedMethods } = detectRouteAuth(
        commentedCall,
        ["POST"],
      );
      expect(hasAuthGuard).toBe(false);
      expect(protectedMethods).toEqual([]);
      expect(
        isUnprotectedWriteRoute({
          path: "x",
          methods: ["POST"],
          hasAuthGuard,
          protectedMethods,
        }),
      ).toBe(true);
    });

    it("reports a route as UNGUARDED when requireRole appears only inside a REGEX literal", () => {
      // SECURITY regression: stripCommentsAndStrings() does not strip regex
      // literals, so a bare `requireRole(` token inside a regex literal (here the
      // regex source text literally contains "requireRole(") must NOT be counted
      // as a guard call. Without the `await` prefix in AUTH_GUARD_CALL_RE this
      // route is misclassified as GUARDED and its open POST slips past the gate.
      const regexLiteralOnly = `
        import { requireRole } from "@/lib/auth";
        export async function POST(req: Request) {
          const body = await req.text();
          const mentionsGuard = /call requireRole(x)/.test(body);
          return new Response(String(mentionsGuard));
        }
      `;
      const { hasAuthGuard, protectedMethods } = detectRouteAuth(
        regexLiteralOnly,
        ["POST"],
      );
      expect(hasAuthGuard).toBe(false);
      expect(protectedMethods).toEqual([]);
      // And the drift logic flags the actually-open POST write route.
      expect(
        isUnprotectedWriteRoute({
          path: "x",
          methods: ["POST"],
          hasAuthGuard,
          protectedMethods,
        }),
      ).toBe(true);
    });

    it("does NOT count a guard name that appears only inside a string literal", () => {
      const stringOnly = `
        import { requireRole } from "@/lib/auth";
        export async function POST() {
          const hint = "remember to call requireRole() on this route";
          return new Response(hint);
        }
      `;
      const { hasAuthGuard, protectedMethods } = detectRouteAuth(stringOnly, [
        "POST",
      ]);
      expect(hasAuthGuard).toBe(false);
      expect(protectedMethods).toEqual([]);
    });

    it("still detects a real block-comment-adjacent guard call", () => {
      // Guarantee the comment stripper does not swallow the live call that
      // follows a block comment on the same construct.
      const realCall = `
        import { requireRole } from "@/lib/auth";
        export async function POST() {
          /* enforce write permission */ const a = await requireRole("admin:users:write");
          if (!a.authorized) return a.response;
          return new Response();
        }
      `;
      const { hasAuthGuard, protectedMethods } = detectRouteAuth(realCall, [
        "POST",
      ]);
      expect(hasAuthGuard).toBe(true);
      expect(protectedMethods).toEqual(["POST"]);
    });

    it("detects a MULTILINE import of requireAuth as a real guard (not a false unguarded)", () => {
      // Regression: AUTH_GUARD_IMPORT_RE used `.` which does not match newlines,
      // so a multiline import block was misdetected as having no guard import,
      // producing a false-positive "unguarded route" in the audit gate.
      const multilineImport = `
        import {
          requireAuth,
        } from "@/lib/auth";
        export async function POST() {
          const auth = await requireAuth();
          if (!auth.authenticated) return auth.response;
          return new Response();
        }
      `;
      const { hasAuthGuard, protectedMethods } = detectRouteAuth(
        multilineImport,
        ["POST"],
      );
      expect(hasAuthGuard).toBe(true);
      expect(protectedMethods).toEqual(["POST"]);
      expect(
        isUnprotectedWriteRoute({
          path: "x",
          methods: ["POST"],
          hasAuthGuard,
          protectedMethods,
        }),
      ).toBe(false);
    });

    it("flags a partially-guarded route (GET requireRole, POST open)", () => {
      const partial = `
        import { requireRole } from "@/lib/auth";
        export async function GET() {
          const a = await requireRole("admin:db:read");
          if (!a.authorized) return a.response;
        }
        export async function POST() { return new Response(); }
      `;
      const { hasAuthGuard, protectedMethods } = detectRouteAuth(partial, [
        "GET",
        "POST",
      ]);
      expect(hasAuthGuard).toBe(true);
      expect(protectedMethods).toEqual(["GET"]);
      // And the drift logic still flags the open POST.
      expect(
        isUnprotectedWriteRoute({
          path: "x",
          methods: ["GET", "POST"],
          hasAuthGuard,
          protectedMethods,
        }),
      ).toBe(true);
    });
  });

  describe("computeAuthDrift", () => {
    const routes: RouteInfo[] = [
      route({ path: "baselined", methods: ["POST"] }),
      route({ path: "brand-new", methods: ["POST"] }),
      route({
        path: "guarded",
        methods: ["POST"],
        hasAuthGuard: true,
        protectedMethods: ["POST"],
      }),
      route({ path: "readonly", methods: ["GET"] }),
    ];

    it("reports a NEW unprotected write route (not allowlisted) as an offender", () => {
      const { offenders } = computeAuthDrift(routes, ["baselined"]);
      expect(offenders).toEqual(["brand-new"]);
    });

    it("does not flag an allowlisted unprotected write route", () => {
      const { offenders } = computeAuthDrift(routes, [
        "baselined",
        "brand-new",
      ]);
      expect(offenders).toEqual([]);
    });

    it("reports stale allowlist entries (now fixed/removed) as warnings, not offenders", () => {
      const { offenders, stale } = computeAuthDrift(routes, [
        "baselined",
        "brand-new",
        "deleted-route",
        "guarded",
      ]);
      expect(offenders).toEqual([]);
      // 'guarded' is now protected and 'deleted-route' no longer exists.
      expect(stale.sort()).toEqual(["deleted-route", "guarded"]);
    });

    it("with an empty allowlist, every unprotected write is an offender", () => {
      const { offenders, unprotectedWrites } = computeAuthDrift(routes, []);
      expect(unprotectedWrites.sort()).toEqual(["baselined", "brand-new"]);
      expect(offenders.sort()).toEqual(["baselined", "brand-new"]);
    });
  });
});
