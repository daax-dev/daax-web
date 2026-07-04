/**
 * Default-deny authorization gate for /api/* (issue #181).
 *
 * daax-web previously enforced auth per-route: each handler had to call
 * `requireAuth()` itself, so any route that forgot to call it shipped
 * UNauthenticated (89/133 routes never called it — see fable-revew.md §1/§3,
 * incl. three RCE sinks). This middleware inverts the default: every /api
 * request must pass the SAME trust evaluator that backs `requireAuth()`
 * (lib/auth-trust) unless it is on a short, explicit public allowlist. It also
 * closes the host-dev drive-by CSRF vector by rejecting cross-site mutating
 * requests before any handler runs.
 *
 * Trust logic is NOT duplicated here: `evaluateAuthDecision` is the single
 * source of truth shared with lib/auth.ts, so middleware and per-route guards
 * can never diverge.
 *
 * Scope: only /api/:path* (see `config.matcher`). Pages, static assets, and
 * _next are intentionally NOT gated — the app shell must load so forward-auth /
 * the operator UI work; individual API calls are where authorization matters.
 *
 * Runtime: nodejs — required because the shared evaluator uses node:crypto
 * (`timingSafeEqual`) for the constant-time proxy-secret comparison, which is
 * unavailable in the edge runtime.
 */
import { NextResponse, type NextRequest } from "next/server";

import { evaluateAuthDecision } from "@/lib/auth-trust";
import { isAllowedOrigin } from "@/server/config/origin-allowlist";

export const config = { matcher: ["/api/:path*"] };
export const runtime = "nodejs";

/**
 * Explicit, reviewed public allowlist. These routes are intentionally reachable
 * with no authentication:
 *   - /api/health, /api/health/backlog → container/Compose + cloud readiness
 *     probes must reach them without credentials.
 *   - /api/auth/user → the app shell reads it pre-login to render identity /
 *     the "not logged in" state; it returns only the (possibly unauthenticated)
 *     AuthUser derived from already-trusted forwarded headers, no secrets.
 *
 * Matched EXACTLY (a Set, not a prefix test) so `/api/health-x` or
 * `/api/auth/user/secrets` can never widen the allowlist by accident.
 */
const PUBLIC_API_ROUTES = new Set<string>([
  "/api/health",
  "/api/health/backlog",
  "/api/auth/user",
]);

// State-changing methods get an Origin/CSRF check; safe methods do not.
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

type GuardMode = "enforce" | "report" | "off";

/**
 * Rollout / rollback escape hatch (read at request time):
 *   - enforce (default) → block denied/cross-site requests.
 *   - report            → log what WOULD be blocked, but allow through.
 *   - off               → middleware is a no-op.
 * Any unrecognized value falls back to the safe default (enforce).
 */
function guardMode(): GuardMode {
  const v = process.env.DAAX_API_GUARD;
  if (v === "off") return "off";
  if (v === "report") return "report";
  return "enforce";
}

/**
 * Build an error response whose JSON body MATCHES the `{ error, message }` shape
 * that `requireAuth()` (lib/auth.ts) returns, so a request denied here is
 * indistinguishable from one denied by a per-route guard. The 401 body below is
 * byte-identical to `requireAuth()`'s 401 payload.
 */
function jsonError(
  error: string,
  message: string,
  status: number,
): NextResponse {
  return NextResponse.json({ error, message }, { status });
}

export function middleware(request: NextRequest): NextResponse {
  const mode = guardMode();
  if (mode === "off") return NextResponse.next();

  const { pathname } = request.nextUrl;

  // 1. Public allowlist → skip all checks.
  if (PUBLIC_API_ROUTES.has(pathname)) return NextResponse.next();

  // 2. CSRF / Origin check on mutating methods only.
  //    Block ONLY when an Origin header is present AND disallowed — a same-site
  //    app fetch sends an allowed Origin (localhost / tailnet / daax.*.poley.dev),
  //    a cross-site drive-by page sends its own (disallowed) Origin, and a
  //    non-browser client (curl, server-to-server) omits Origin entirely and is
  //    left to the auth check below rather than blocked on Origin alone.
  if (MUTATING_METHODS.has(request.method)) {
    const origin = request.headers.get("origin");
    if (origin && !isAllowedOrigin(origin)) {
      if (mode === "enforce") {
        return jsonError(
          "Cross-site request blocked",
          "This request was blocked because its Origin is not on the trusted allowlist",
          403,
        );
      }
      console.warn(
        `[api-guard][report] would 403 (cross-site Origin) ${request.method} ${pathname} origin=${origin}`,
      );
    }
  }

  // 3. Default-deny auth via the SAME evaluator as requireAuth().
  const decision = evaluateAuthDecision(request.headers);
  if (decision.decision === "deny") {
    if (mode === "enforce") {
      return jsonError(
        "Authentication required",
        "You must be logged in to access this resource",
        401,
      );
    }
    console.warn(
      `[api-guard][report] would 401 (unauthenticated) ${request.method} ${pathname}`,
    );
  }

  return NextResponse.next();
}
