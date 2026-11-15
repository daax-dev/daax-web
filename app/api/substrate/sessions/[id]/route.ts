/**
 * /api/substrate/sessions/:id (dx#113 / #114)
 *
 *   GET    — one session (owner or admin; otherwise 404).
 *   DELETE — End session: deletes the egress policy and the actor. Same as
 *            POST /api/substrate/sessions/:id/end. The only kill. 200 `ended`,
 *            or 202 `ending` while a create is still in flight.
 */
import { NextRequest } from "next/server";

import { requirePrincipal } from "@/lib/auth";
import { endSession, getSession } from "@/lib/substrate/service";
import {
  audited,
  callerFrom,
  respond,
  serverError,
  substrateDeps,
} from "@/lib/substrate/route-helpers";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const auth = await requirePrincipal();
  if (!auth.authorized) return auth.response;
  const ctx = substrateDeps();
  if (!ctx.ok) return ctx.response;
  const who = callerFrom(auth.principal);
  if (!who.ok) return who.response;
  try {
    return respond(await getSession(ctx.deps, who.caller, (await params).id));
  } catch (err) {
    return serverError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const auth = await requirePrincipal("containers:write", {
    route: "DELETE /api/substrate/sessions/:id",
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
        "substrate.end",
        "/api/substrate/sessions/:id",
        await endSession(ctx.deps, who.caller, id),
        id,
      ),
    );
  } catch (err) {
    return serverError(err);
  }
}
