/**
 * WebSocket upgrade-handshake authentication (F1b, issue #95).
 *
 * Authenticates the terminal WS *upgrade* before any PTY/container spawn. Two
 * credential paths, selected by the (unspoofable) TCP peer + headers:
 *
 *  - Traefik path: `X-Forwarded-User` injected by Traefik. Trusted ONLY when the
 *    TCP peer is loopback (Traefik → 127.0.0.1:4201), so a direct non-loopback
 *    client cannot forge the header (task-007 parity with the HTTP plane).
 *  - Tailnet-direct / `docker:run` path: a single-use HMAC bearer ticket minted
 *    by the authed app, presented via the `Sec-WebSocket-Protocol` subprotocol.
 *
 * Fallback: in non-strict mode a loopback peer with no credentials is the
 * trusted LOCAL_OPERATOR (host-dev). Strict mode (`DAAX_REQUIRE_AUTH=1`) refuses
 * uncredentialed upgrades; with `DAAX_WS_TOKEN_SECRET` unset it additionally
 * logs a ship-blocking warning (mirrors the HTTP plane's fail-closed posture).
 *
 * Authentication is not authorization. Each accepted decision also carries
 * `hostShell`: whether this caller may open a host-privileged terminal, which
 * the connection handler enforces for every terminal when daax runs in host mode
 * (`lib/host-shell-access.ts`). The loopback bypass is the local operator and
 * may; a forwarded identity may if its subject is in `DAAX_ADMIN_USERS`; a
 * ticket may only if it was minted with the `hostShell` claim AND its subject
 * still passes that check here. A ticket minted for the local operator is
 * honoured only where this server would itself grant the bypass (non-strict).
 *
 * Multi-tenancy (dx#119): each accepted decision also carries a `principal`
 * (subject, admin, permissions) and, for a ticket, the server-resolved
 * settings `policy`. This plane has no Postgres, so a ticket's signed claims are
 * the source of truth. A bare forwarded identity (no ticket) has no
 * permissions when ticketing is configured; without ticketing it is an admin
 * only when it is a `DAAX_ADMIN_USERS` subject. When Traefik
 * forwards an identity AND a ticket is offered, the ticket is verified and must
 * name the same subject.
 *
 * The bypass is refused when the upgrade carries `X-Forwarded-For`: it came
 * through a proxy, and a proxied upgrade with no identity is one whose auth
 * header went missing, not the operator at the machine.
 */
import type { IncomingMessage } from "http";

import { isLoopbackAddress } from "../../lib/net/loopback";
import { verifyTicket, getWsTokenSecret } from "../../lib/ws-ticket";
import { WS_TICKET_SUBPROTOCOL } from "../../lib/ws-ticket-protocol";
import { isAllowedOrigin } from "../config/constants";
import {
  decideHostShell,
  type HostShellDecision,
} from "../../lib/host-shell-access";
import { canonicalizeSubject } from "../../lib/rbac/allowlist";
import { permissionsForRoles } from "../../lib/rbac/permissions";
import type { Principal } from "../../lib/tenancy/ownership";
import type {
  SecuritySettingKey,
  SecuritySettings,
} from "../../lib/tenancy/settings-policy";

/**
 * Server-resolved settings carried by a ticket (dx#119). Absent for the
 * operator bypass and for a forwarded admin, who keep the URL parameters.
 */
export interface WsPolicy {
  settings: SecuritySettings;
  locked: SecuritySettingKey[];
}

export type AuthDecision =
  | {
      ok: true;
      user: string;
      method: "forwarded" | "ticket" | "bypass";
      hostShell: HostShellDecision;
      /**
       * Multi-tenancy (dx#119): who this connection acts as, for the
       * permission and ownership checks the connection handler makes.
       */
      principal: Principal;
      policy?: WsPolicy;
    }
  | { ok: false; code: number; reason: string };

const ADMIN_PERMISSIONS = permissionsForRoles(["admin"]);

/** The operator bypass: trusted root of the machine, admin on both planes. */
const OPERATOR_PRINCIPAL: Principal = Object.freeze({
  subject: null,
  operator: true,
  admin: true,
  permissions: ADMIN_PERMISSIONS,
}) as Principal;

// Single-use ticket tracking: jti -> expiry (epoch ms). In-memory only — the
// short TTL makes survival across a terminal-server restart unnecessary (spec
// D6). Expired entries are pruned lazily on each consume.
const seenJti = new Map<string, number>();

/**
 * Record a jti as used. Returns false if it was already seen (replay) — the
 * caller must reject. Exported for tests.
 */
export function consumeJti(
  jti: string,
  exp: number,
  now: number = Date.now(),
): boolean {
  for (const [id, expiry] of seenJti) {
    if (expiry <= now) seenJti.delete(id);
  }
  if (seenJti.has(jti)) return false;
  seenJti.set(jti, exp);
  return true;
}

/** Test-only: clear the seen-set so cases don't leak state across tests. */
export function _resetSeenJti(): void {
  seenJti.clear();
}

function strictMode(): boolean {
  return process.env.DAAX_REQUIRE_AUTH === "1";
}

let wsSecretMissingWarned = false;
function warnWsSecretMissingOnce(): void {
  if (wsSecretMissingWarned) return;
  wsSecretMissingWarned = true;
  console.warn(
    "[ws-auth] SHIP-BLOCKING: DAAX_REQUIRE_AUTH=1 but DAAX_WS_TOKEN_SECRET is " +
      "unset — bearer-ticket WS authentication is unavailable. Uncredentialed " +
      "and ticketed upgrades from non-loopback peers are REFUSED (fail-closed). " +
      "Set DAAX_WS_TOKEN_SECRET (same value on the app and terminal server).",
  );
}

