/**
 * API Route: /api/admin/db/access
 *
 * Server-resolved super-admin flag for the DB console Data tab (F6 — issue #102).
 * Returns `{ superAdmin }` so the UI can gate the tab on the server's decision
 * rather than a client-side flag. Read-only, non-sensitive (a boolean); mirrors
 * `/api/auth/access` which resolves access internally rather than 401-ing.
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
