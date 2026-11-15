/**
 * GET /api/substrate/admin/audit?limit=N (dx#123, AI Coding -> Admin)
 *
 * Admin only (404 otherwise). Newest `substrate.*` rows from `auth_audit`.
 */
import { NextRequest, NextResponse } from "next/server";

import { requireAuthIdentity } from "@/lib/auth";
import {
  adminOnly,
  callerFrom,
  readSubstrateAudit,
  serverError,
  substrateDeps,
} from "@/lib/substrate/route-helpers";

export async function GET(request: NextRequest) {
  const auth = await requireAuthIdentity();
  if (!auth.authenticated) return auth.response;
  // Admin check first: a non-admin gets 404 whatever the backend state
  // (no configuration detail leaks to them).
  const who = await callerFrom(auth);
  if (!who.ok) return who.response;
  const denied = adminOnly(who.caller);
  if (denied) return denied;
  const ctx = substrateDeps();
  if (!ctx.ok) return ctx.response;
  try {
    const limit = Number(request.nextUrl.searchParams.get("limit") ?? "200");
    return NextResponse.json({ entries: await readSubstrateAudit(limit) });
  } catch (err) {
    return serverError(err);
  }
}
