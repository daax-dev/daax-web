/**
 * POST /api/substrate/egress/validate (dx#123)
 *
 * Inline validation for the launcher and the egress editor:
 * { egressPresets?, egressHosts? } -> { hostErrors, error, hosts }. Runs the
 * same checks as create and the egress update; changes nothing.
 */
import { NextRequest } from "next/server";

import { requirePrincipal } from "@/lib/auth";
import { checkEgress } from "@/lib/substrate/service";
import {
  respond,
  serverError,
  substrateDeps,
} from "@/lib/substrate/route-helpers";

export async function POST(request: NextRequest) {
  const auth = await requirePrincipal();
  if (!auth.authorized) return auth.response;
  const ctx = substrateDeps();
  if (!ctx.ok) return ctx.response;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return respond({
      ok: false,
      status: 400,
      error: "invalid-json",
      message: "Body must be JSON",
    });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return respond({
      ok: false,
      status: 400,
      error: "invalid-body",
      message: "Body must be an object",
    });
  }
  try {
    return respond(await checkEgress(ctx.deps, body));
  } catch (err) {
    return serverError(err);
  }
}
