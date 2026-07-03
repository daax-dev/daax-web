/**
 * Clawd Gateway Token API Route
 *
 * Returns the gateway URL and token from environment variables to the caller.
 * The returned token is a sensitive credential and this endpoint must only be
 * exposed to and called from trusted, authorized contexts.
 *
 * Security Model:
 * - This endpoint is designed for deployment on private networks (e.g., Tailscale)
 * - Application-level authentication is enforced via requireAuth() (#188): an
 *   unauthenticated caller receives 401 and NO credentials are disclosed.
 * - This is fully effective under enforced auth (DAAX_REQUIRE_AUTH=1, behind
 *   the forward-auth proxy): only an authenticated caller reaches the env
 *   read/response below.
 * - On the default host-dev posture (DAAX_REQUIRE_AUTH unset, no proxy
 *   header), requireAuth() falls back to the LOCAL_OPERATOR bypass, so
 *   network-level trust (e.g., Tailscale) is still the operative control.
 *
 * Follow-up (issue #188 AC #2, deferred — requires operator sign-off): replace
 * this endpoint with a server-side proxy or mint short-TTL/scoped per-session
 * tokens instead of returning the long-lived gateway bearer token verbatim.
 * This remains the residual exposure to close.
 *
 * @see task-130 for security validation requirements
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

// Cache-Control headers to prevent credential caching
const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

export async function GET() {
  // Require authentication before reading env or building the token response
  // (#188): an unauthenticated caller must never receive the gateway URL/token.
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  const url = process.env.CLAWD_GATEWAY_URL;
  const token = process.env.CLAWD_GATEWAY_TOKEN;

  if (!url) {
    return NextResponse.json(
      { error: "CLAWD_GATEWAY_URL not configured" },
      { status: 500, headers: NO_CACHE_HEADERS },
    );
  }

  if (!token) {
    return NextResponse.json(
      { error: "CLAWD_GATEWAY_TOKEN not configured" },
      { status: 500, headers: NO_CACHE_HEADERS },
    );
  }

  return NextResponse.json({ url, token }, { headers: NO_CACHE_HEADERS });
}
