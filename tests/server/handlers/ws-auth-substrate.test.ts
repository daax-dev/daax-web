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

  // Multi-tenancy (dx#119): the attach ticket's signed claims are the only
  // authority on the terminal plane.
  it("carries the session owner and the caller's signed perms and admin flag", () => {
    const { token } = mintTicket("bob", undefined, {
      perms: ["terminal:exec"],
      substrate: { ...claim, owner: "alice" },
    });
    const d = authenticateConnection(req(token));
    if (!d.ok) throw new Error(d.reason);
    expect(d.substrate).toEqual({ ...claim, owner: "alice" });
    expect(d.principal).toMatchObject({
      subject: "bob",
      admin: false,
      permissions: ["terminal:exec"],
    });

    const admin = mintTicket("root", undefined, {
      admin: true,
      perms: ["terminal:exec", "containers:write"],
      substrate: { ...claim, owner: "alice" },
    });
    const a = authenticateConnection(req(admin.token));
    expect(a.ok && a.principal.admin).toBe(true);
  });

  it("a ticket without perms grants no permissions (pre-#119 tickets)", () => {
    const { token } = mintTicket("alice", undefined, { substrate: claim });
    const d = authenticateConnection(req(token));
    expect(d.ok && d.principal.permissions).toEqual([]);
  });
});
