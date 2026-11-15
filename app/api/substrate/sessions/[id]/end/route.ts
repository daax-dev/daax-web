/**
 * POST /api/substrate/sessions/:id/end (dx#113 / #114)
 *
 * End session: delete the egress policy and the actor. The only operation that kills an agent.
 */
import { NextRequest } from "next/server";

import { requireAuthIdentity } from "@/lib/auth";
import { endSession } from "@/lib/substrate/service";
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
    return respond(await endSession(ctx.deps, who.caller, (await params).id));
  } catch (err) {
    return serverError(err);
  }
}
