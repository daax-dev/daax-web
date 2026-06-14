import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getTerminalWebSocketUrl,
  openTerminalWebSocket,
  _resetTicketingCache,
} from "@/lib/websocket-utils";
import { WS_TICKET_SUBPROTOCOL } from "@/lib/ws-ticket-protocol";

/**
 * Covers the REAL consolidated ticket-aware builder (F1b, #95) — distinct from
 * tests/terminal-server-url.test.ts, which exercises an inline copy of the old
 * URL logic.
 */
describe("websocket-utils consolidated builder", () => {
  let wsArgs: Array<[string, string[] | undefined]>;

  beforeEach(() => {
    wsArgs = [];
    _resetTicketingCache();
    vi.stubGlobal(
      "WebSocket",
      class {
        constructor(url: string, protocols?: string[]) {
          wsArgs.push([url, protocols]);
        }
        close() {}
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.NEXT_PUBLIC_TERMINAL_WS_URL;
    vi.restoreAllMocks();
  });

  it("honors the NEXT_PUBLIC_TERMINAL_WS_URL override", () => {
    process.env.NEXT_PUBLIC_TERMINAL_WS_URL = "wss://override.example/ws";
    expect(getTerminalWebSocketUrl()).toBe("wss://override.example/ws");
  });

  it("presents the ticket via subprotocol when minting succeeds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ token: "tok-123", exp: Date.now() + 1000 }),
            { status: 200 },
          ),
      ),
    );

    await openTerminalWebSocket("ws://localhost:4201?x=1");

    expect(wsArgs).toHaveLength(1);
    expect(wsArgs[0][0]).toBe("ws://localhost:4201?x=1");
    expect(wsArgs[0][1]).toEqual([WS_TICKET_SUBPROTOCOL, "tok-123"]);
  });

  it("connects without a subprotocol when ticketing is unavailable (503)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 503 })),
    );

    await openTerminalWebSocket("ws://localhost:4201");

    expect(wsArgs[0][1]).toBeUndefined();
  });

  it("connects without a subprotocol when the mint fetch throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );

    await openTerminalWebSocket("ws://localhost:4201");

    expect(wsArgs[0][1]).toBeUndefined();
  });
});
