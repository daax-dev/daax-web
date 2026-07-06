/**
 * WebSocket connection dispatch tests (issue #156).
 *
 * The single WS port (4201) is dispatched by the request's `?stream=` query.
 * `req.url` is client-controlled and can be genuinely unparseable — dispatch
 * must be deterministic and fail CLOSED rather than defaulting into the
 * side-effecting PTY handler.
 */

import { describe, it, expect, vi } from "vitest";
import type { IncomingMessage } from "http";
import type { WebSocket } from "ws";

import { dispatchConnection } from "@/server/handlers/connection-dispatch";

function mockReq(url: string | undefined): IncomingMessage {
  return { url } as unknown as IncomingMessage;
}

function mockWs(): WebSocket & { close: ReturnType<typeof vi.fn> } {
  return { close: vi.fn() } as unknown as WebSocket & {
    close: ReturnType<typeof vi.fn>;
  };
}

describe("dispatchConnection", () => {
  it("routes a normal terminal URL to the PTY handler", () => {
    const onTerminal = vi.fn();
    const onAttention = vi.fn();
    const ws = mockWs();
    const req = mockReq("/");

    dispatchConnection(ws, req, onTerminal, onAttention);

    expect(onTerminal).toHaveBeenCalledOnce();
    expect(onTerminal).toHaveBeenCalledWith(ws, req);
    expect(onAttention).not.toHaveBeenCalled();
    expect(ws.close).not.toHaveBeenCalled();
  });

  it("routes ?stream=attention to the attention bridge", () => {
    const onTerminal = vi.fn();
    const onAttention = vi.fn();
    const ws = mockWs();
    const req = mockReq("/?stream=attention");

    dispatchConnection(ws, req, onTerminal, onAttention);

    expect(onAttention).toHaveBeenCalledOnce();
    expect(onAttention).toHaveBeenCalledWith(ws, req);
    expect(onTerminal).not.toHaveBeenCalled();
    expect(ws.close).not.toHaveBeenCalled();
  });

  it("routes an unknown ?stream value to the PTY handler (unchanged default)", () => {
    const onTerminal = vi.fn();
    const onAttention = vi.fn();
    const ws = mockWs();
    const req = mockReq("/?stream=bogus");

    dispatchConnection(ws, req, onTerminal, onAttention);

    expect(onTerminal).toHaveBeenCalledOnce();
    expect(onAttention).not.toHaveBeenCalled();
    expect(ws.close).not.toHaveBeenCalled();
  });

  it("fails closed on a genuinely-unparseable req.url: closes the socket, no handler invoked", () => {
    const onTerminal = vi.fn();
    const onAttention = vi.fn();
    const ws = mockWs();
    // A protocol-relative URL with an invalid (bad percent-encoding) host —
    // `new URL(...)` throws against any base. Client-controlled and unparseable.
    const req = mockReq("//foo%");

    dispatchConnection(ws, req, onTerminal, onAttention);

    expect(ws.close).toHaveBeenCalledOnce();
    expect(ws.close).toHaveBeenCalledWith(1008, "bad request");
    // Critical: the side-effecting PTY handler must NOT run.
    expect(onTerminal).not.toHaveBeenCalled();
    expect(onAttention).not.toHaveBeenCalled();
  });
});
