/**
 * PUT /api/substrate/sessions/:id/egress (dx#123 egress editor, #118)
 *
 * Replace a running or suspended session's egress allowlist:
 * { egressPresets?, egressHosts? }. Validated exactly as create is (#527's
 * `resolveEgressHosts` + `checkResolution`); the actor's EgressPolicy rules
 * are replaced with `kubectl ate update egress-policy` (never created).
 */
import { NextRequest } from "next/server";

import { requirePrincipal } from "@/lib/auth";
import { updateEgress } from "@/lib/substrate/service";
import {
  audited,
  callerFrom,
  respond,
  serverError,
  substrateDeps,
} from "@/lib/substrate/route-helpers";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePrincipal("containers:write", {
    route: "PUT /api/substrate/sessions/:id/egress",
  });
  if (!auth.authorized) return auth.response;
  const ctx = substrateDeps();
  if (!ctx.ok) return ctx.response;
  const who = callerFrom(auth.principal);
  if (!who.ok) return who.response;
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
    const id = (await params).id;
    const result = await updateEgress(ctx.deps, who.caller, id, body);
    return respond(
      await audited(
        who.caller,
        "substrate.egress",
        "/api/substrate/sessions/:id/egress",
        result,
        id,
        result.ok
          ? {
              egressPresets: result.body.egressPresets,
              egressHosts: result.body.egressHosts,
            }
          : undefined,
      ),
    );
  } catch (err) {
    return serverError(err);
  }
}
