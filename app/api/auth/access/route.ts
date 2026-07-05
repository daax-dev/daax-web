import { NextResponse } from "next/server";
import { resolveAccess } from "@/lib/auth";

/**
 * Server-resolved access summary for privileged-UI gating (F5 — issue #101).
 *
 * Replaces the build-time client boolean `NEXT_PUBLIC_ADMIN_MODE`: the settings
 * admin tab and the provenance admin surface read `isAdmin` from HERE, so UI
 * visibility and API authorization can never diverge (docs §3 F5). Returns only
 * a boolean + the permission list derived from already-trusted forwarded
 * headers / the local-operator bypass — no secrets. Reachable pre-login (on the
 * middleware public allowlist) so the app shell can render; an unauthenticated
 * caller simply gets `{ authenticated: false, isAdmin: false }`.
 */
export async function GET() {
  const access = await resolveAccess();
  return NextResponse.json(access, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
      Pragma: "no-cache",
    },
  });
}
