/**
 * A6: the terminal WS `containerName` query param is exec'd directly
 * (`docker exec <containerName>`). handleConnection must reject any name that is
 * not a daax AI-session container (`daax-<8 hex>`) BEFORE any PTY/container is
 * spawned — so a WS user cannot exec into `postgres`, sibling infra, or inject a
 * leading-`-` option. Auth is mocked to succeed so the test isolates the
 * container-name guard from the (separately tested) upgrade auth.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { IncomingMessage } from "http";
import type { WebSocket } from "ws";

vi.mock("@/server/handlers/ws-auth", () => ({
  authenticateConnection: () => ({ ok: true }),
}));

import { handleConnection } from "@/server/handlers/connection-handler";

function mockWs(): WebSocket & { close: ReturnType<typeof vi.fn> } {
  return {
    close: vi.fn(),
    on: vi.fn(),
    send: vi.fn(),
  } as unknown as WebSocket & { close: ReturnType<typeof vi.fn> };
}

function mockReq(containerName: string): IncomingMessage {
  const url = `/?mode=container&containerName=${encodeURIComponent(containerName)}`;
  return {
    url,
    socket: { remoteAddress: "127.0.0.1" },
  } as unknown as IncomingMessage;
}

beforeEach(() => vi.clearAllMocks());

describe("handleConnection container-name allowlist (A6)", () => {
  it.each([
    ["postgres"],
    ["daax-code-server"],
    ["daax-net"],
    ["-v/var/run/docker.sock:/var/run/docker.sock"],
    ["daax-XYZ"], // non-hex
    ["daax-1a2b3c4"], // too short
    ["daax-1a2b3c4d5"], // too long
  ])("rejects non-session containerName %j with close(1008)", (name) => {
    const ws = mockWs();
    handleConnection(ws, mockReq(name));
    expect(ws.close).toHaveBeenCalledWith(1008, "Invalid container");
  });

  it("does not reject a valid daax session name with the container guard", () => {
    const ws = mockWs();
    // A valid session name passes the A6 guard; it proceeds into session setup,
    // which may close for OTHER reasons in this bare harness — assert only that
    // it is NOT the "Invalid container" rejection.
    handleConnection(ws, mockReq("daax-1a2b3c4d"));
    for (const call of ws.close.mock.calls) {
      expect(call).not.toEqual([1008, "Invalid container"]);
    }
  });
});
