/**
 * POST /api/substrate/sessions/:id/suspend (dx#113 / #114)
 *
 * Explicitly suspend a running session (memory snapshot). Never automatic.
 */
import { NextRequest } from "next/server";

import { requirePrincipal } from "@/lib/auth";
import { suspendSession } from "@/lib/substrate/service";
import {
  audited,
  callerFrom,
  respond,
  serverError,
  substrateDeps,
} from "@/lib/substrate/route-helpers";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePrincipal("containers:write", {
    route: "POST /api/substrate/sessions/:id/suspend",
  });
  if (!auth.authorized) return auth.response;
  const ctx = substrateDeps();
  if (!ctx.ok) return ctx.response;
  const who = callerFrom(auth.principal);
  if (!who.ok) return who.response;
  try {
    const id = (await params).id;
    return respond(
      await audited(
        who.caller,
        "substrate.suspend",
        "/api/substrate/sessions/:id/suspend",
        await suspendSession(ctx.deps, who.caller, id),
        id,
      ),
    );
  } catch (err) {
    return serverError(err);
  }
}
