/**
 * /api/settings/policy/users/[subject] — an admin's per-user overrides
 * (dx#119), e.g. confining one user's mounts with `mountRoot`. Overrides win
 * over both the user's own values and the defaults. admin:settings:write.
 */
import { NextResponse } from "next/server";

import { requirePrincipal } from "@/lib/auth";
import { canonicalizeSubject } from "@/lib/rbac/allowlist";
import {
  SECURITY_SETTING_KEYS,
  sanitizeSecuritySettings,
} from "@/lib/tenancy/settings-policy";
import {
  getEffectiveSettings,
  getUserSettings,
  setUserOverrides,
} from "@/lib/tenancy/settings-store";

interface RouteContext {
  params: Promise<{ subject: string }>;
}

const ROUTE = "/api/settings/policy/users/[subject]";

function unavailable(err: unknown): NextResponse {
  console.error("[settings/policy/users] settings store unavailable:", err);
  return NextResponse.json(
    { error: "Settings store unavailable" },
    { status: 503 },
  );
}

async function subjectParam(ctx: RouteContext): Promise<string | null> {
  const raw = decodeURIComponent((await ctx.params).subject ?? "").trim();
  return raw && raw.length <= 256 ? canonicalizeSubject(raw) : null;
}

export async function GET(_req: Request, ctx: RouteContext) {
  const auth = await requirePrincipal("admin:settings:write", {
    route: `GET ${ROUTE}`,
  });
  if (!auth.authorized) return auth.response;
  const subject = await subjectParam(ctx);
  if (!subject)
    return NextResponse.json({ error: "Invalid subject" }, { status: 400 });
  try {
    const [row, effective] = await Promise.all([
      getUserSettings(subject),
      getEffectiveSettings(subject),
    ]);
    return NextResponse.json({ subject, ...row, effective });
  } catch (err) {
    return unavailable(err);
  }
}

export async function PUT(request: Request, ctx: RouteContext) {
  const auth = await requirePrincipal("admin:settings:write", {
    route: `PUT ${ROUTE}`,
  });
  if (!auth.authorized) return auth.response;
  const subject = await subjectParam(ctx);
  if (!subject)
    return NextResponse.json({ error: "Invalid subject" }, { status: 400 });

  let body: { overrides?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = sanitizeSecuritySettings(
    body?.overrides ?? {},
    SECURITY_SETTING_KEYS,
  );
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  try {
    await setUserOverrides(subject, parsed.value);
    return NextResponse.json({ subject, adminOverrides: parsed.value });
  } catch (err) {
    // FK violation: the subject has never logged in (no users row).
    if ((err as { code?: string })?.code === "23503") {
      return NextResponse.json({ error: "Unknown user" }, { status: 404 });
    }
    return unavailable(err);
  }
}
