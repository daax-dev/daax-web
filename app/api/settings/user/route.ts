/**
 * /api/settings/user — the caller's server-side security settings (dx#119).
 *
 * GET → effective values + which keys an admin locked.
 * PUT → replace the caller's own values (needs settings:write). Only the
 *       user-editable keys are accepted; a locked key is refused (409), so the
 *       UI can never believe it changed something the terminal will override.
 *
 * The local-operator bypass has no subject and therefore no row: it keeps the
 * browser's localStorage values (`serverSide: false`), as before #119.
 */
import { NextResponse } from "next/server";

import { requirePrincipal } from "@/lib/auth";
import {
  USER_EDITABLE_KEYS,
  sanitizeSecuritySettings,
  type SecuritySettingKey,
} from "@/lib/tenancy/settings-policy";
import {
  getEffectiveSettings,
  getUserSettings,
  setUserSettings,
} from "@/lib/tenancy/settings-store";

function unavailable(err: unknown): NextResponse {
  console.error("[settings/user] settings store unavailable:", err);
  return NextResponse.json(
    { error: "Settings store unavailable" },
    { status: 503 },
  );
}

export async function GET() {
  const auth = await requirePrincipal();
  if (!auth.authorized) return auth.response;
  const { subject } = auth.principal;
  if (!subject) return NextResponse.json({ serverSide: false });
  try {
    const [effective, own] = await Promise.all([
      getEffectiveSettings(subject),
      getUserSettings(subject),
    ]);
    return NextResponse.json({
      serverSide: true,
      settings: effective.settings,
      locked: effective.locked,
      own: own.settings,
    });
  } catch (err) {
    return unavailable(err);
  }
}

export async function PUT(request: Request) {
  const auth = await requirePrincipal("settings:write", {
    route: "PUT /api/settings/user",
  });
  if (!auth.authorized) return auth.response;
  const { subject } = auth.principal;
  if (!subject) {
    return NextResponse.json(
      {
        error: "No server-side settings for the local operator",
        message: "The local operator's settings stay in this browser.",
      },
      { status: 400 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = sanitizeSecuritySettings(
    (body as { settings?: unknown })?.settings ?? body,
    USER_EDITABLE_KEYS,
  );
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const effective = await getEffectiveSettings(subject);
    const lockedHit = (
      Object.keys(parsed.value) as SecuritySettingKey[]
    ).filter((k) => effective.locked.includes(k));
    if (lockedHit.length > 0) {
      return NextResponse.json(
        { error: "Locked by an admin", locked: lockedHit },
        { status: 409 },
      );
    }
    await setUserSettings(subject, parsed.value);
    const next = await getEffectiveSettings(subject);
    return NextResponse.json({
      serverSide: true,
      settings: next.settings,
      locked: next.locked,
      own: parsed.value,
    });
  } catch (err) {
    return unavailable(err);
  }
}
