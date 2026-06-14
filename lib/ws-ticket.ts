/**
 * WebSocket bearer-ticket mint/verify (F1b, issue #95).
 *
 * The authenticated Next.js app mints a short-TTL, single-use HMAC ticket for a
 * user; the terminal server (a separate process) verifies it at the WS upgrade
 * handshake before any PTY/container spawn. Both processes read the SAME
 * `DAAX_WS_TOKEN_SECRET`.
 *
 * Let `encoded = base64url(payloadJson)`. Token format:
 * `encoded.base64url(hmacSha256(encoded))` — i.e. the HMAC is computed over the
 * exact `encoded` string (the base64url payload), NOT the raw JSON or a
 * re-serialized object, so verification never depends on JSON key ordering.
 *
 * NOTE: no `server-only` import — the terminal server imports this outside the
 * Next.js runtime. Single-use enforcement (the jti seen-set) lives in the
 * terminal server, not here (see `server/handlers/ws-auth.ts`).
 */
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import { WS_TICKET_TTL_MS } from "./ws-ticket-protocol";

export { WS_TICKET_SUBPROTOCOL, WS_TICKET_TTL_MS } from "./ws-ticket-protocol";

export interface TicketPayload {
  /** Unique token id — the terminal server tracks it to enforce single use. */
  jti: string;
  /** Authenticated subject (user identifier) the ticket authorizes. */
  sub: string;
  /** Issued-at (epoch ms). */
  iat: number;
  /** Expiry (epoch ms). */
  exp: number;
}

export type VerifyResult =
  | { valid: true; payload: TicketPayload }
  | { valid: false; reason: string };

/** The shared HMAC secret, or undefined when ticketing is not configured. */
export function getWsTokenSecret(): string | undefined {
  return process.env.DAAX_WS_TOKEN_SECRET || undefined;
}

function sign(encoded: string, secret: string): string {
  return createHmac("sha256", secret).update(encoded).digest("base64url");
}

/**
 * Mint a single-use ticket for `sub`. Throws if the secret is unset — callers
 * (the mint endpoint) must check {@link getWsTokenSecret} first and fail with a
 * 503 so the client can fall back to the loopback path in dev.
 */
export function mintTicket(
  sub: string,
  now: number = Date.now(),
): { token: string; exp: number } {
  const secret = getWsTokenSecret();
  if (!secret) {
    throw new Error("DAAX_WS_TOKEN_SECRET is not set; cannot mint WS ticket");
  }
  const payload: TicketPayload = {
    jti: randomUUID(),
    sub,
    iat: now,
    exp: now + WS_TICKET_TTL_MS,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return { token: `${encoded}.${sign(encoded, secret)}`, exp: payload.exp };
}

/**
 * Verify a ticket's signature and expiry. Does NOT enforce single use — the
 * caller checks the jti against the seen-set. Returns a structured reason on
 * failure (never throws) so the handshake can log without leaking specifics to
 * the client.
 */
export function verifyTicket(
  token: string,
  now: number = Date.now(),
): VerifyResult {
  const secret = getWsTokenSecret();
  if (!secret) return { valid: false, reason: "secret-unset" };
  if (typeof token !== "string") return { valid: false, reason: "malformed" };

  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) {
    return { valid: false, reason: "malformed" };
  }
  const encoded = token.slice(0, dot);
  const provided = token.slice(dot + 1);
  const expected = sign(encoded, secret);

  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(expected);
  if (
    providedBuf.length !== expectedBuf.length ||
    !timingSafeEqual(providedBuf, expectedBuf)
  ) {
    return { valid: false, reason: "bad-signature" };
  }

  let payload: TicketPayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return { valid: false, reason: "bad-payload" };
  }
  if (
    typeof payload?.jti !== "string" ||
    typeof payload?.sub !== "string" ||
    typeof payload?.exp !== "number"
  ) {
    return { valid: false, reason: "bad-claims" };
  }
  if (now > payload.exp) return { valid: false, reason: "expired" };

  return { valid: true, payload };
}
