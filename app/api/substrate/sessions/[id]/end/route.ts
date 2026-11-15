/**
 * POST /api/substrate/sessions/:id/end (dx#113 / #114)
 *
 * End session: delete the egress policy and the actor. The only operation that kills an agent.
 * 200 `ended`, or 202 `ending` when a create is still in flight (it finishes
 * the End itself; poll GET until 404, or `error` if the delete failed).
 */
import { NextRequest } from "next/server";

import { requireAuthIdentity } from "@/lib/auth";
import { endSession } from "@/lib/substrate/service";
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
  const auth = await requireAuthIdentity();
  if (!auth.authenticated) return auth.response;
  const ctx = substrateDeps();
  if (!ctx.ok) return ctx.response;
  const who = await callerFrom(auth);
  if (!who.ok) return who.response;
  try {
    const id = (await params).id;
    return respond(
      await audited(
        who.caller,
        "substrate.end",
        "/api/substrate/sessions/:id/end",
        await endSession(ctx.deps, who.caller, id),
        id,
      ),
    );
  } catch (err) {
    return serverError(err);
  }
}
