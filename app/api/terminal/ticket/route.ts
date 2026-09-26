/**
 * POST /api/terminal/ticket — mint a single-use WebSocket bearer ticket (F1b, #95).
 *
 * The authenticated app issues a short-TTL HMAC ticket the client presents to
 * the terminal server (a separate process) via `Sec-WebSocket-Protocol`. When
 * `DAAX_WS_TOKEN_SECRET` is unset the route returns 503 so the client falls back
 * to the loopback path (host-dev), rather than failing the terminal entirely.
 *
 * The ticket's subject is the trusted forwarded subject (the RBAC identity key),
 * not the display name. It carries the `hostShell` claim only for an admin
 * (`decideHostShell`) or the local operator; a host-mode terminal server
 * refuses a host shell without it and re-checks the identity at connect.
 */
import { NextResponse } from "next/server";

import { requireAuthIdentity } from "@/lib/auth";
import { decideHostShell } from "@/lib/host-shell-access";
import {
  mintTicket,
  getWsTokenSecret,
  type TicketClaims,
} from "@/lib/ws-ticket";

export async function POST() {
  const auth = await requireAuthIdentity();
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

  const { identity, operator } = auth;
  const claims: TicketClaims = {};
  if (identity.username) claims.username = identity.username;
  if (identity.email) claims.email = identity.email;
  if (operator) claims.operator = true;
  // Minted whatever this plane's mode: the terminal server is the one that
  // knows whether a shell would land on the host, and it re-checks.
  if (operator || decideHostShell(identity).ok) claims.hostShell = true;
  const sub = identity.subject ?? (operator ? "local" : "user");
  const { token, exp } = mintTicket(sub, undefined, claims);
  return NextResponse.json({ token, exp });
}
