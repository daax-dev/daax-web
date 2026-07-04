/**
 * Default-deny /api middleware tests (issue #181).
 *
 * Exercises the real `middleware()` with real NextRequest/NextResponse objects
 * (no mocks) so we prove the actual allowlist, host-dev operator bypass,
 * strict-mode deny, proxy-secret trust, CSRF/Origin gate, and the
 * DAAX_API_GUARD escape hatch. Env is reset per test (mirrors
 * tests/lib/auth.test.ts) so DAAX_* state never leaks between cases.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

import { middleware } from "@/middleware";

function req(url: string, init?: RequestInit): NextRequest {
  return new NextRequest(new Request(url, init));
}

/** NextResponse.next() marks pass-through with the x-middleware-next header. */
function isPassThrough(res: { headers: Headers }): boolean {
  return res.headers.get("x-middleware-next") === "1";
}

describe("default-deny /api middleware (#181)", () => {
  beforeEach(() => {
    // All mutated env goes through vi.stubEnv so vi.unstubAllEnvs() restores the
    // runner's originals (Copilot #184) — a bare delete would permanently clear
    // vars the runner may have set, leaking into later tests in this worker.
    vi.stubEnv("DAAX_REQUIRE_AUTH", undefined);
    vi.stubEnv("DAAX_PROXY_SECRET", undefined);
    vi.stubEnv("DAAX_PROXY_SECRET_PREVIOUS", undefined);
    vi.stubEnv("DAAX_API_GUARD", undefined);
    vi.stubEnv("DAAX_TRUST_LOCAL_OPERATOR", undefined);
    // Default host-dev loopback posture (Copilot #184): under vitest
    // NODE_ENV="test", so the operator bypass now requires an explicit safe
    // posture. These non-strict cases model host-dev, which binds loopback.
    vi.stubEnv("HOST", "127.0.0.1");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("public allowlist", () => {
    it("passes GET /api/health through with no auth, even in strict mode", () => {
      process.env.DAAX_REQUIRE_AUTH = "1";
      const res = middleware(req("http://localhost/api/health"));
      expect(isPassThrough(res)).toBe(true);
    });

    it("passes /api/health/backlog through with no auth", () => {
      process.env.DAAX_REQUIRE_AUTH = "1";
      const res = middleware(req("http://localhost/api/health/backlog"));
      expect(isPassThrough(res)).toBe(true);
    });

    it("passes /api/auth/user through with no auth", () => {
      process.env.DAAX_REQUIRE_AUTH = "1";
      const res = middleware(req("http://localhost/api/auth/user"));
      expect(isPassThrough(res)).toBe(true);
    });

    it("does NOT treat a prefix over-match (/api/health-x) as public", () => {
      process.env.DAAX_REQUIRE_AUTH = "1";
      const res = middleware(req("http://localhost/api/health-x"));
      expect(res.status).toBe(401);
    });
  });

  describe("auth default-deny", () => {
    it("host-dev: non-strict + no x-forwarded-user → operator allow", () => {
      const res = middleware(req("http://localhost/api/config"));
      expect(isPassThrough(res)).toBe(true);
    });

    it("strict mode + no identity → 401", () => {
      process.env.DAAX_REQUIRE_AUTH = "1";
      const res = middleware(req("http://localhost/api/config"));
      expect(res.status).toBe(401);
    });

    it("401 body matches requireAuth()'s { error, message } shape", async () => {
      process.env.DAAX_REQUIRE_AUTH = "1";
      const res = middleware(req("http://localhost/api/config"));
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({
        error: "Authentication required",
        message: "You must be logged in to access this resource",
      });
    });

    it("valid proxied identity (matching secret) → allow", () => {
      process.env.DAAX_REQUIRE_AUTH = "1";
      process.env.DAAX_PROXY_SECRET = "s3cr3t";
      const res = middleware(
        req("http://localhost/api/config", {
          headers: {
            "x-forwarded-user": "user-uuid",
            "x-daax-proxy-secret": "s3cr3t",
          },
        }),
      );
      expect(isPassThrough(res)).toBe(true);
    });

    it("forged identity (secret configured, none supplied) → 401", () => {
      process.env.DAAX_REQUIRE_AUTH = "1";
      process.env.DAAX_PROXY_SECRET = "s3cr3t";
      const res = middleware(
        req("http://localhost/api/config", {
          headers: { "x-forwarded-user": "attacker-uuid" },
        }),
      );
      expect(res.status).toBe(401);
    });
  });

  describe("CSRF / Origin gate on mutating methods", () => {
    it("cross-site mutating POST (disallowed Origin) → 403", () => {
      const res = middleware(
        req("http://localhost/api/config", {
          method: "POST",
          headers: { origin: "https://evil.example" },
        }),
      );
      expect(res.status).toBe(403);
    });

    it("403 body uses the same { error, message } shape", async () => {
      const res = middleware(
        req("http://localhost/api/config", {
          method: "POST",
          headers: { origin: "https://evil.example" },
        }),
      );
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body).toHaveProperty("error", "Cross-site request blocked");
      expect(typeof body.message).toBe("string");
    });

    it("same-origin mutating POST (allowed Origin) → allowed (operator)", () => {
      const res = middleware(
        req("http://localhost/api/config", {
          method: "POST",
          headers: { origin: "http://localhost:4200" },
        }),
      );
      expect(isPassThrough(res)).toBe(true);
    });

    it("mutating POST with NO Origin → not blocked by CSRF (falls to auth)", () => {
      // Non-browser client (curl/server) omits Origin; must not 403 on that alone.
      const res = middleware(
        req("http://localhost/api/config", { method: "POST" }),
      );
      expect(isPassThrough(res)).toBe(true);
    });

    it("GET with a bad Origin → NOT blocked by CSRF (only auth applies)", () => {
      const res = middleware(
        req("http://localhost/api/config", {
          headers: { origin: "https://evil.example" },
        }),
      );
      expect(isPassThrough(res)).toBe(true);
    });

    it("cross-site POST is rejected even for an authenticated user", () => {
      process.env.DAAX_REQUIRE_AUTH = "1";
      process.env.DAAX_PROXY_SECRET = "s3cr3t";
      const res = middleware(
        req("http://localhost/api/config", {
          method: "POST",
          headers: {
            origin: "https://evil.example",
            "x-forwarded-user": "user-uuid",
            "x-daax-proxy-secret": "s3cr3t",
          },
        }),
      );
      expect(res.status).toBe(403);
    });
  });

  describe("DAAX_API_GUARD escape hatch", () => {
    it("off → middleware is a no-op (strict deny becomes pass-through)", () => {
      process.env.DAAX_REQUIRE_AUTH = "1";
      process.env.DAAX_API_GUARD = "off";
      const res = middleware(req("http://localhost/api/config"));
      expect(isPassThrough(res)).toBe(true);
    });

    it("report → strict deny is logged but allowed through", () => {
      process.env.DAAX_REQUIRE_AUTH = "1";
      process.env.DAAX_API_GUARD = "report";
      const res = middleware(req("http://localhost/api/config"));
      expect(isPassThrough(res)).toBe(true);
      expect(res.status).not.toBe(401);
    });

    it("report → cross-site POST is logged but allowed through", () => {
      process.env.DAAX_API_GUARD = "report";
      const res = middleware(
        req("http://localhost/api/config", {
          method: "POST",
          headers: { origin: "https://evil.example" },
        }),
      );
      expect(isPassThrough(res)).toBe(true);
      expect(res.status).not.toBe(403);
    });

    it("unrecognized value falls back to enforce (strict deny → 401)", () => {
      process.env.DAAX_REQUIRE_AUTH = "1";
      process.env.DAAX_API_GUARD = "bogus";
      const res = middleware(req("http://localhost/api/config"));
      expect(res.status).toBe(401);
    });
  });
});
