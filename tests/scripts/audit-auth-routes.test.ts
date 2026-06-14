import { describe, it, expect } from "vitest";
import {
  isUnprotectedWriteRoute,
  computeAuthDrift,
  type RouteInfo,
} from "@/scripts/auth-audit-lib";

function route(partial: Partial<RouteInfo> & { path: string }): RouteInfo {
  return {
    methods: [],
    hasRequireAuth: false,
    protectedMethods: [],
    ...partial,
  };
}

describe("audit-auth-routes drift logic (F4, #96)", () => {
  describe("isUnprotectedWriteRoute", () => {
    it("flags a write route with no requireAuth", () => {
      expect(
        isUnprotectedWriteRoute(
          route({ path: "x", methods: ["POST"], hasRequireAuth: false }),
        ),
      ).toBe(true);
    });

    it("does not flag a write route whose write method is guarded", () => {
      expect(
        isUnprotectedWriteRoute(
          route({
            path: "x",
            methods: ["POST"],
            hasRequireAuth: true,
            protectedMethods: ["POST"],
          }),
        ),
      ).toBe(false);
    });

    it("does not flag a read-only route without auth", () => {
      expect(
        isUnprotectedWriteRoute(
          route({ path: "x", methods: ["GET"], hasRequireAuth: false }),
        ),
      ).toBe(false);
    });

    it("flags when ANY method is a write (mixed GET+DELETE)", () => {
      expect(
        isUnprotectedWriteRoute(
          route({
            path: "x",
            methods: ["GET", "DELETE"],
            hasRequireAuth: false,
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
            hasRequireAuth: true,
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
            hasRequireAuth: true,
            protectedMethods: ["POST"],
          }),
        ),
      ).toBe(false);
    });
  });

  describe("computeAuthDrift", () => {
    const routes: RouteInfo[] = [
      route({ path: "baselined", methods: ["POST"] }),
      route({ path: "brand-new", methods: ["POST"] }),
      route({
        path: "guarded",
        methods: ["POST"],
        hasRequireAuth: true,
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
