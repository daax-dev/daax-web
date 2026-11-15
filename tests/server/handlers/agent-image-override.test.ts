/**
 * DAAX_AGENT_IMAGE_OVERRIDE — the operator's server-side lever over the agent
 * container image (ported from PR #486).
 *
 * AI-tool sessions always send an `image` query param (TerminalManager, from
 * browser localStorage), so CLAUDE_CONTAINER_IMAGE — consulted only when no
 * image is sent — never moves a real session. The override wins over the
 * client's choice for every NEW agent container; it never applies to
 * `docker exec` into an existing one or to non-container modes.
 *
 * Drives the real handler and the real withAgentImageOverride; only the pty,
 * auth, session store, path confinement and the docker pull/fallback stand in.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IncomingMessage } from "http";
import type { WebSocket } from "ws";

const { spawn, pty, resolveContainerImage } = vi.hoisted(() => {
  const pty = {
    onData: vi.fn(),
    onExit: vi.fn(),
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    pid: 4242,
  };
  return {
    pty,
    spawn: vi.fn((..._args: unknown[]) => pty),
    resolveContainerImage: vi.fn((image: string) => image),
  };
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
// No docker: the pull/fallback is stood in; the override logic is real.
vi.mock("@/server/docker/image-manager", () => ({
  resolveContainerImage,
  DEFAULT_CONTAINER_IMAGE: "daax-agent:test",
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
import { withAgentImageOverride } from "@/server/docker/agent-image-override";
import { agentImageOverride } from "@/server/config/constants";

const CLIENT_IMAGE =
  "jpoley/daax-agents-gsd@sha256:2a631fe021ad95f83acbadd96dbda663ee3c4fac6baa665060aa47bca2438003";
const OVERRIDE = "daax-agents:claude-current";

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

/** The image argument `docker run` was given (the element before /bin/zsh). */
function spawnedImage(): string {
  const [cmd, args] = spawn.mock.calls[0] as [string, string[]];
  expect(cmd).toBe("docker");
  expect(args[0]).toBe("run");
  return args[args.indexOf("/bin/zsh") - 1];
}

beforeEach(() => {
  vi.useFakeTimers();
  spawn.mockClear();
  pty.write.mockClear();
  resolveContainerImage.mockClear();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("agentImageOverride", () => {
  it("is empty when unset or blank", () => {
    expect(agentImageOverride({})).toBe("");
    expect(agentImageOverride({ DAAX_AGENT_IMAGE_OVERRIDE: "  " })).toBe("");
  });

  it("reads the operator's value at call time, independent of CLAUDE_CONTAINER_IMAGE", () => {
    vi.stubEnv("CLAUDE_CONTAINER_IMAGE", "jpoley/daax-agents:some-default");
    vi.stubEnv("DAAX_AGENT_IMAGE_OVERRIDE", OVERRIDE);
    expect(agentImageOverride()).toBe(OVERRIDE);
  });
});

describe("withAgentImageOverride", () => {
  it("keeps the client's image when no override is set", () => {
    expect(withAgentImageOverride(CLIENT_IMAGE, "")).toBe(CLIENT_IMAGE);
  });

  it("replaces the client's image with the override and logs it", () => {
    expect(withAgentImageOverride(CLIENT_IMAGE, OVERRIDE)).toBe(OVERRIDE);
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining(`${CLIENT_IMAGE} -> ${OVERRIDE}`),
    );
  });

  it("ignores an override that is not a valid image reference", () => {
    expect(withAgentImageOverride(CLIENT_IMAGE, "evil; rm -rf /")).toBe(
      CLIENT_IMAGE,
    );
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("DAAX_AGENT_IMAGE_OVERRIDE ignored"),
    );
  });
});

describe("the image a new agent container runs", () => {
  it("is the client's image when no override is set", async () => {
    vi.stubEnv("DAAX_AGENT_IMAGE_OVERRIDE", "");
    await connect({
      mode: "container",
      cwd: "/workspace",
      command: "claude",
      image: CLIENT_IMAGE,
    });
    expect(spawnedImage()).toBe(CLIENT_IMAGE);
  });

  it("is the operator override, which wins over the client's image", async () => {
    vi.stubEnv("DAAX_AGENT_IMAGE_OVERRIDE", OVERRIDE);
    await connect({
      mode: "container",
      cwd: "/workspace",
      command: "claude",
      image: CLIENT_IMAGE,
    });
    // The override is what goes through pull/fallback resolution.
    expect(resolveContainerImage).toHaveBeenCalledWith(OVERRIDE);
    expect(spawnedImage()).toBe(OVERRIDE);
  });

  it("is not applied to docker exec into an existing container", async () => {
    vi.stubEnv("DAAX_AGENT_IMAGE_OVERRIDE", OVERRIDE);
    await connect({
      mode: "container",
      cwd: "/workspace",
      containerName: "daax-12345678",
      image: CLIENT_IMAGE,
    });
    expect(resolveContainerImage).not.toHaveBeenCalled();
    const [cmd, args] = spawn.mock.calls[0] as [string, string[]];
    expect(cmd).toBe("docker");
    expect(args).not.toContain(OVERRIDE);
  });
});
