import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { IncomingMessage } from "http";

import {
  authenticateConnection,
  consumeJti,
  _resetSeenJti,
  _resetWsSecretWarning,
} from "@/server/handlers/ws-auth";
import { mintTicket } from "@/lib/ws-ticket";
import { WS_TICKET_SUBPROTOCOL } from "@/lib/ws-ticket-protocol";

const SECRET = "ws-token-secret-value";
const LOOPBACK = "127.0.0.1";
const TAILNET = "100.64.0.5";

// Build a minimal IncomingMessage-like object for the authenticator.
function makeReq(opts: {
  origin?: string;
  remoteAddress?: string;
  forwardedUser?: string;
  protocol?: string;
}): IncomingMessage {
  const headers: Record<string, string> = {};
  if (opts.origin !== undefined) headers["origin"] = opts.origin;
  if (opts.forwardedUser !== undefined)
    headers["x-forwarded-user"] = opts.forwardedUser;
  if (opts.protocol !== undefined)
    headers["sec-websocket-protocol"] = opts.protocol;
  return {
    headers,
    socket: { remoteAddress: opts.remoteAddress },
  } as unknown as IncomingMessage;
}

function ticketProtocol(token: string): string {
  return `${WS_TICKET_SUBPROTOCOL}, ${token}`;
}

describe("authenticateConnection (F1b, #95)", () => {
  beforeEach(() => {
    _resetSeenJti();
    _resetWsSecretWarning();
    process.env.DAAX_WS_TOKEN_SECRET = SECRET;
    delete process.env.DAAX_REQUIRE_AUTH;
  });
  afterEach(() => {
    delete process.env.DAAX_WS_TOKEN_SECRET;
    delete process.env.DAAX_REQUIRE_AUTH;
  });

  it("rejects a missing Origin (raw client)", () => {
    const d = authenticateConnection(makeReq({ remoteAddress: TAILNET }));
    expect(d.ok).toBe(false);
  });

  it("accepts forwarded identity from a loopback peer (Traefik path)", () => {
    const d = authenticateConnection(
      makeReq({
        origin: "https://daax.host.poley.dev",
        remoteAddress: LOOPBACK,
        forwardedUser: "alice",
      }),
    );
    expect(d.ok).toBe(true);
    if (d.ok) {
      expect(d.user).toBe("alice");
      expect(d.method).toBe("forwarded");
    }
  });

  it("does NOT trust forwarded identity from a non-loopback peer (forgery)", () => {
    process.env.DAAX_REQUIRE_AUTH = "1";
    const d = authenticateConnection(
      makeReq({
        origin: "http://100.64.0.5:4201",
        remoteAddress: TAILNET,
        forwardedUser: "attacker",
      }),
    );
    expect(d.ok).toBe(false);
  });

  it("accepts a valid single-use ticket (tailnet-direct path)", () => {
    const { token } = mintTicket("bob");
    const d = authenticateConnection(
      makeReq({
        origin: "http://100.64.0.5:4201",
        remoteAddress: TAILNET,
        protocol: ticketProtocol(token),
      }),
    );
    expect(d.ok).toBe(true);
    if (d.ok) {
      expect(d.user).toBe("bob");
      expect(d.method).toBe("ticket");
    }
  });

  it("rejects a reused ticket (single-use)", () => {
    const { token } = mintTicket("bob");
    const req = makeReq({
      origin: "http://100.64.0.5:4201",
      remoteAddress: TAILNET,
      protocol: ticketProtocol(token),
    });
    expect(authenticateConnection(req).ok).toBe(true);
    const second = authenticateConnection(
      makeReq({
        origin: "http://100.64.0.5:4201",
        remoteAddress: TAILNET,
        protocol: ticketProtocol(token),
      }),
    );
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toContain("reused");
  });

  it("rejects an expired ticket", () => {
    const { token } = mintTicket("bob", Date.now() - 60_000);
    const d = authenticateConnection(
      makeReq({
        origin: "http://100.64.0.5:4201",
        remoteAddress: TAILNET,
        protocol: ticketProtocol(token),
      }),
    );
    expect(d.ok).toBe(false);
  });

  it("bypasses to LOCAL_OPERATOR for a loopback peer with no creds (non-strict)", () => {
    const d = authenticateConnection(
      makeReq({ origin: "http://localhost:4200", remoteAddress: LOOPBACK }),
    );
    expect(d.ok).toBe(true);
    if (d.ok) {
      expect(d.user).toBe("local");
      expect(d.method).toBe("bypass");
    }
  });

  it("refuses a non-loopback peer with no creds (no bypass off-host)", () => {
    const d = authenticateConnection(
      makeReq({ origin: "http://100.64.0.5:4201", remoteAddress: TAILNET }),
    );
    expect(d.ok).toBe(false);
  });

  it("refuses a loopback peer with no creds in strict mode", () => {
    process.env.DAAX_REQUIRE_AUTH = "1";
    const d = authenticateConnection(
      makeReq({ origin: "http://localhost:4200", remoteAddress: LOOPBACK }),
    );
    expect(d.ok).toBe(false);
  });

  it("normalizes IPv4-mapped IPv6 loopback (::ffff:127.0.0.1)", () => {
    const d = authenticateConnection(
      makeReq({
        origin: "http://localhost:4200",
        remoteAddress: "::ffff:127.0.0.1",
      }),
    );
    expect(d.ok).toBe(true);
  });

  it("rejects a ticket when the secret is unset", () => {
    const { token } = mintTicket("bob");
    delete process.env.DAAX_WS_TOKEN_SECRET;
    const d = authenticateConnection(
      makeReq({
        origin: "http://100.64.0.5:4201",
        remoteAddress: TAILNET,
        protocol: ticketProtocol(token),
      }),
    );
    expect(d.ok).toBe(false);
  });
});

describe("consumeJti", () => {
  beforeEach(() => _resetSeenJti());

  it("returns true on first use, false on replay", () => {
    const exp = Date.now() + 10_000;
    expect(consumeJti("jti-1", exp)).toBe(true);
    expect(consumeJti("jti-1", exp)).toBe(false);
  });

  it("prunes expired entries so memory does not grow unbounded", () => {
    const now = Date.now();
    expect(consumeJti("old", now - 1, now)).toBe(true);
    // A later consume prunes the expired 'old' entry; re-using it is allowed
    // again only because it had expired (and would fail verify upstream anyway).
    expect(consumeJti("new", now + 10_000, now + 1)).toBe(true);
    expect(consumeJti("old", now + 20_000, now + 2)).toBe(true);
  });
});
