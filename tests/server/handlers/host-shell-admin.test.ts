/**
 * Only an admin may open a terminal on a HOST-mode daax.
 *
 * In host mode — anything but a Docker container (/.dockerenv) with
 * HOST_WORKSPACE_PATH set — every terminal is host-privileged: a non-container
 * one (Agent View "Resume here" among them) is a real shell as the operator,
 * and a container one is docker run/exec against the host's socket. Before
 * this, any identity the forward-auth proxy admitted got one. This drives the real
 * upgrade authentication and the real handler (pty, sessions and path
 * confinement stood in) with literal subjects, and reads whether a pty was
 * spawned and what the socket was closed with.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IncomingMessage } from "http";
import type { WebSocket } from "ws";

// Whether /.dockerenv exists, as the code under test sees it. Every other path
// goes to the real filesystem.
const { docker } = vi.hoisted(() => ({ docker: { present: false } }));
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  const existsSync = (path: import("node:fs").PathLike) =>
    path === "/.dockerenv" ? docker.present : actual.existsSync(path);
  return { ...actual, existsSync, default: { ...actual, existsSync } };
});

const { spawn } = vi.hoisted(() => {
  const pty = {
    onData: vi.fn(),
    onExit: vi.fn(),
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    pid: 4242,
  };
  return { spawn: vi.fn((..._args: unknown[]) => pty) };
});

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
import { _resetSeenJti } from "@/server/handlers/ws-auth";
import { mintTicket } from "@/lib/ws-ticket";

const ADMIN = "62d9d61c-cae1-49d0-aa94-ff34091199b7";
const OTHER = "0b7c4a1e-5f3d-4e2a-9c81-7d6e5f4a3b21";
const ORIGIN = "https://daax.galway.poley.dev";

function connect(opts: {
  mode: string;
  containerName?: string;
  headers?: Record<string, string>;
  remoteAddress?: string;
  ticket?: string;
}) {
  const ws = { send: vi.fn(), on: vi.fn(), close: vi.fn(), readyState: 1 };
  const headers: Record<string, string> = { origin: ORIGIN, ...opts.headers };
  if (opts.ticket)
    headers["sec-websocket-protocol"] = `daax-ws-ticket, ${opts.ticket}`;
  const req = {
    url: `/?${new URLSearchParams({
      mode: opts.mode,
      cwd: "/home/dev/prj/repo",
      ...(opts.containerName ? { containerName: opts.containerName } : {}),
    })}`,
    socket: { remoteAddress: opts.remoteAddress ?? "127.0.0.1" },
    headers,
  } as unknown as IncomingMessage;
  handleConnection(ws as unknown as WebSocket, req);
  vi.advanceTimersByTime(1000);
  return ws;
}

beforeEach(() => {
  vi.useFakeTimers();
  spawn.mockClear();
  _resetSeenJti();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.stubEnv("HOST_WORKSPACE_PATH", "");
  docker.present = false;
  vi.stubEnv("DAAX_ADMIN_USERS", `${ADMIN} jason.poley@gmail.com jpoley`);
  vi.stubEnv("DAAX_WS_TOKEN_SECRET", "ws-token-secret-value");
  vi.stubEnv("DAAX_REQUIRE_AUTH", "");
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("host shell over the forwarded-identity path", () => {
  it("an admin subject gets a host shell", () => {
    const ws = connect({
      mode: "local",
      headers: { "x-forwarded-user": ADMIN },
    });
    expect(ws.close).not.toHaveBeenCalled();
    expect(spawn.mock.calls[0][0]).toBe("/bin/zsh");
  });

  it("a username or email in DAAX_ADMIN_USERS is not enough: only the subject counts", () => {
    // Username and email are attributes a user may be able to set, so a
    // non-admin claiming the operator's is refused.
    const ws = connect({
      mode: "local",
      headers: {
        "x-forwarded-user": OTHER,
        "x-forwarded-username": "jpoley",
        "x-forwarded-email": "jason.poley@gmail.com",
      },
    });
    expect(ws.close).toHaveBeenCalledWith(
      1008,
      "host terminal refused: not in DAAX_ADMIN_USERS",
    );
    expect(spawn).not.toHaveBeenCalled();
  });

  it("a subject entry matches case-insensitively", () => {
    const ws = connect({
      mode: "local",
      headers: { "x-forwarded-user": ADMIN.toUpperCase() },
    });
    expect(ws.close).not.toHaveBeenCalled();
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it("a non-admin is refused with the reason, and nothing is spawned", () => {
    const ws = connect({
      mode: "local",
      headers: {
        "x-forwarded-user": OTHER,
        "x-forwarded-username": "mallory",
        "x-forwarded-email": "mallory@example.com",
      },
    });
    expect(ws.close).toHaveBeenCalledWith(
      1008,
      "host terminal refused: not in DAAX_ADMIN_USERS",
    );
    expect(spawn).not.toHaveBeenCalled();
  });

  it.each(["shell-tmux", "bogus"])(
    "mode=%s is a host shell too and is refused for a non-admin",
    (mode) => {
      const ws = connect({ mode, headers: { "x-forwarded-user": OTHER } });
      expect(ws.close).toHaveBeenCalledWith(
        1008,
        "host terminal refused: not in DAAX_ADMIN_USERS",
      );
      expect(spawn).not.toHaveBeenCalled();
    },
  );

  it.each(["", "jason.poley@gmail.com jpoley"])(
    "DAAX_ADMIN_USERS=%j names no subject and refuses even the operator's own",
    (list) => {
      vi.stubEnv("DAAX_ADMIN_USERS", list);
      const ws = connect({
        mode: "local",
        headers: {
          "x-forwarded-user": ADMIN,
          "x-forwarded-username": "jpoley",
          "x-forwarded-email": "jason.poley@gmail.com",
        },
      });
      expect(ws.close).toHaveBeenCalledWith(
        1008,
        "host terminal refused: DAAX_ADMIN_USERS names no subject UUID, so no one is an admin",
      );
      expect(spawn).not.toHaveBeenCalled();
    },
  );
});

describe("container terminals on a host-mode daax", () => {
  it("a non-admin's new container (docker run on the host socket) is refused", () => {
    const ws = connect({
      mode: "container",
      headers: { "x-forwarded-user": OTHER },
    });
    expect(ws.close).toHaveBeenCalledWith(
      1008,
      "host terminal refused: not in DAAX_ADMIN_USERS",
    );
    expect(spawn).not.toHaveBeenCalled();
  });

  it("a non-admin's docker exec into a named container is refused", () => {
    const ws = connect({
      mode: "container",
      containerName: "daax-postgres",
      headers: { "x-forwarded-user": OTHER },
    });
    expect(ws.close).toHaveBeenCalledWith(
      1008,
      "host terminal refused: not in DAAX_ADMIN_USERS",
    );
    expect(spawn).not.toHaveBeenCalled();
  });

  it("an admin gets a new container", () => {
    const ws = connect({
      mode: "container",
      headers: { "x-forwarded-user": ADMIN },
    });
    expect(ws.close).not.toHaveBeenCalled();
    expect(spawn.mock.calls[0][0]).toBe("docker");
    expect(spawn.mock.calls[0][1]).toContain("run");
  });

  it("an admin gets docker exec into a named container", () => {
    const ws = connect({
      mode: "container",
      containerName: "daax-postgres",
      headers: { "x-forwarded-user": ADMIN },
    });
    expect(ws.close).not.toHaveBeenCalled();
    expect(spawn.mock.calls[0][0]).toBe("docker");
    expect(spawn.mock.calls[0][1]).toEqual([
      "exec",
      "-it",
      "daax-postgres",
      "/bin/bash",
      "-l",
    ]);
  });
});

describe("host shell over the ticket path", () => {
  it("a ticket minted with the claim for an admin gets a host shell", () => {
    const { token } = mintTicket(ADMIN, undefined, { hostShell: true });
    const ws = connect({
      mode: "local",
      remoteAddress: "100.64.0.5",
      ticket: token,
    });
    expect(ws.close).not.toHaveBeenCalled();
    expect(spawn.mock.calls[0][0]).toBe("/bin/zsh");
  });

  it("a ticket without the claim is refused even for an admin subject", () => {
    const { token } = mintTicket(ADMIN);
    const ws = connect({
      mode: "local",
      remoteAddress: "100.64.0.5",
      ticket: token,
    });
    expect(ws.close).toHaveBeenCalledWith(
      1008,
      "host terminal refused: ticket was not minted for an admin",
    );
    expect(spawn).not.toHaveBeenCalled();
  });

  it("the claim is re-checked at connect: a non-admin carrying it is refused", () => {
    // The app minted it while OTHER was an admin; DAAX_ADMIN_USERS no longer
    // names OTHER, and the terminal server's list is the one that counts.
    const { token } = mintTicket(OTHER, undefined, { hostShell: true });
    const ws = connect({
      mode: "local",
      remoteAddress: "100.64.0.5",
      ticket: token,
    });
    expect(ws.close).toHaveBeenCalledWith(
      1008,
      "host terminal refused: not in DAAX_ADMIN_USERS",
    );
    expect(spawn).not.toHaveBeenCalled();
  });

  it("a local-operator ticket is honoured, as the operator is on the HTTP plane", () => {
    vi.stubEnv("DAAX_ADMIN_USERS", "");
    const { token } = mintTicket("local", undefined, {
      hostShell: true,
      operator: true,
    });
    const ws = connect({
      mode: "local",
      remoteAddress: "100.64.0.5",
      ticket: token,
    });
    expect(ws.close).not.toHaveBeenCalled();
    expect(spawn.mock.calls[0][0]).toBe("/bin/zsh");
  });

  it("under DAAX_REQUIRE_AUTH=1 a local-operator ticket is refused", () => {
    vi.stubEnv("DAAX_REQUIRE_AUTH", "1");
    const { token } = mintTicket("local", undefined, {
      hostShell: true,
      operator: true,
    });
    const ws = connect({
      mode: "local",
      remoteAddress: "100.64.0.5",
      ticket: token,
    });
    expect(ws.close).toHaveBeenCalledWith(
      1008,
      "host terminal refused: operator tickets are not honoured under DAAX_REQUIRE_AUTH=1",
    );
    expect(spawn).not.toHaveBeenCalled();
  });

  it("a non-admin ticket is refused a docker exec into a named container", () => {
    const { token } = mintTicket(OTHER);
    const ws = connect({
      mode: "container",
      containerName: "daax-postgres",
      remoteAddress: "100.64.0.5",
      ticket: token,
    });
    expect(ws.close).toHaveBeenCalledWith(
      1008,
      "host terminal refused: ticket was not minted for an admin",
    );
    expect(spawn).not.toHaveBeenCalled();
  });

  it("an admin ticket gets a docker exec into a named container", () => {
    const { token } = mintTicket(ADMIN, undefined, { hostShell: true });
    const ws = connect({
      mode: "container",
      containerName: "daax-postgres",
      remoteAddress: "100.64.0.5",
      ticket: token,
    });
    expect(ws.close).not.toHaveBeenCalled();
    expect(spawn.mock.calls[0][1]).toContain("exec");
  });
});

describe("unchanged postures", () => {
  it("the loopback local operator (host-dev, no credentials) keeps its host shell", () => {
    vi.stubEnv("DAAX_ADMIN_USERS", "");
    const ws = connect({ mode: "local" });
    expect(ws.close).not.toHaveBeenCalled();
    expect(spawn.mock.calls[0][0]).toBe("/bin/zsh");
  });

  it("a loopback upgrade carrying X-Forwarded-For is not the local operator", () => {
    // It came through a proxy whose identity header is missing.
    vi.stubEnv("DAAX_ADMIN_USERS", "");
    const ws = connect({
      mode: "local",
      headers: { "x-forwarded-for": "203.0.113.7" },
    });
    expect(ws.close).toHaveBeenCalledWith(1008, "unauthorized");
    expect(spawn).not.toHaveBeenCalled();
  });

  it("HOST_WORKSPACE_PATH on a process outside Docker does not make it container mode", () => {
    vi.stubEnv("HOST_WORKSPACE_PATH", "/home/dev/prj");
    docker.present = false;
    const ws = connect({
      mode: "local",
      headers: { "x-forwarded-user": OTHER },
    });
    expect(ws.close).toHaveBeenCalledWith(
      1008,
      "host terminal refused: not in DAAX_ADMIN_USERS",
    );
    expect(spawn).not.toHaveBeenCalled();
  });

  it("inside Docker without HOST_WORKSPACE_PATH it is still host mode", () => {
    docker.present = true;
    const ws = connect({
      mode: "container",
      headers: { "x-forwarded-user": OTHER },
    });
    expect(ws.close).toHaveBeenCalledWith(
      1008,
      "host terminal refused: not in DAAX_ADMIN_USERS",
    );
    expect(spawn).not.toHaveBeenCalled();
  });

  it("in container mode a non-admin's local shell runs as before", () => {
    vi.stubEnv("HOST_WORKSPACE_PATH", "/home/dev/prj");
    docker.present = true;
    const ws = connect({
      mode: "local",
      headers: { "x-forwarded-user": OTHER },
    });
    expect(ws.close).not.toHaveBeenCalled();
    expect(spawn.mock.calls[0][0]).toBe("/bin/zsh");
  });

  it.each([undefined, "daax-postgres"])(
    "in container mode a non-admin's container terminal (containerName=%s) runs as before",
    (containerName) => {
      vi.stubEnv("HOST_WORKSPACE_PATH", "/home/dev/prj");
      docker.present = true;
      const ws = connect({
        mode: "container",
        containerName,
        headers: { "x-forwarded-user": OTHER },
      });
      expect(ws.close).not.toHaveBeenCalled();
      expect(spawn.mock.calls[0][0]).toBe("docker");
    },
  );
});
