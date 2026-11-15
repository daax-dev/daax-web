/**
 * "Herdr + Claude" must not echo its bootstrap at the user (ported from PR
 * #485).
 *
 * buildFullCommand("herdr-claude") is a ~1000-character multi-stage pipeline.
 * Typed into the new container's already-running shell by scheduleCommand(),
 * the shell echoed the whole of it before anything ran. It is now the
 * container's own `zsh -c` command, and nothing is typed. `docker exec` into
 * an existing container and every other tool keep the typed path.
 *
 * Drives the real handler and container backend; only the pty, auth, session
 * store, path confinement and the docker pull/fallback stand in.
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
    // The local operator, for handlers that check RBAC (dx#119).
    principal: {
      subject: null,
      operator: true,
      admin: true,
      permissions: ["terminal:exec", "recording:write"],
    },
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
vi.mock("@/server/docker/image-manager", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/docker/image-manager")>()),
  resolveContainerImage: (image: string) => image,
}));
// dx#119 (PR #535) looks up a container's owner before `docker exec`; the
// local operator owns everything here. Inert where that module is not imported.
vi.mock("@/server/docker/container-owner", () => ({
  lookupContainerOwner: async () => ({ owner: null }),
}));
vi.mock("@/server/recording/recorder", () => ({
  startRecording: vi.fn(),
  stopRecording: vi.fn(),
  recordOutput: vi.fn(),
}));

import { handleConnection } from "@/server/handlers/connection-handler";
import {
  buildFullCommand,
  isInlineBootstrapCommand,
  runsAsContainerCommand,
} from "@/server/handlers/command-handler";

const IMAGE = "jpoley/daax-agents-gsd:test";

async function connect(query: Record<string, string>) {
  const ws = {
    send: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    close: vi.fn(),
    readyState: 1,
  };
  const req = {
    url: `/?${new URLSearchParams(query)}`,
    socket: { remoteAddress: "127.0.0.1" },
    headers: {},
  } as unknown as IncomingMessage;
  // Awaited: the handler may finish asynchronously (dx#119 docker exec).
  await handleConnection(ws as unknown as WebSocket, req);
  vi.advanceTimersByTime(1000);
  return ws;
}

/** The `docker run` argv and the `zsh -c` script it ends with. */
function dockerRun(): { args: string[]; script: string } {
  const [cmd, args] = spawn.mock.calls[0] as [string, string[]];
  expect(cmd).toBe("docker");
  expect(args[0]).toBe("run");
  expect(args.slice(-4, -1)).toEqual(["/bin/zsh", "-l", "-c"]);
  return { args, script: args[args.length - 1] };
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

describe("isInlineBootstrapCommand", () => {
  it("claims herdr-claude, with or without arguments", () => {
    expect(isInlineBootstrapCommand("herdr-claude")).toBe(true);
    expect(
      isInlineBootstrapCommand("herdr-claude --dangerously-skip-permissions"),
    ).toBe(true);
  });

  it("does not claim the other AI tools, which keep an interactive shell", () => {
    for (const cmd of [
      "",
      "claude",
      "claude --dangerously-skip-permissions",
      "opencode",
      "codex",
      "copilot",
      "gemini",
      "herdr-claudette",
    ]) {
      expect(isInlineBootstrapCommand(cmd)).toBe(false);
    }
  });

  it("only claims commands whose expansion ends by exec'ing a long-running process", () => {
    // A container command that RETURNS would exit the container.
    expect(buildFullCommand("herdr-claude", "agent-container")).toMatch(
      /&& exec herdr --session daax$/,
    );
  });
});

describe("runsAsContainerCommand", () => {
  it("is only a new agent container (docker run)", () => {
    expect(runsAsContainerCommand("container", "", "herdr-claude")).toBe(true);
    expect(
      runsAsContainerCommand("container", "daax-12345678", "herdr-claude"),
    ).toBe(false);
    expect(runsAsContainerCommand("local", "", "herdr-claude")).toBe(false);
    expect(runsAsContainerCommand("shell-tmux", "", "herdr-claude")).toBe(
      false,
    );
    expect(runsAsContainerCommand("container", "", "claude")).toBe(false);
  });
});

describe("a herdr-claude session", () => {
  it("runs the bootstrap as the new container's command and types nothing", async () => {
    const command = "herdr-claude --dangerously-skip-permissions";
    await connect({
      mode: "container",
      cwd: "/workspace",
      command,
      image: IMAGE,
    });

    const { args, script } = dockerRun();
    expect(args[args.length - 5]).toBe(IMAGE);
    expect(script).toBe(
      `export PS1='%F{blue}$FALCON_DISPLAY_PATH%f > ' && ${buildFullCommand(command, "agent-container")}`,
    );
    expect(script).toContain(
      "-- /home/vscode/.local/share/pnpm/claude --dangerously-skip-permissions",
    );
    expect(script).not.toMatch(/&& exec \/bin\/zsh$/);
    expect(pty.write).not.toHaveBeenCalled();
  });

  it("is still typed into the shell of an existing container (docker exec)", async () => {
    await connect({
      mode: "container",
      cwd: "/workspace",
      command: "herdr-claude",
      containerName: "daax-12345678",
    });
    const [cmd, args] = spawn.mock.calls[0] as [string, string[]];
    expect(cmd).toBe("docker");
    expect(args[0]).toBe("exec");
    expect(pty.write).toHaveBeenCalledTimes(1);
    expect(pty.write).toHaveBeenCalledWith(
      buildFullCommand("herdr-claude", "agent-container") + "\r",
    );
  });
});

describe("every other AI tool", () => {
  it("keeps the interactive shell and has its command typed in", async () => {
    await connect({
      mode: "container",
      cwd: "/workspace",
      command: "claude",
      image: IMAGE,
    });
    const { script } = dockerRun();
    expect(script).toMatch(/&& exec \/bin\/zsh$/);
    expect(pty.write).toHaveBeenCalledWith(
      "exec /home/vscode/.local/share/pnpm/claude\r",
    );
  });
});
