/**
 * POST /api/substrate/sessions/:id/attach (dx#113 / #114)
 *
 * Authorize a (re)attach and return the terminal WS grant: query params for the terminal URL plus a single-use ticket carrying the substrate claim. 409 unless the session is running (a suspended session is never auto-resumed).
 */
import { NextRequest } from "next/server";

import { requireAuthIdentity } from "@/lib/auth";
import { attachSession } from "@/lib/substrate/service";
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
        "substrate.attach",
        "/api/substrate/sessions/:id/attach",
        await attachSession(ctx.deps, who.caller, id),
        id,
      ),
    );
  } catch (err) {
    return serverError(err);
  }
}
