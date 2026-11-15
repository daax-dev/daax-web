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
 * refuses every terminal without it and re-checks the subject at connect.
 *
 * Multi-tenancy (dx#119): minting requires `terminal:exec`. The terminal server
 * has no Postgres, so the caller's resolved permissions, admin flag and
 * server-side security settings are signed into the ticket here and the
 * terminal server enforces them (server/handlers/connection-handler.ts).
 */
import { NextResponse } from "next/server";

import { requirePrincipal } from "@/lib/auth";
import { decideHostShell } from "@/lib/host-shell-access";
import {
  mintTicket,
  getWsTokenSecret,
  type TicketClaims,
} from "@/lib/ws-ticket";
import { getEffectiveSettings } from "@/lib/tenancy/settings-store";

export async function POST() {
  const auth = await requirePrincipal("terminal:exec", {
    route: "POST /api/terminal/ticket",
  });
  if (!auth.authorized) return auth.response;

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

  const { principal } = auth;
  const { subject, operator } = principal;
  const claims: TicketClaims = { perms: [...principal.permissions] };
  if (operator) claims.operator = true;
  if (principal.admin) claims.admin = true;
  // Minted whatever this plane's mode: the terminal server is the one that
  // knows whether it runs in host mode, and it re-checks.
  if (operator || decideHostShell(subject).ok) claims.hostShell = true;

  // Server-side settings exist only for a subject (the operator bypass has no
  // row and keeps today's client-supplied values). A settings-store failure
  // fails closed: a ticket without the user's locks would let them bypass.
  if (subject) {
    try {
      const effective = await getEffectiveSettings(subject);
      claims.settings = effective.settings;
      claims.locked = effective.locked;
    } catch (err) {
      console.error("[terminal/ticket] settings store unavailable:", err);
      return NextResponse.json(
        {
          error: "settings-unavailable",
          message: "Server-side settings could not be resolved.",
        },
        { status: 503 },
      );
    }
  }

  const sub = subject ?? (operator ? "local" : "user");
  const { token, exp } = mintTicket(sub, undefined, claims);
  return NextResponse.json({ token, exp });
}