/** Test-only: reset the warn-once latch. */
export function _resetWsSecretWarning(): void {
  wsSecretMissingWarned = false;
}

// Extract the bearer token from the offered subprotocols. The client offers
// `[WS_TICKET_SUBPROTOCOL, <token>]`, so the token is the entry following the
// protocol name in the comma-separated `Sec-WebSocket-Protocol` header.
function extractTicket(
  protocolHeader: string | string[] | undefined,
): string | undefined {
  if (!protocolHeader) return undefined;
  const raw = Array.isArray(protocolHeader)
    ? protocolHeader.join(",")
    : protocolHeader;
  const parts = raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const idx = parts.indexOf(WS_TICKET_SUBPROTOCOL);
  if (idx === -1 || idx === parts.length - 1) return undefined;
  return parts[idx + 1];
}

/**
 * Decide whether to accept a WS upgrade. Pure w.r.t. the request (no side
 * effects beyond consuming a jti and the one-time warning), so it is unit
 * testable with a minimal `req` shape.
 */
export function authenticateConnection(req: IncomingMessage): AuthDecision {
  // Normalize the Origin header: a malformed request can present it as an array
  // (multiple Origin headers); pass a single string to isAllowedOrigin so it
  // never throws on `.match` (which would turn a bad request into a 500/DoS).
  const rawOrigin = req.headers.origin as string | string[] | undefined;
  const origin = Array.isArray(rawOrigin) ? rawOrigin[0] : rawOrigin;
  // isAllowedOrigin now rejects a missing Origin, so a raw (non-browser) client
  // is refused before any credential check.
  if (!isAllowedOrigin(origin)) {
    return { ok: false, code: 1008, reason: "origin not allowed" };
  }

  const loopback = isLoopbackAddress(req.socket?.remoteAddress);

  // Traefik path: forwarded identity, trusted only from a loopback peer.
  const forwarded = req.headers["x-forwarded-user"];
  const xUser = (Array.isArray(forwarded) ? forwarded[0] : forwarded || "")
    .toString()
    .trim();
  const ticket = extractTicket(req.headers["sec-websocket-protocol"]);
  if (xUser && loopback && !ticket) {
    // No Postgres on this plane, so roles and settings locks cannot be
    // resolved for a bare forwarded identity (dx#119, fail closed):
    //   - ticketing configured (DAAX_WS_TOKEN_SECRET): the app always mints a
    //     ticket, so a ticketless upgrade gets NO permissions — the signed
    //     claims are the only authority, for admins too (a role revoked in the
    //     DB or a lock on the subject must not be skippable by omitting it);
    //   - no ticketing (host-dev behind Traefik): only a DAAX_ADMIN_USERS
    //     subject is known to be an admin; anyone else gets no permissions.
    const hostShell = decideHostShell(xUser);
    const subject = canonicalizeSubject(xUser);
    const principal: Principal =
      hostShell.ok && !getWsTokenSecret()
        ? {
            subject,
            operator: false,
            admin: true,
            permissions: ADMIN_PERMISSIONS,
          }
        : { subject, operator: false, admin: false, permissions: [] };
    return { ok: true, user: xUser, method: "forwarded", hostShell, principal };
  }

  // Ticket path: single-use bearer token via subprotocol. When Traefik also
  // forwarded an identity (loopback), the ticket must name the same subject.
  if (ticket) {
    if (!getWsTokenSecret()) {
      if (strictMode()) warnWsSecretMissingOnce();
      return { ok: false, code: 1008, reason: "ticket secret unset" };
    }
    const result = verifyTicket(ticket);
    if (!result.valid) {
      return { ok: false, code: 1008, reason: `ticket ${result.reason}` };
    }
    if (!consumeJti(result.payload.jti, result.payload.exp)) {
      return { ok: false, code: 1008, reason: "ticket reused" };
    }
    const { payload } = result;
    if (
      xUser &&
      loopback &&
      canonicalizeSubject(xUser) !== canonicalizeSubject(payload.sub)
    ) {
      return { ok: false, code: 1008, reason: "ticket subject mismatch" };
    }
    let hostShell: HostShellDecision;
    if (payload.hostShell !== true) {
      hostShell = {
        ok: false,
        reason: "host terminal refused: ticket was not minted for an admin",
      };
    } else if (payload.operator === true) {
      hostShell = strictMode()
        ? {
            ok: false,
            reason:
              "host terminal refused: operator tickets are not honoured under DAAX_REQUIRE_AUTH=1",
          }
        : { ok: true };
    } else {
      hostShell = decideHostShell(payload.sub);
    }
    // Operator tickets are honoured only where this server would itself grant
    // the bypass (non-strict), exactly like the host-shell claim above.
    const operatorHonoured = payload.operator === true && !strictMode();
    const principal: Principal = operatorHonoured
      ? OPERATOR_PRINCIPAL
      : {
          subject: payload.operator ? null : canonicalizeSubject(payload.sub),
          operator: false,
          admin: payload.operator ? false : payload.admin === true,
          permissions: payload.operator ? [] : (payload.perms ?? []),
        };
    const policy: WsPolicy | undefined = payload.settings
      ? { settings: payload.settings, locked: payload.locked ?? [] }
      : undefined;
    return {
      ok: true,
      user: payload.sub,
      method: "ticket",
      hostShell,
      principal,
      policy,
    };
  }

  // No credentials.
  if (strictMode() && !getWsTokenSecret()) warnWsSecretMissingOnce();
  if (!strictMode() && loopback && !req.headers["x-forwarded-for"]) {
    return {
      ok: true,
      user: "local",
      method: "bypass",
      hostShell: { ok: true },
      principal: OPERATOR_PRINCIPAL,
    };
  }
  return { ok: false, code: 1008, reason: "authentication required" };
}
