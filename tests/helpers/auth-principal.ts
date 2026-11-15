/**
 * Test adapter (dx#119): routes now gate on `requirePrincipal`, while many
 * pre-existing route tests mock only `requireAuth`. This derives a
 * `requirePrincipal` from such a mock so those tests keep exercising their
 * original concern; an authenticated caller is an ADMIN principal (the
 * pre-#119 "everyone sees everything" behaviour). Cross-tenant behaviour has
 * its own suites (tests/api/tenant-isolation-*.test.ts).
 */
import type { Principal } from "@/lib/tenancy/ownership";
import { permissionsForRoles } from "@/lib/rbac/permissions";

export const ADMIN_PRINCIPAL: Principal = {
  subject: null,
  operator: true,
  admin: true,
  permissions: permissionsForRoles(["admin"]),
};

type AuthMock = () => unknown;

export function principalFrom(requireAuth: AuthMock) {
  return async () => {
    const r = (await requireAuth()) as
      | { authenticated: true; user: unknown }
      | { authenticated: false; response: Response }
      | undefined;
    if (!r || !r.authenticated) {
      return {
        authorized: false,
        response:
          r && "response" in r
            ? r.response
            : new Response(null, { status: 401 }),
      };
    }
    return {
      authorized: true,
      user: r.user,
      subject: null,
      principal: ADMIN_PRINCIPAL,
    };
  };
}
