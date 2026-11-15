/**
 * POST /api/substrate/sessions/:id/suspend (dx#113 / #114)
 *
 * Explicitly suspend a running session (memory snapshot). Never automatic.
 */
import { NextRequest } from "next/server";

import { requireAuthIdentity } from "@/lib/auth";
import { suspendSession } from "@/lib/substrate/service";
import {
  callerFrom,
  respond,
  serverError,
  substrateDeps,
} from "@/lib/substrate/route-helpers";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuthIdentity();
  if (!auth.authenticated) return auth.response;
  const ctx = substrateDeps();
  if (!ctx.ok) return ctx.response;
  const who = await callerFrom(auth);
  if (!who.ok) return who.response;
  try {
    return respond(
      await suspendSession(ctx.deps, who.caller, (await params).id),
    );
  } catch (err) {
    return serverError(err);
  }
}
