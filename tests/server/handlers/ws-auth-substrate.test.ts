/** ws-auth surfaces the substrate attach claim of a verified ticket (dx#113). */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { IncomingMessage } from "http";

import {
  _resetSeenJti,
  authenticateConnection,
} from "@/server/handlers/ws-auth";
import { mintTicket } from "@/lib/ws-ticket";

const claim = {
  session: "6f1c2a9e-1111-4222-8333-444455556666",
  actor: "daax-0123456789",
};

function req(token: string): IncomingMessage {
  return {
    headers: {
      origin: "http://localhost:4200",
      "sec-websocket-protocol": `daax-ws-ticket, ${token}`,
    },
    socket: { remoteAddress: "172.17.0.1" },
  } as unknown as IncomingMessage;
}

beforeEach(() => {
  process.env.DAAX_WS_TOKEN_SECRET = "t".repeat(64);
  _resetSeenJti();
});
afterEach(() => {
  delete process.env.DAAX_WS_TOKEN_SECRET;
});

describe("substrate claim", () => {
  it("is returned for a ticket minted with it", () => {
    const { token } = mintTicket("alice", undefined, { substrate: claim });
    const d = authenticateConnection(req(token));
    expect(d.ok && d.substrate).toEqual(claim);
    expect(d.ok && d.hostShell.ok).toBe(false);
  });

  it("is absent for an ordinary ticket", () => {
    const { token } = mintTicket("alice");
    const d = authenticateConnection(req(token));
    expect(d.ok && "substrate" in d).toBe(false);
  });

  it("is single-use like every ticket", () => {
    const { token } = mintTicket("alice", undefined, { substrate: claim });
    expect(authenticateConnection(req(token)).ok).toBe(true);
    expect(authenticateConnection(req(token)).ok).toBe(false);
  });
});
