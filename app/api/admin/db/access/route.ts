/**
 * API Route: /api/admin/db/access
 *
 * AUTHENTICATED-ONLY capability probe for the DB console Data tab (F6 — issue
 * #102). Returns `{ authenticated, superAdmin }` so the UI can gate the tab on
 * the server's decision rather than a client-side flag.
 *
 * This route is intentionally NOT on the middleware public allowlist — it
 * requires authentication. An unauthenticated caller is denied (401) by the
 * default-deny `/api/*` middleware BEFORE this handler runs; the client hook
 * (`use-superadmin-access.ts`) maps that 401 to "no super-admin access". A
 * caller who passes middleware is authenticated, and this handler then reports
 * whether they ADDITIONALLY hold super-admin (env allow-list / host-dev
 * operator). It is never reachable pre-login and never gates on a client-owned
 * flag; the actual DB-console data routes independently enforce
 * `requireSuperAdmin`.
 */

import { NextResponse } from "next/server";

import { resolveSuperAdmin } from "@/lib/db-console/super-admin";

export async function GET() {
  const { authenticated, isSuperAdmin } = await resolveSuperAdmin();
  return NextResponse.json(
    { authenticated, superAdmin: isSuperAdmin },
    { headers: { "cache-control": "no-store" } },
  );
}
