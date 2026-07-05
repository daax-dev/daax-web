/**
 * API Route: /api/admin/db/tables/[table]
 *
 * Inspect a single table (GET, paginated rows) and — when the opt-in write flag
 * is enabled (D4) — perform an audited raw write (POST). Super-admin only.
 *
 * The `[table]` segment is USER INPUT: it is validated against the live
 * `information_schema` catalog (rejected if unknown) before any SQL runs, and is
 * never interpolated unquoted. Values are always bound as `$N::type` parameters.
 */

import { NextRequest, NextResponse } from "next/server";

import {
  requireSuperAdmin,
  dbConsoleWritesEnabled,
  DB_CONSOLE_WRITES_ENV,
} from "@/lib/db-console/super-admin";
import { inspectTable, executeWrite } from "@/lib/db-console/console";
import { InvalidIdentifierError } from "@/lib/db-console/identifiers";
import {
  WriteValidationError,
  type WriteRequest,
} from "@/lib/db-console/query-builder";

const ROUTE = "/api/admin/db/tables/[table]";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ table: string }> },
) {
  const gate = await requireSuperAdmin("admin:db:read", { route: ROUTE });
  if (!gate.authorized) return gate.response;

  const { table } = await ctx.params;
  const sp = req.nextUrl.searchParams;
  try {
    const result = await inspectTable(table, {
      limit: sp.get("limit"),
      offset: sp.get("offset"),
      orderBy: sp.get("orderBy"),
      direction: sp.get("dir"),
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof InvalidIdentifierError) {
      // Unknown/invalid table or column — a client error, never executed.
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error(
      "[db-console] inspectTable failed:",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json(
      { error: "Database unavailable" },
      { status: 503 },
    );
  }
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ table: string }> },
) {
  const gate = await requireSuperAdmin("admin:db:write", { route: ROUTE });
  if (!gate.authorized) return gate.response;

  // Writes are opt-in and off by default (D4).
  if (!dbConsoleWritesEnabled()) {
    return NextResponse.json(
      {
        error: "DB console writes are disabled",
        message: `Set ${DB_CONSOLE_WRITES_ENV}=1 to enable audited writes.`,
      },
      { status: 403 },
    );
  }

  const { table } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "invalid JSON request body" },
      { status: 400 },
    );
  }

  const fwd = req.headers.get("x-forwarded-for");
  const ip =
    (fwd?.split(",")[0]?.trim() || req.headers.get("x-real-ip")) ?? null;
  const ua = req.headers.get("user-agent");

  try {
    const result = await executeWrite(table, body as WriteRequest, {
      subject: gate.subject,
      route: ROUTE,
      ip,
      ua,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (
      err instanceof InvalidIdentifierError ||
      err instanceof WriteValidationError
    ) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    // A constraint/type-cast failure is the trusted super-admin's bad data; the
    // audit row was rolled back with the mutation, so nothing was written.
    console.error(
      "[db-console] write failed:",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json(
      {
        error: "Write failed",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 400 },
    );
  }
}
