/**
 * POST /api/substrate/sessions/:id/resume (dx#113 / #114)
 *
 * Explicitly resume a suspended (or errored) session. Never automatic.
 */
import { NextRequest } from "next/server";

import { requireAuthIdentity } from "@/lib/auth";
import { resumeSession } from "@/lib/substrate/service";
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
        "substrate.resume",
        "/api/substrate/sessions/:id/resume",
        await resumeSession(ctx.deps, who.caller, id),
        id,
      ),
    );
  } catch (err) {
    return serverError(err);
  }
}
