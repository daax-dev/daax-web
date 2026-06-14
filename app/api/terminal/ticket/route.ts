/**
 * POST /api/terminal/ticket — mint a single-use WebSocket bearer ticket (F1b, #95).
 *
 * The authenticated app issues a short-TTL HMAC ticket the client presents to
 * the terminal server (a separate process) via `Sec-WebSocket-Protocol`. When
 * `DAAX_WS_TOKEN_SECRET` is unset the route returns 503 so the client falls back
 * to the loopback path (host-dev), rather than failing the terminal entirely.
 */
import { NextResponse } from "next/server";

import { requireAuth } from "@/lib/auth";
import { mintTicket, getWsTokenSecret } from "@/lib/ws-ticket";

export async function POST() {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  if (!getWsTokenSecret()) {
    return NextResponse.json(
      {
        error: "ws-ticketing-disabled",
        message:
          "DAAX_WS_TOKEN_SECRET is not set; terminal WS ticketing is disabled.",
      },
      { status: 503 },
    );
  }

  const sub = auth.user.username || "user";
  const { token, exp } = mintTicket(sub);
  return NextResponse.json({ token, exp });
}
