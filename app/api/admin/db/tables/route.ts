/**
 * API Route: GET /api/admin/db/tables
 *
 * Admin DB inspection console (brain2daax F6, #102) — list every inspectable
 * base table. Gated by requireAuth (forward-auth identity) THEN requireSuperAdmin
 * (env allow-list, disjoint from RBAC). Read-only.
 */

import { NextResponse } from "next/server";

import { requireAuth } from "@/lib/auth";
import { requireSuperAdmin } from "@/lib/db/superadmin";
import { listTables, writesEnabled } from "@/lib/db/console";
import { consoleErrorResponse } from "@/lib/db/console-api";

export async function GET() {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;
  const denied = await requireSuperAdmin(auth.user);
  if (denied) return denied;

  try {
    const tables = await listTables();
    return NextResponse.json({ tables, writesEnabled: writesEnabled() });
  } catch (err) {
    return consoleErrorResponse(err);
  }
}
