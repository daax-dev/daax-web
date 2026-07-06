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
  rawDataToString,
  watchtowerWsUrl,
} from "@/server/handlers/attention-bridge";

describe("watchtowerWsUrl", () => {
  // Restore only the keys this suite mutates, in place, so the shared
  // process.env proxy is never swapped out (a wholesale reassignment can
  // leave a read-only env for later test files).
  const ENV_KEYS = ["WATCHTOWER_API_URL", "HOST_WORKSPACE_PATH"] as const;
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });
  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
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

describe("rawDataToString", () => {
  const frame = JSON.stringify({ type: "session", id: "sess-1", n: 42 });

  it("passes a string frame through unchanged", () => {
    expect(rawDataToString(frame)).toBe(frame);
  });

  it("decodes a single Buffer frame to intact JSON", () => {
    const buf = Buffer.from(frame, "utf8");
    expect(rawDataToString(buf)).toBe(frame);
    expect(() => JSON.parse(rawDataToString(buf))).not.toThrow();
  });

  it("concatenates a Buffer[] (fragmented) frame instead of comma-joining", () => {
    const buf = Buffer.from(frame, "utf8");
    const mid = Math.floor(buf.length / 2);
    const chunks = [buf.subarray(0, mid), buf.subarray(mid)];
    // .toString() on the array would comma-join and corrupt the JSON.
    expect(rawDataToString(chunks)).toBe(frame);
    expect(JSON.parse(rawDataToString(chunks))).toMatchObject({ n: 42 });
  });

  it("decodes an ArrayBuffer frame rather than stringifying the object", () => {
    const buf = Buffer.from(frame, "utf8");
    const ab = buf.buffer.slice(
      buf.byteOffset,
      buf.byteOffset + buf.byteLength,
    );
    expect(rawDataToString(ab)).toBe(frame);
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
