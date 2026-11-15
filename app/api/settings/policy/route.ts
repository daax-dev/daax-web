/**
 * /api/settings/policy — admin defaults and locks for the security settings
 * (dx#119). Both methods need admin:settings:write.
 *
 * PUT body: { defaults: { containerImage?, basePath?, claudeSkipPermissions?,
 *             mountRoot? }, locks: ["containerImage", ...] }
 */
import { NextResponse } from "next/server";

import { requirePrincipal } from "@/lib/auth";
import {
  SECURITY_SETTING_KEYS,
  sanitizeLocks,
  sanitizeSecuritySettings,
} from "@/lib/tenancy/settings-policy";
import { getPolicy, setPolicy } from "@/lib/tenancy/settings-store";

const ROUTE = "/api/settings/policy";

function unavailable(err: unknown): NextResponse {
  console.error("[settings/policy] settings store unavailable:", err);
  return NextResponse.json(
    { error: "Settings store unavailable" },
    { status: 503 },
  );
}

export async function GET() {
  const auth = await requirePrincipal("admin:settings:write", {
    route: `GET ${ROUTE}`,
  });
  if (!auth.authorized) return auth.response;
  try {
    return NextResponse.json(await getPolicy());
  } catch (err) {
    return unavailable(err);
  }
}

export async function PUT(request: Request) {
  const auth = await requirePrincipal("admin:settings:write", {
    route: `PUT ${ROUTE}`,
  });
  if (!auth.authorized) return auth.response;

  let body: { defaults?: unknown; locks?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const defaults = sanitizeSecuritySettings(
    body?.defaults ?? {},
    SECURITY_SETTING_KEYS,
  );
  if (!defaults.ok) {
    return NextResponse.json({ error: defaults.error }, { status: 400 });
  }
  const locks = sanitizeLocks(body?.locks ?? []);
  if (!locks.ok) {
    return NextResponse.json({ error: locks.error }, { status: 400 });
  }
  try {
    const policy = { defaults: defaults.value, locks: locks.value };
    await setPolicy(policy, auth.principal.subject);
    return NextResponse.json(policy);
  } catch (err) {
    return unavailable(err);
  }
}
