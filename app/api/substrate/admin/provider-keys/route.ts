/**
 * GET /api/substrate/admin/provider-keys (dx#123, AI Coding -> Admin)
 *
 * Admin only (404 otherwise). set/unset per LLM-gateway provider; never a
 * value, prefix or suffix.
 */
import { NextResponse } from "next/server";

import { requireAuthIdentity } from "@/lib/auth";
import {
  adminOnly,
  callerFrom,
  gatewayKeys,
  substrateDeps,
} from "@/lib/substrate/route-helpers";
import { ProviderKeyError } from "@/lib/substrate/provider-keys";

export async function GET() {
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
  const gk = gatewayKeys(ctx.deps);
  if (!gk.ok) return gk.response;
  try {
    const providers = await gk.keys.status();
    return NextResponse.json({
      namespace: ctx.deps.config.gateway?.namespace,
      secret: ctx.deps.config.gateway?.secret,
      providers,
    });
  } catch (err) {
    console.error(
      "[substrate] provider key status failed:",
      err instanceof ProviderKeyError ? err.message : "error",
    );
    return NextResponse.json(
      { error: "gateway-error", message: "Could not read the gateway Secret" },
      { status: 502 },
    );
  }
}
