/**
 * Attention live-stream bridge relay tests (issue #153).
 *
 * Focus: the upstream→browser relay must not crash the terminal-server process
 * when the client socket races to CLOSING/CLOSED between the readyState check
 * and `send()`. `ws` throws in that window; the bridge must catch it and tear
 * the relay down (clear the handshake timer, close upstream) instead of letting
 * the throw propagate out of the event handler.
 *
 * The `ws` module and the auth check are mocked so the relay can be driven
 * without a real socket or a real Watchtower upstream.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { IncomingMessage } from "http";

type Handler = (...args: unknown[]) => void;

const { FakeWs, upstreamInstances } = vi.hoisted(() => {
  class FakeWs {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
    readyState = FakeWs.CONNECTING;
    url: string;
    handlers: Record<string, Handler[]> = {};
    terminate = vi.fn();
    close = vi.fn();
    send = vi.fn();
    constructor(url: string) {
      this.url = url;
      upstreamInstances.push(this);
    }
    on(event: string, cb: Handler): this {
      (this.handlers[event] ??= []).push(cb);
      return this;
    }
    emit(event: string, ...args: unknown[]): void {
      for (const cb of this.handlers[event] ?? []) cb(...args);
    }
  }
  const upstreamInstances: InstanceType<typeof FakeWs>[] = [];
  return { FakeWs, upstreamInstances };
});

vi.mock("ws", () => ({ WebSocket: FakeWs }));
vi.mock("@/server/handlers/ws-auth", () => ({
  authenticateConnection: () => ({ ok: true, user: "test", method: "bypass" }),
}));

import { handleAttentionBridge } from "@/server/handlers/attention-bridge";

function fakeClient(sendImpl: () => void) {
  return {
    readyState: FakeWs.OPEN,
    send: vi.fn(sendImpl),
    close: vi.fn(),
    on: vi.fn(),
  };
}

const req = {
  headers: { origin: "http://localhost:4200" },
  socket: { remoteAddress: "127.0.0.1" },
  url: "/?stream=attention",
} as unknown as IncomingMessage;

describe("attention-bridge relay send failure", () => {
  beforeEach(() => {
    upstreamInstances.length = 0;
    vi.clearAllMocks();
  });

  it("tears down the bridge (does not throw) when client.send() throws", () => {
    const client = fakeClient(() => {
      throw new Error("client CLOSING");
    });

    handleAttentionBridge(client as never, req);
    expect(upstreamInstances).toHaveLength(1);
    const upstream = upstreamInstances[0];

    // Relaying a frame while the client is racing to CLOSED: send() throws.
    // The handler must swallow it (no crash) and tear down the upstream. The
    // upstream is still CONNECTING, so teardown force-aborts via terminate().
    expect(() => upstream.emit("message", "frame")).not.toThrow();
    expect(client.send).toHaveBeenCalledTimes(1);
    expect(upstream.terminate).toHaveBeenCalledTimes(1);
  });

  it("relays normally when send() succeeds (no teardown)", () => {
    const client = fakeClient(() => undefined);

    handleAttentionBridge(client as never, req);
    const upstream = upstreamInstances[0];

    upstream.emit("message", "frame");
    expect(client.send).toHaveBeenCalledWith("frame");
    expect(upstream.terminate).not.toHaveBeenCalled();
    expect(upstream.close).not.toHaveBeenCalled();
  });
});
