/**
 * API Route: /api/admin/db/tables
 *
 * List the inspectable tables for the admin DB console (F6 — issue #102).
 * Super-admin only (env allow-list), read-only.
 */

import { NextResponse } from "next/server";

import { requireSuperAdmin } from "@/lib/db-console/super-admin";
import { listTables } from "@/lib/db-console/console";

const ROUTE = "/api/admin/db/tables";

export async function GET() {
  const gate = await requireSuperAdmin("admin:db:read", { route: ROUTE });
  if (!gate.authorized) return gate.response;
  try {
    const tables = await listTables();
    return NextResponse.json({ tables });
  } catch (err) {
    console.error(
      "[db-console] listTables failed:",
      err instanceof Error ? err.message : err,
    );
    // Fail closed — never leak a partial/ambiguous success.
    return NextResponse.json(
      { error: "Database unavailable" },
      { status: 503 },
    );
  }
}
