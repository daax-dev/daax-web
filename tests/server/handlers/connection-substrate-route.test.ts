/**
 * handleConnection routes ?mode=substrate to the substrate handler before the
 * host-shell gate and before any node-pty spawn; every other mode still goes
 * through the container backend's node-pty spawn (unchanged).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IncomingMessage } from "http";
import type { WebSocket } from "ws";

const { spawn, substrate } = vi.hoisted(() => {
  const pty = {
    onData: vi.fn(),
    onExit: vi.fn(),
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    pid: 1,
  };
  return { spawn: vi.fn(() => pty), substrate: vi.fn() };
});

vi.mock("@/server/handlers/ws-auth", () => ({
  authenticateConnection: () => ({
    ok: true,
    user: "alice",
    method: "ticket",
    hostShell: { ok: false, reason: "host terminal refused: not admin" },
    substrate: { session: "s", actor: "daax-0123456789" },
  }),
}));
vi.mock("@/server/handlers/substrate-connection", () => ({
  handleSubstrateConnection: substrate,
}));
vi.mock("@/server/sessions/pty-loader", () => ({ getPty: () => ({ spawn }) }));
vi.mock("@/server/sessions/session-manager", () => ({
  setSession: vi.fn(),
  deleteSession: vi.fn(),
  getSession: vi.fn(),
  hasSession: () => true,
}));
vi.mock("@/lib/worktree-manager", () => ({
  isValidPath: () => true,
  resolveWorkspaceRoot: () => "/home/dev/prj",
}));
vi.mock("@/server/recording/recorder", () => ({
  startRecording: vi.fn(),
  stopRecording: vi.fn(),
  recordOutput: vi.fn(),
}));

import { handleConnection } from "@/server/handlers/connection-handler";

function connect(q: string) {
  const ws = { send: vi.fn(), on: vi.fn(), close: vi.fn(), readyState: 1 };
  handleConnection(
    ws as unknown as WebSocket,
    {
      url: `/?${q}`,
      socket: { remoteAddress: "10.0.0.2" },
      headers: {},
    } as unknown as IncomingMessage,
  );
  return ws;
}

beforeEach(() => {
  spawn.mockClear();
  substrate.mockClear();
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("mode routing", () => {
  it("mode=substrate goes to the substrate handler, not node-pty, and skips the host-shell gate", () => {
    const ws = connect("mode=substrate");
    expect(substrate).toHaveBeenCalledTimes(1);
    expect(spawn).not.toHaveBeenCalled();
    expect(ws.close).not.toHaveBeenCalled();
  });

  it("other modes never reach the substrate handler", () => {
    connect("mode=container");
    connect("mode=local");
    expect(substrate).not.toHaveBeenCalled();
  });
});
