import "server-only";
import { NextResponse } from "next/server";

import type { AuthUser } from "@/lib/auth-types";
import { ConsoleError } from "@/lib/db/console-error";

/**
 * Shared HTTP helpers for the admin DB console routes (brain2daax F6, #102).
 *
 * NOTE: authentication (requireAuth) and the super-admin gate (requireSuperAdmin)
 * are intentionally called INLINE in each route handler, not wrapped here, so the
 * auth-drift auditor (scripts/audit-auth-routes.ts, F4) sees a real `requireAuth(`
 * call site inside every handler body.
 */

/** Map a thrown error to a JSON response: ConsoleError → its status, else 500. */
export function consoleErrorResponse(err: unknown): NextResponse {
  if (err instanceof ConsoleError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error("[admin-db-console] error:", err);
  return NextResponse.json({ error: "Internal error" }, { status: 500 });
}

/** Stable actor identifier for an audit row: email, else username, else "unknown". */
export function actorOf(user: AuthUser): string {
  return user.email || user.username || "unknown";
}
