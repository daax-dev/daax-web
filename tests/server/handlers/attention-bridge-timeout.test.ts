/**
 * Attention live-stream bridge — upstream handshake timeout (issue #153).
 *
 * A blackholed Watchtower upstream (SYN accepted, no WS upgrade) would leave the
 * relay socket in CONNECTING forever. This suite drives the bounded handshake
 * timer with fake timers and a mocked `ws` WebSocket to prove the upstream is
 * terminated and the client is closed with a recoverable code when `open` never
 * fires — and that a successful `open` cancels the timer.
 *
 * The `ws` module and `ws-auth` are mocked here (isolated from the sibling
 * attention-bridge.test.ts, which exercises the real auth path) so construction
 * of the upstream socket is fully controllable and auth is forced to pass.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { IncomingMessage } from "http";

const hoisted = vi.hoisted(() => {
  class FakeWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
    static instances: FakeWebSocket[] = [];

    url: string;
    readyState = 0; // CONNECTING
    listeners: Record<string, ((...a: unknown[]) => void)[]> = {};
    terminate = vi.fn(() => {
      this.readyState = 3;
    });
    close = vi.fn(() => {
      this.readyState = 3;
    });
    send = vi.fn();

    constructor(url: string) {
      this.url = url;
      FakeWebSocket.instances.push(this);
    }
    on(event: string, cb: (...a: unknown[]) => void): this {
      (this.listeners[event] ??= []).push(cb);
      return this;
    }
    emit(event: string, ...args: unknown[]): void {
      (this.listeners[event] ?? []).forEach((cb) => cb(...args));
    }
  }
  return { FakeWebSocket };
});

vi.mock("ws", () => ({ WebSocket: hoisted.FakeWebSocket }));
vi.mock("@/server/handlers/ws-auth", () => ({
  authenticateConnection: () => ({ ok: true, user: "local", method: "bypass" }),
}));

import { handleAttentionBridge } from "@/server/handlers/attention-bridge";

const { FakeWebSocket } = hoisted;

describe("handleAttentionBridge upstream handshake timeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeWebSocket.instances = [];
    delete process.env.DAAX_ATTENTION_UPSTREAM_TIMEOUT_MS;
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    // process.env is shared across test files in a worker; don't leak the
    // override this suite sets into later files.
    delete process.env.DAAX_ATTENTION_UPSTREAM_TIMEOUT_MS;
  });

  function makeClient(): import("ws").WebSocket {
    return {
      readyState: FakeWebSocket.OPEN,
      close: vi.fn(),
      send: vi.fn(),
      on: vi.fn(),
    } as unknown as import("ws").WebSocket;
  }

  // Client whose registered event handlers are captured so a test can drive the
  // browser-side 'close'/'error' events.
  function makeCapturingClient(): {
    client: import("ws").WebSocket;
    handlers: Record<string, ((...a: unknown[]) => void)[]>;
  } {
    const handlers: Record<string, ((...a: unknown[]) => void)[]> = {};
    const client = {
      readyState: FakeWebSocket.OPEN,
      close: vi.fn(),
      send: vi.fn(),
      on: vi.fn((event: string, cb: (...a: unknown[]) => void) => {
        (handlers[event] ??= []).push(cb);
      }),
    } as unknown as import("ws").WebSocket;
    return { client, handlers };
  }

  const req = {
    headers: {},
    socket: { remoteAddress: "127.0.0.1" },
    url: "/?stream=attention",
  } as unknown as IncomingMessage;

  it("terminates the upstream and closes the client when the handshake never completes", () => {
    const client = makeClient();
    handleAttentionBridge(client, req);

    const upstream = FakeWebSocket.instances[0];
    expect(upstream).toBeDefined();
    expect(upstream.readyState).toBe(FakeWebSocket.CONNECTING);

    // No `open` within the default 10s window → timer fires.
    vi.advanceTimersByTime(10_000);

    expect(upstream.terminate).toHaveBeenCalledTimes(1);
    expect(client.close).toHaveBeenCalledWith(1011, "upstream timeout");
  });

  it("clears the timer once the upstream opens (no spurious terminate/close)", () => {
    const client = makeClient();
    handleAttentionBridge(client, req);

    const upstream = FakeWebSocket.instances[0];
    upstream.readyState = FakeWebSocket.OPEN;
    upstream.emit("open");

    vi.advanceTimersByTime(60_000);

    expect(upstream.terminate).not.toHaveBeenCalled();
    expect(client.close).not.toHaveBeenCalled();
  });

  it("honours the DAAX_ATTENTION_UPSTREAM_TIMEOUT_MS override", () => {
    process.env.DAAX_ATTENTION_UPSTREAM_TIMEOUT_MS = "2000";
    const client = makeClient();
    handleAttentionBridge(client, req);

    const upstream = FakeWebSocket.instances[0];
    vi.advanceTimersByTime(1999);
    expect(upstream.terminate).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(upstream.terminate).toHaveBeenCalledTimes(1);
    expect(client.close).toHaveBeenCalledWith(1011, "upstream timeout");
  });

  it("terminates (not just closes) a still-CONNECTING upstream when the client disconnects", () => {
    const { client, handlers } = makeCapturingClient();
    handleAttentionBridge(client, req);

    const upstream = FakeWebSocket.instances[0];
    expect(upstream.readyState).toBe(FakeWebSocket.CONNECTING);

    // Browser drops before the upstream handshake completes.
    handlers.close?.forEach((cb) => cb());

    // close() would NOT abort a CONNECTING socket; the timer is already cleared,
    // so terminate() is the only thing that prevents a leaked connection.
    expect(upstream.terminate).toHaveBeenCalledTimes(1);
    expect(upstream.close).not.toHaveBeenCalled();
    expect(upstream.readyState).toBe(FakeWebSocket.CLOSED);
  });

  it("terminates a still-CONNECTING upstream when the client errors", () => {
    const { client, handlers } = makeCapturingClient();
    handleAttentionBridge(client, req);

    const upstream = FakeWebSocket.instances[0];
    expect(upstream.readyState).toBe(FakeWebSocket.CONNECTING);

    handlers.error?.forEach((cb) => cb(new Error("boom")));

    expect(upstream.terminate).toHaveBeenCalledTimes(1);
    expect(upstream.close).not.toHaveBeenCalled();
  });

  it("closes (graceful) an already-OPEN upstream when the client disconnects", () => {
    const { client, handlers } = makeCapturingClient();
    handleAttentionBridge(client, req);

    const upstream = FakeWebSocket.instances[0];
    upstream.readyState = FakeWebSocket.OPEN;
    upstream.emit("open");

    handlers.close?.forEach((cb) => cb());

    expect(upstream.close).toHaveBeenCalledTimes(1);
    expect(upstream.terminate).not.toHaveBeenCalled();
  });
});
