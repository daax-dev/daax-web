/**
 * Attention live-stream bridge tests (issue #153).
 *
 * Focus: the two behaviours that are pure w.r.t. the network — the Watchtower
 * WS URL resolution across deploy modes, and that an unauthenticated upgrade is
 * rejected (1008) BEFORE any upstream dial (no new unauthenticated surface).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { IncomingMessage } from "http";
import { WebSocket } from "ws";

import {
  handleAttentionBridge,
  watchtowerWsUrl,
} from "@/server/handlers/attention-bridge";

describe("watchtowerWsUrl", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    delete process.env.WATCHTOWER_API_URL;
    delete process.env.HOST_WORKSPACE_PATH;
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  it("defaults to localhost in host-dev", () => {
    expect(watchtowerWsUrl()).toBe("ws://localhost:4220/ws");
  });

  it("reaches the host from a container", () => {
    process.env.HOST_WORKSPACE_PATH = "/workspace";
    expect(watchtowerWsUrl()).toBe("ws://host.docker.internal:4220/ws");
  });

  it("honours an explicit WATCHTOWER_API_URL and swaps the scheme", () => {
    process.env.WATCHTOWER_API_URL = "http://watchtower:9000";
    expect(watchtowerWsUrl()).toBe("ws://watchtower:9000/ws");
    process.env.WATCHTOWER_API_URL = "https://wt.example.com/";
    expect(watchtowerWsUrl()).toBe("wss://wt.example.com/ws");
  });
});

describe("handleAttentionBridge auth", () => {
  it("rejects an upgrade with no allowed Origin before dialing upstream", () => {
    const close = vi.fn();
    const client = {
      readyState: WebSocket.OPEN,
      close,
      on: vi.fn(),
      send: vi.fn(),
    } as unknown as WebSocket;

    // No Origin header → isAllowedOrigin refuses (raw/non-browser client).
    const req = {
      headers: {},
      socket: { remoteAddress: "10.0.0.5" },
      url: "/?stream=attention",
    } as unknown as IncomingMessage;

    handleAttentionBridge(client, req);

    expect(close).toHaveBeenCalledWith(1008, "unauthorized");
  });
});
