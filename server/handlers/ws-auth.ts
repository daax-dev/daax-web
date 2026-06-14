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
 */
import type { IncomingMessage } from "http";

import { verifyTicket, getWsTokenSecret } from "../../lib/ws-ticket";
import { WS_TICKET_SUBPROTOCOL } from "../../lib/ws-ticket-protocol";
import { isAllowedOrigin } from "../config/constants";

export type AuthDecision =
  | { ok: true; user: string; method: "forwarded" | "ticket" | "bypass" }
  | { ok: false; code: number; reason: string };

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

// Normalize IPv4-mapped IPv6 (`::ffff:127.0.0.1`) and IPv6 loopback (`::1`).
function isLoopbackAddress(addr: string | undefined): boolean {
  if (!addr) return false;
  const a = addr.replace(/^::ffff:/i, "");
  return a === "::1" || a === "127.0.0.1" || a.startsWith("127.");
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
  const origin = req.headers.origin;
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
  if (xUser && loopback) {
    return { ok: true, user: xUser, method: "forwarded" };
  }

  // Ticket path: single-use bearer token via subprotocol.
  const ticket = extractTicket(req.headers["sec-websocket-protocol"]);
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
    return { ok: true, user: result.payload.sub, method: "ticket" };
  }

  // No credentials.
  if (strictMode() && !getWsTokenSecret()) warnWsSecretMissingOnce();
  if (!strictMode() && loopback) {
    return { ok: true, user: "local", method: "bypass" };
  }
  return { ok: false, code: 1008, reason: "authentication required" };
}
