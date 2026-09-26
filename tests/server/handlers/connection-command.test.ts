/**
 * What handleConnection types into the pty, per mode.
 *
 * A live host-mode Resume opened mode=local with `claude --resume <id>` and the
 * pty received `exec /home/vscode/.local/share/pnpm/claude …` — the agent
 * image's path, which does not exist on the host — so the shell died and no
 * resume ran. buildFullCommand's own tests could not see it: the mode is
 * threaded here, so this drives the real handler with the pty, auth, session
 * store and path confinement stood in, and reads what is written.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IncomingMessage } from "http";
import type { WebSocket } from "ws";

const { spawn, pty } = vi.hoisted(() => {
  const pty = {
    onData: vi.fn(),
    onExit: vi.fn(),
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    pid: 4242,
  };
  return { pty, spawn: vi.fn((..._args: unknown[]) => pty) };
});

vi.mock("@/server/handlers/ws-auth", () => ({
  authenticateConnection: () => ({
    ok: true,
    user: "local",
    method: "bypass",
    hostShell: { ok: true },
  }),
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
vi.mock("@/server/docker/image-manager", () => ({
  resolveContainerImage: (image: string) => image,
  DEFAULT_CONTAINER_IMAGE: "daax-agent:test",
}));
vi.mock("@/server/recording/recorder", () => ({
  startRecording: vi.fn(),
  stopRecording: vi.fn(),
  recordOutput: vi.fn(),
}));

import { handleConnection } from "@/server/handlers/connection-handler";

const RESUME = "claude --resume 13acf692-c5b0-443b-9a60-a7e40e83799a";

function connect(query: Record<string, string>) {
  const ws = { send: vi.fn(), on: vi.fn(), close: vi.fn(), readyState: 1 };
  const req = {
    url: `/?${new URLSearchParams(query)}`,
    socket: { remoteAddress: "127.0.0.1" },
    headers: {},
  } as unknown as IncomingMessage;
  handleConnection(ws as unknown as WebSocket, req);
  vi.advanceTimersByTime(1000);
  return ws;
}

beforeEach(() => {
  vi.useFakeTimers();
  spawn.mockClear();
  pty.write.mockClear();
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("the command typed into the pty", () => {
  it("a host-mode resume (mode=local) is typed verbatim into a login shell", () => {
    const ws = connect({
      mode: "local",
      cwd: "/home/dev/prj/scratch-takeover",
      command: RESUME,
      sessionType: "resume",
    });
    expect(ws.close).not.toHaveBeenCalled();
    expect(spawn).toHaveBeenCalledWith(
      "/bin/zsh",
      ["-l"],
      expect.objectContaining({ cwd: "/home/dev/prj/scratch-takeover" }),
    );
    expect(pty.write).toHaveBeenCalledTimes(1);
    expect(pty.write).toHaveBeenCalledWith(
      "claude --resume 13acf692-c5b0-443b-9a60-a7e40e83799a\r",
    );
  });

  it("a daax agent container (mode=container) still gets the agent image's path", () => {
    connect({ mode: "container", cwd: "/workspace", command: RESUME });
    expect(spawn.mock.calls[0][0]).toBe("docker");
    expect(pty.write).toHaveBeenCalledWith(
      "exec /home/vscode/.local/share/pnpm/claude --resume 13acf692-c5b0-443b-9a60-a7e40e83799a\r",
    );
  });
});
