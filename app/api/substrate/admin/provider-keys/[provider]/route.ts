/**
 * /api/substrate/admin/provider-keys/:provider (dx#123, AI Coding -> Admin)
 *
 *   PUT    { value } — write the provider's key to the gateway Secret
 *   DELETE           — reset it to the `unset` placeholder
 *
 * Admin only (404 otherwise). The value is never logged, echoed or audited;
 * the answer is { id, set }. One server-side-apply field manager per
 * provider (lib/substrate/provider-keys.ts).
 */
import { NextRequest, NextResponse } from "next/server";

import { requireAuthIdentity } from "@/lib/auth";
import {
  adminOnly,
  audited,
  callerFrom,
  gatewayKeys,
  substrateDeps,
} from "@/lib/substrate/route-helpers";
import {
  isProviderId,
  ProviderKeyError,
  validateKey,
} from "@/lib/substrate/provider-keys";
import type { ServiceResult } from "@/lib/substrate/service";

const ROUTE = "/api/substrate/admin/provider-keys/:provider";

type Identity = Extract<
  Awaited<ReturnType<typeof requireAuthIdentity>>,
  { authenticated: true }
>;

async function handle(
  auth: Identity,
  request: NextRequest,
  params: Promise<{ provider: string }>,
  unset: boolean,
) {
  // Admin check first: a non-admin gets 404 whatever the backend state.
  const who = await callerFrom(auth);
  if (!who.ok) return who.response;
  const denied = adminOnly(who.caller);
  if (denied) return denied;
  const ctx = substrateDeps();
  if (!ctx.ok) return ctx.response;
  const gk = gatewayKeys(ctx.deps);
  if (!gk.ok) return gk.response;
  const { provider } = await params;
  if (!isProviderId(provider)) {
    return NextResponse.json(
      { error: "invalid-provider", message: "Unknown provider" },
      { status: 400 },
    );
  }

  let value: string | null = null;
  if (!unset) {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "invalid-json", message: "Body must be JSON" },
        { status: 400 },
      );
    }
    try {
      value = validateKey((body as { value?: unknown } | null)?.value);
    } catch (err) {
      return NextResponse.json(
        {
          error: "invalid-key",
          message:
            err instanceof ProviderKeyError ? err.message : "invalid key",
        },
        { status: 400 },
      );
    }
  }

  let result: ServiceResult<{ id: string; set: boolean }>;
  try {
    await gk.keys.write(provider, value);
    result = { ok: true, status: 200, body: { id: provider, set: !unset } };
  } catch (err) {
    console.error(
      `[substrate] provider key ${unset ? "unset" : "write"} failed for ${provider}:`,
      err instanceof ProviderKeyError ? err.message : "error",
    );
    result = {
      ok: false,
      status: 502,
      error: "gateway-error",
      message:
        err instanceof ProviderKeyError
          ? err.message
          : "Could not write the gateway Secret",
    };
  }
  await audited(who.caller, "substrate.provider-key", ROUTE, result, null, {
    provider,
    action: unset ? "unset" : "set",
  });
  return result.ok
    ? NextResponse.json(result.body)
    : NextResponse.json(
        { error: result.error, message: result.message },
        { status: result.status },
      );
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const auth = await requireAuthIdentity();
  if (!auth.authenticated) return auth.response;
  return handle(auth, request, params, false);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const auth = await requireAuthIdentity();
  if (!auth.authenticated) return auth.response;
  return handle(auth, request, params, true);
}
