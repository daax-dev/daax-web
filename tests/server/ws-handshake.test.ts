/**
 * Integration test for the terminal WS upgrade handshake (F1b, issue #95).
 *
 * Stands up a real `ws` server wired with the SAME handleProtocols + the real
 * authenticateConnection() the terminal server uses, and connects real `ws`
 * clients over loopback. Asserts the negative paths (no ticket / reused / bad
 * origin) close the handshake and the positive paths (valid ticket / forwarded
 * identity) open it — without spawning any PTY/container.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { WebSocketServer, WebSocket, type AddressInfo } from "ws";
import type { IncomingMessage } from "http";

import {
  authenticateConnection,
  _resetSeenJti,
} from "@/server/handlers/ws-auth";
import { mintTicket } from "@/lib/ws-ticket";
import { WS_TICKET_SUBPROTOCOL } from "@/lib/ws-ticket-protocol";

let wss: WebSocketServer;
let port: number;

beforeAll(async () => {
  process.env.DAAX_WS_TOKEN_SECRET = "ws-token-secret-value";
  // Strict mode: a loopback peer with no credentials is refused, so the ticket
  // path is exercised (otherwise loopback would bypass).
  process.env.DAAX_REQUIRE_AUTH = "1";

  wss = new WebSocketServer({
    port: 0,
    handleProtocols: (protocols: Set<string>) =>
      protocols.has(WS_TICKET_SUBPROTOCOL) ? WS_TICKET_SUBPROTOCOL : false,
  });
  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    const auth = authenticateConnection(req);
    if (!auth.ok) {
      ws.close(auth.code, auth.reason);
      return;
    }
    ws.send(`authed:${auth.user}`);
  });
  await new Promise<void>((resolve) => wss.once("listening", () => resolve()));
  port = (wss.address() as AddressInfo).port;
});

afterAll(async () => {
  delete process.env.DAAX_WS_TOKEN_SECRET;
  delete process.env.DAAX_REQUIRE_AUTH;
  // Await the async close so Vitest doesn't see leaked handles.
  await new Promise<void>((resolve) => wss.close(() => resolve()));
});

beforeEach(() => _resetSeenJti());

interface Outcome {
  authedAs?: string;
  closeCode?: number;
}

// Connect a client and resolve once it either receives an "authed:" message or
// the socket closes.
function connect(opts: {
  protocols?: string[];
  origin?: string;
  headers?: Record<string, string>;
}): Promise<Outcome> {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`, opts.protocols ?? [], {
      origin: opts.origin,
      headers: opts.headers,
    });
    const outcome: Outcome = {};
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      resolve(outcome);
    };
    // Single settle path: resolve on close, on error (which may arrive without a
    // subsequent close), or after a timeout so the suite can never hang.
    const timer = setTimeout(settle, 4000);
    const finish = () => {
      clearTimeout(timer);
      settle();
    };
    ws.on("message", (data) => {
      const text = data.toString();
      if (text.startsWith("authed:")) {
        outcome.authedAs = text.slice("authed:".length);
        ws.close();
      }
    });
    ws.on("close", (code) => {
      outcome.closeCode ??= code;
      finish();
    });
    ws.on("error", () => {
      finish();
    });
  });
}

describe("terminal WS handshake (integration, F1b #95)", () => {
  it("refuses a client with no Origin", async () => {
    const r = await connect({ origin: undefined });
    expect(r.authedAs).toBeUndefined();
    expect(r.closeCode).toBe(1008);
  });

  it("refuses an uncredentialed client in strict mode", async () => {
    const r = await connect({ origin: "http://localhost:4200" });
    expect(r.authedAs).toBeUndefined();
    expect(r.closeCode).toBe(1008);
  });

  it("accepts a client presenting a valid single-use ticket", async () => {
    const { token } = mintTicket("carol");
    const r = await connect({
      origin: "http://localhost:4200",
      protocols: [WS_TICKET_SUBPROTOCOL, token],
    });
    expect(r.authedAs).toBe("carol");
  });

  it("refuses a reused ticket", async () => {
    const { token } = mintTicket("carol");
    const first = await connect({
      origin: "http://localhost:4200",
      protocols: [WS_TICKET_SUBPROTOCOL, token],
    });
    expect(first.authedAs).toBe("carol");
    const second = await connect({
      origin: "http://localhost:4200",
      protocols: [WS_TICKET_SUBPROTOCOL, token],
    });
    expect(second.authedAs).toBeUndefined();
    expect(second.closeCode).toBe(1008);
  });

  it("accepts the forwarded-identity path from a loopback peer", async () => {
    const r = await connect({
      origin: "http://localhost:4200",
      headers: { "x-forwarded-user": "dave" },
    });
    expect(r.authedAs).toBe("dave");
  });

  it("negotiates only the ticket subprotocol name back to the client", async () => {
    const { token } = mintTicket("carol");
    const negotiated = await new Promise<string>((resolve) => {
      const ws = new WebSocket(
        `ws://127.0.0.1:${port}`,
        [WS_TICKET_SUBPROTOCOL, token],
        { origin: "http://localhost:4200" },
      );
      ws.on("open", () => {
        resolve(ws.protocol);
        ws.close();
      });
      ws.on("close", () => resolve(ws.protocol));
    });
    expect(negotiated).toBe(WS_TICKET_SUBPROTOCOL);
  });
});
