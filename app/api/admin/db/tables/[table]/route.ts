/**
 * API Route: /api/admin/db/tables/[table]
 *
 * Admin DB inspection console (brain2daax F6, #102).
 *   GET  → read a page of rows (read-only; default path).
 *   POST → opt-in write (insert/update/delete); disabled unless
 *          DAAX_DB_CONSOLE_WRITES=1, and writes to audited (RBAC) tables force an
 *          auth_audit row in-transaction (D4, fail-closed).
 *
 * The [table] path segment is NEVER interpolated into SQL — it is validated
 * against information_schema and quoted (see lib/db/console.ts), so an injected
 * identifier is rejected (404), never executed. Both methods are gated by
 * requireAuth THEN requireSuperAdmin.
 */

import { NextResponse, type NextRequest } from "next/server";

import { requireAuth } from "@/lib/auth";
import { requireSuperAdmin } from "@/lib/db/superadmin";
import { listRows, executeWrite, type WriteAction } from "@/lib/db/console";
import { consoleErrorResponse, actorOf } from "@/lib/db/console-api";
import { ConsoleError } from "@/lib/db/console-error";

interface RouteContext {
  params: Promise<{ table: string }>;
}

export async function GET(request: NextRequest, ctx: RouteContext) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;
  const denied = requireSuperAdmin(auth.user);
  if (denied) return denied;

  try {
    const { table } = await ctx.params;
    const sp = new URL(request.url).searchParams;
    const page = await listRows(table, {
      limit: sp.get("limit") ?? undefined,
      offset: sp.get("offset") ?? undefined,
    });
    return NextResponse.json(page);
  } catch (err) {
    return consoleErrorResponse(err);
  }
}

const VALID_ACTIONS: WriteAction[] = ["insert", "update", "delete"];

export async function POST(request: NextRequest, ctx: RouteContext) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;
  const denied = requireSuperAdmin(auth.user);
  if (denied) return denied;

  try {
    const { table } = await ctx.params;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ConsoleError("Request body must be valid JSON.", 400);
    }
    const b = (body ?? {}) as {
      action?: unknown;
      values?: unknown;
      where?: unknown;
    };

    if (
      typeof b.action !== "string" ||
      !VALID_ACTIONS.includes(b.action as WriteAction)
    ) {
      throw new ConsoleError(
        `'action' must be one of: ${VALID_ACTIONS.join(", ")}.`,
        400,
      );
    }
    const isRecord = (v: unknown): v is Record<string, unknown> =>
      typeof v === "object" && v !== null && !Array.isArray(v);
    if (b.values !== undefined && !isRecord(b.values)) {
      throw new ConsoleError("'values' must be an object.", 400);
    }
    if (b.where !== undefined && !isRecord(b.where)) {
      throw new ConsoleError("'where' must be an object.", 400);
    }

    const result = await executeWrite(
      {
        table,
        action: b.action as WriteAction,
        values: b.values as Record<string, unknown> | undefined,
        where: b.where as Record<string, unknown> | undefined,
      },
      actorOf(auth.user),
    );
    return NextResponse.json(result);
  } catch (err) {
    return consoleErrorResponse(err);
  }
}
