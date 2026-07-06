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

    it("reports UNGUARDED when the ONLY `await requireRole(` is inside a REGEX literal (unescaped paren)", () => {
      // SECURITY regression (Copilot F5/#102): the `await` prefix alone does not
      // save us — a regex literal whose SOURCE text literally contains
      // `await requireRole(` with a real (unescaped) paren, e.g.
      // `/await requireRole(x)/`, still satisfies AUTH_GUARD_CALL_RE unless
      // stripCommentsAndStrings() NEUTRALIZES regex literals. The POST here has
      // no real guard call, so it must be reported UNGUARDED and flagged.
      const regexLiteralGuardText = `
        import { requireRole } from "@/lib/auth";
        export async function POST(req: Request) {
          const re = /await requireRole(x)/;
          return new Response(String(re.test(await req.text())));
        }
      `;
      const { hasAuthGuard, protectedMethods } = detectRouteAuth(
        regexLiteralGuardText,
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

    it("reports UNGUARDED when the ONLY `await requireRole(` is inside a REGEX literal after a `)` closer", () => {
      // SECURITY regression (Copilot F5/#102): a regex literal in expression
      // position after `)` (prevSig === ")") — e.g. `if (x) /await requireRole(y)/.test(s)`
      // — was NOT neutralized because isRegexStart() only fired after
      // REGEX_PRECEDERS or `return`. AUTH_GUARD_CALL_RE then matched the guard
      // token inside the regex SOURCE and misclassified this unguarded write
      // route as guarded (audit BYPASS). The regex must be stripped → UNGUARDED.
      const regexAfterCloser = `
        import { requireRole } from "@/lib/auth";
        export async function POST(req: Request) {
          const body = await req.text();
          if (body) /await requireRole(y)/.test(body);
          return new Response("ok");
        }
      `;
      const { hasAuthGuard, protectedMethods } = detectRouteAuth(
        regexAfterCloser,
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

    it("reports UNGUARDED when a REGEX literal after `)` is followed by a NON-call property access (`.source`)", () => {
      // SECURITY regression (Copilot #102): looksLikeRegexAfterCloser() only
      // recognized `.test|exec|match(` after a `)`/`]` closer, so a regex whose
      // tail is a plain property access — e.g. `/await requireRole(y)/.source`
      // — was left intact and AUTH_GUARD_CALL_RE matched the guard token inside
      // the regex SOURCE (audit BYPASS). Any `.<prop>` after the literal must be
      // treated as consuming a regex → the guard is stripped → UNGUARDED.
      // The regex sits directly after a `)` closer (from `if (body)`), NOT after
      // a REGEX_PRECEDERS token — so ONLY looksLikeRegexAfterCloser can neutralize
      // it, and only if it accepts the `.source` tail.
      const regexThenSource = `
        import { requireRole } from "@/lib/auth";
        export async function POST(req: Request) {
          const body = await req.text();
          if (body) /await requireRole(y)/.source;
          return new Response("ok");
        }
      `;
      const { hasAuthGuard, protectedMethods } = detectRouteAuth(
        regexThenSource,
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

    it("reports UNGUARDED when the ONLY `await requireRole(` is inside a REGEX literal after a `{` block-body opener", () => {
      // SECURITY regression (Copilot #101): a regex literal in expression
      // position after a `{` block body — e.g.
      // `if (x) { /await requireRole(y)/.test(s) }` — was NOT neutralized
      // because `{` was missing from REGEX_PRECEDERS. AUTH_GUARD_CALL_RE then
      // matched the guard token inside the regex SOURCE and misclassified this
      // unguarded write route as guarded (audit BYPASS). The regex must be
      // stripped → UNGUARDED.
      const regexAfterBlockBody = `
        import { requireRole } from "@/lib/auth";
        export async function POST(req: Request) {
          const body = await req.text();
          if (body) { /await requireRole(y)/.test(body); }
          return new Response("ok");
        }
      `;
      const { hasAuthGuard, protectedMethods } = detectRouteAuth(
        regexAfterBlockBody,
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

    it("reports UNGUARDED when the ONLY `await requireRole(` is inside a REGEX literal right after a `}` block close", () => {
      // SECURITY regression (Copilot #101): a regex literal in expression
      // position at the START of a new statement right after a `}` that closes a
      // BLOCK — e.g. `if (body) { doThing(); } /await requireRole(y)/.test(body)`
      // — was NOT neutralized because `}` was missing from REGEX_PRECEDERS. The
      // `/` was treated as division, the regex source left intact, and
      // AUTH_GUARD_CALL_RE matched the guard token inside it → this unguarded
      // write route was misclassified as guarded (audit BYPASS). Adding `}` to
      // REGEX_PRECEDERS strips the regex → UNGUARDED.
      const regexAfterBlockClose = `
        import { requireRole } from "@/lib/auth";
        export async function POST(req: Request) {
          const body = await req.text();
          if (body) { doThing(); } /await requireRole(y)/.test(body);
          return new Response("ok");
        }
      `;
      const { hasAuthGuard, protectedMethods } = detectRouteAuth(
        regexAfterBlockClose,
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

    it("reports UNGUARDED when the ONLY `await requireRole(` is inside a REGEX literal in a ternary (`?` preceder)", () => {
      // SECURITY regression (Copilot #101): a regex literal in expression
      // position after a ternary `?` — e.g.
      // `cond ? /await requireRole(y)/.test(s) : false` — was NOT neutralized
      // because `?` was missing from REGEX_PRECEDERS, so the guard token inside
      // the regex SOURCE misclassified this unguarded write route as guarded.
      const regexInTernary = `
        import { requireRole } from "@/lib/auth";
        export async function POST(req: Request) {
          const body = await req.text();
          const hit = body ? /await requireRole(y)/.test(body) : false;
          return new Response(String(hit));
        }
      `;
      const { hasAuthGuard, protectedMethods } = detectRouteAuth(
        regexInTernary,
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

    it("reports UNGUARDED when the ONLY `await requireRole(` is inside a REGEX literal after an arrow `=>` (`>` preceder)", () => {
      // SECURITY regression (Copilot #101): a regex literal in expression
      // position after an arrow `=>` — e.g.
      // `const f = () => /await requireRole(y)/.test(s)` — was NOT neutralized
      // because `>` was missing from REGEX_PRECEDERS, so the guard token inside
      // the regex SOURCE misclassified this unguarded write route as guarded.
      const regexAfterArrow = `
        import { requireRole } from "@/lib/auth";
        export async function POST(req: Request) {
          const body = await req.text();
          const hit = () => /await requireRole(y)/.test(body);
          return new Response(String(hit()));
        }
      `;
      const { hasAuthGuard, protectedMethods } = detectRouteAuth(
        regexAfterArrow,
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

    it("does NOT mis-scan a division after `)` as a regex, so a real guard survives", () => {
      // The conservative `)`/`]` heuristic must leave ordinary division intact:
      // `(a + b) / c` has a space after `/` and no regex-shaped tail, so it stays
      // division and the live guard that follows is still detected.
      const divisionAfterCloserThenGuard = `
        import { requireRole } from "@/lib/auth";
        export async function POST() {
          const ratio = (total + 1) / count;
          const a = await requireRole("admin:users:write");
          if (!a.authorized) return a.response;
          return new Response(String(ratio));
        }
      `;
      const { hasAuthGuard, protectedMethods } = detectRouteAuth(
        divisionAfterCloserThenGuard,
        ["POST"],
      );
      expect(hasAuthGuard).toBe(true);
      expect(protectedMethods).toEqual(["POST"]);
    });

    it("still detects a real guard even when a DIVISION precedes it (regex neutralization is conservative)", () => {
      // Guarantee the conservative regex-start detection never mis-scans a
      // division `/` as a regex and swallows the live guard call that follows.
      const divisionThenGuard = `
        import { requireRole } from "@/lib/auth";
        export async function POST() {
          const ratio = total / count;
          const a = await requireRole("admin:users:write");
          if (!a.authorized) return a.response;
          return new Response(String(ratio));
        }
      `;
      const { hasAuthGuard, protectedMethods } = detectRouteAuth(
        divisionThenGuard,
        ["POST"],
      );
      expect(hasAuthGuard).toBe(true);
      expect(protectedMethods).toEqual(["POST"]);
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
