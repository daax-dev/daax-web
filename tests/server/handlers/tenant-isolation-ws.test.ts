/**
 * Cross-tenant access on the WS plane (dx#119).
 *
 * Drives the real upgrade authentication (ws-auth.ts, real HMAC tickets), the
 * real connection handler and the real message handler on a CONTAINER-mode
 * daax, with the pty, session store, container-owner lookup, credential dirs
 * and recorder stood in. User A, user B and an admin connect with tickets the
 * way the app mints them (signed perms / admin / settings claims).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IncomingMessage } from "http";
import type { WebSocket } from "ws";

// Container mode is decided from HOST_WORKSPACE_PATH (read at module load by
// server/config/constants) plus /.dockerenv.
vi.hoisted(() => {
  process.env.HOST_WORKSPACE_PATH = "/srv/ws";
});
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  // /.dockerenv → container mode; /workspace/.daax exists (as it does in a
  // real container-mode workspace).
  const existsSync = (path: import("node:fs").PathLike) =>
    path === "/.dockerenv" || path === "/workspace/.daax"
      ? true
      : actual.existsSync(path);
  return { ...actual, existsSync, default: { ...actual, existsSync } };
});

const h = vi.hoisted(() => {
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
    owners: new Map<string, string | null>(),
    aliases: new Map<string, string>(),
    validPathCalls: [] as Array<[string, string]>,
    recordings: [] as Array<{ id: string; owner?: string }>,
    startRecording: vi.fn((..._a: unknown[]) => "rec-new"),
    deleteRecording: vi.fn(() => true),
  };
});

vi.mock("@/server/sessions/pty-loader", () => ({
  getPty: () => ({ spawn: h.spawn }),
}));
vi.mock("@/server/sessions/session-manager", () => ({
  setSession: vi.fn(),
  deleteSession: vi.fn(),
  getSession: vi.fn(),
  hasSession: () => true,
}));
vi.mock("@/lib/worktree-manager", () => ({
  // Stand-in for the real canonical check: translate the host workspace
  // (/srv/ws) to the container namespace (/workspace), resolve the "symlink"
  // aliases in h.aliases, then test containment on a separator boundary.
  isValidPath: (p: string, base: string) => {
    h.validPathCalls.push([p, base]);
    const canon = (x: string) => {
      const t = x
        .replace(/^\/srv\/ws(?=\/|$)/, "/workspace")
        .replace(/\/+$/, "");
      return h.aliases.get(t) ?? t;
    };
    const c = canon(p);
    const b = canon(base);
    return c === b || c.startsWith(b + "/");
  },
  resolveWorkspaceRoot: () => "/workspace",
}));
vi.mock("@/server/docker/image-manager", () => ({
  resolveContainerImage: (image: string) => image,
  DEFAULT_CONTAINER_IMAGE: "daax-agent:test",
}));
vi.mock("@/server/docker/container-owner", () => ({
  lookupContainerOwner: async (name: string) =>
    h.owners.has(name) ? { owner: h.owners.get(name) ?? null } : null,
}));
vi.mock("@/server/docker/auth-paths", () => ({
  getUserAuthPaths: (owner: string) => ({
    claudeHostPath: `/srv/ws/.daax/users/${owner}/claude`,
    openCodeHostPath: `/srv/ws/.daax/users/${owner}/opencode`,
    legacy: false,
  }),
}));
vi.mock("@/server/recording/recorder", () => ({
  startRecording: h.startRecording,
  stopRecording: vi.fn(),
  recordOutput: vi.fn(),
  recordInput: vi.fn(),
  listRecordings: () => h.recordings,
  getRecording: (id: string) => {
    const meta = h.recordings.find((r) => r.id === id);
    return meta ? { metadata: meta, content: "" } : null;
  },
  deleteRecording: h.deleteRecording,
}));

import { handleConnection } from "@/server/handlers/connection-handler";
import { handleAttentionBridge } from "@/server/handlers/attention-bridge";
import { _resetSeenJti } from "@/server/handlers/ws-auth";
import { mintTicket, type TicketClaims } from "@/lib/ws-ticket";
import { permissionsForRoles } from "@/lib/rbac/permissions";

const A = "aaaaaaaa-0000-4000-8000-00000000000a";
const B = "bbbbbbbb-0000-4000-8000-00000000000b";
const ADMIN = "cccccccc-0000-4000-8000-00000000000c";
const ORIGIN = "https://daax.galway.poley.dev";

const userTicket = (sub: string, extra: TicketClaims = {}) =>
  mintTicket(sub, undefined, {
    perms: permissionsForRoles(["user"]),
    ...extra,
  }).token;
const adminTicket = (extra: TicketClaims = {}) =>
  mintTicket(ADMIN, undefined, {
    perms: permissionsForRoles(["admin"]),
    admin: true,
    hostShell: true,
    ...extra,
  }).token;

type MockWs = {
  send: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  readyState: number;
};

async function connect(opts: {
  ticket?: string;
  query?: Record<string, string>;
  headers?: Record<string, string>;
  remoteAddress?: string;
}): Promise<MockWs> {
  const ws: MockWs = {
    send: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    close: vi.fn(),
    readyState: 1,
  };
  const headers: Record<string, string> = { origin: ORIGIN, ...opts.headers };
  if (opts.ticket) {
    headers["sec-websocket-protocol"] = `daax-ws-ticket, ${opts.ticket}`;
  }
  const req = {
    url: `/?${new URLSearchParams({
      mode: "container",
      cwd: "/workspace/repo",
      ...opts.query,
    })}`,
    socket: { remoteAddress: opts.remoteAddress ?? "172.18.0.1" },
    headers,
  } as unknown as IncomingMessage;
  await handleConnection(ws as unknown as WebSocket, req);
  return ws;
}

/** Send a client message through the handler's registered listener. */
function sendMsg(ws: MockWs, msg: unknown) {
  const listener = ws.on.mock.calls.find((c) => c[0] === "message")?.[1];
  expect(listener).toBeTypeOf("function");
  listener(JSON.stringify(msg));
}

function lastSent(ws: MockWs, type: string) {
  const sent = ws.send.mock.calls
    .map((c) => JSON.parse(c[0] as string))
    .filter((m) => m.type === type);
  return sent[sent.length - 1];
}

const runArgs = () => h.spawn.mock.calls[0][1] as string[];

beforeEach(() => {
  vi.useFakeTimers();
  h.spawn.mockClear();
  h.pty.write.mockClear();
  h.pty.onData.mockClear();
  h.startRecording.mockClear();
  h.deleteRecording.mockClear();
  h.owners.clear();
  h.validPathCalls.length = 0;
  h.aliases.clear();
  h.owners.set("daax-aaaaaaaa", A);
  h.owners.set("daax-bbbbbbbb", B);
  h.owners.set("daax-postgres", null);
  h.recordings = [
    { id: "rec-a", owner: A },
    { id: "rec-b", owner: B },
    { id: "rec-legacy" },
  ];
  _resetSeenJti();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.stubEnv("DAAX_ADMIN_USERS", ADMIN);
  vi.stubEnv("DAAX_WS_TOKEN_SECRET", "ws-token-secret-value");
  vi.stubEnv("DAAX_REQUIRE_AUTH", "");
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("terminal:exec on the WS plane", () => {
  it("a ticket without signed permissions (pre-#119) is refused", async () => {
    const ws = await connect({ ticket: mintTicket(A).token });
    expect(ws.close).toHaveBeenCalledWith(
      1008,
      "terminal refused: terminal:exec not granted",
    );
    expect(h.spawn).not.toHaveBeenCalled();
  });

  it("a bare forwarded non-admin (no ticket, so no roles) is refused", async () => {
    const ws = await connect({
      headers: { "x-forwarded-user": A },
      remoteAddress: "127.0.0.1",
    });
    expect(ws.close).toHaveBeenCalledWith(
      1008,
      "terminal refused: a terminal ticket is required",
    );
    expect(h.spawn).not.toHaveBeenCalled();
  });

  it("a ticket for a different subject than the forwarded one is refused", async () => {
    const ws = await connect({
      ticket: userTicket(B),
      headers: { "x-forwarded-user": A },
      remoteAddress: "127.0.0.1",
    });
    expect(ws.close).toHaveBeenCalledWith(1008, "unauthorized");
    expect(h.spawn).not.toHaveBeenCalled();
  });
});

describe("container ownership", () => {
  it("a new container is labelled with its owner and mounts that owner's credentials", async () => {
    const ws = await connect({ ticket: userTicket(A) });
    expect(ws.close).not.toHaveBeenCalled();
    const args = runArgs();
    expect(args[0]).toBe("run");
    expect(args).toContain(`daax.owner=${A}`);
    expect(args).toContain(
      `/srv/ws/.daax/users/${A}/claude:/home/vscode/.claude`,
    );
    expect(args.join(" ")).not.toContain("/.daax/claude:");
  });

  it.each(["daax-bbbbbbbb", "daax-postgres", "daax-gone0000"])(
    "A exec-ing into %s is refused as not found, and nothing is spawned",
    async (containerName) => {
      const ws = await connect({
        ticket: userTicket(A),
        query: { containerName },
      });
      expect(ws.close).toHaveBeenCalledWith(1008, "container not found");
      expect(h.spawn).not.toHaveBeenCalled();
    },
  );

  it("A exec-s into their own container", async () => {
    const ws = await connect({
      ticket: userTicket(A),
      query: { containerName: "daax-aaaaaaaa" },
    });
    expect(ws.close).not.toHaveBeenCalled();
    expect(runArgs()).toEqual([
      "exec",
      "-it",
      "daax-aaaaaaaa",
      "/bin/bash",
      "-l",
    ]);
  });

  it("the admin exec-s into B's and into unlabelled containers", async () => {
    for (const containerName of ["daax-bbbbbbbb", "daax-postgres"]) {
      h.spawn.mockClear();
      const ws = await connect({
        ticket: adminTicket(),
        query: { containerName },
      });
      expect(ws.close).not.toHaveBeenCalled();
      expect(runArgs()).toContain(containerName);
    }
  });

  it("messages sent during the ownership lookup are not lost", async () => {
    const ws: MockWs = {
      send: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      close: vi.fn(),
      readyState: 1,
    };
    const req = {
      url: `/?${new URLSearchParams({ mode: "container", cwd: "/workspace/repo", containerName: "daax-aaaaaaaa" })}`,
      socket: { remoteAddress: "172.18.0.1" },
      headers: {
        origin: ORIGIN,
        "sec-websocket-protocol": `daax-ws-ticket, ${userTicket(A)}`,
      },
    } as unknown as IncomingMessage;
    const pending = handleConnection(ws as unknown as WebSocket, req);
    // The buffering listener is registered synchronously, before the await.
    const early = ws.on.mock.calls.find((c) => c[0] === "message")?.[1];
    early(JSON.stringify({ type: "input", data: "early" }));
    await pending;
    expect(h.pty.write).toHaveBeenCalledWith("early");
  });
});

describe("local shells in container mode", () => {
  it("are refused for a user", async () => {
    const ws = await connect({
      ticket: userTicket(A),
      query: { mode: "local" },
    });
    expect(ws.close).toHaveBeenCalledWith(
      1008,
      "terminal refused: local shells are admin-only",
    );
    expect(h.spawn).not.toHaveBeenCalled();
  });

  it("are allowed for the admin", async () => {
    const ws = await connect({
      ticket: adminTicket(),
      query: { mode: "shell-tmux" },
    });
    expect(ws.close).not.toHaveBeenCalled();
    expect(h.spawn.mock.calls[0][0]).toBe("tmux");
  });
});

describe("server-side settings from the ticket", () => {
  it("a locked image replaces the requested one", async () => {
    await connect({
      ticket: userTicket(A, {
        settings: { containerImage: "daax-agent:approved" },
        locked: ["containerImage"],
      }),
      query: { image: "attacker/image:latest" },
    });
    expect(runArgs()).toContain("daax-agent:approved");
    expect(runArgs()).not.toContain("attacker/image:latest");
  });

  it("an unlocked image follows the request", async () => {
    await connect({
      ticket: userTicket(A, {
        settings: { containerImage: "daax-agent:default" },
        locked: [],
      }),
      query: { image: "daax-agent:mine" },
    });
    expect(runArgs()).toContain("daax-agent:mine");
  });

  it("locked skip-permissions=false strips the flag from the agent command", async () => {
    await connect({
      ticket: userTicket(A, {
        settings: { claudeSkipPermissions: false },
        locked: ["claudeSkipPermissions"],
      }),
      query: { command: "claude --dangerously-skip-permissions" },
    });
    vi.advanceTimersByTime(2000);
    const typed = h.pty.write.mock.calls.map((c) => String(c[0])).join("");
    expect(typed).toContain("claude");
    expect(typed).not.toContain("--dangerously-skip-permissions");
  });

  it("an admin-set mountRoot confines the user's mounts to that subtree", async () => {
    const ticket = () =>
      userTicket(A, {
        settings: { mountRoot: "users/a" },
        locked: ["mountRoot"],
      });
    const outside = await connect({ ticket: ticket() });
    expect(outside.close).toHaveBeenCalledWith(1008, "Path not allowed");
    expect(h.spawn).not.toHaveBeenCalled();

    const inside = await connect({
      ticket: ticket(),
      query: {
        cwd: "/workspace/users/a/repo",
        mount: "/workspace/users/a/repo",
      },
    });
    expect(inside.close).not.toHaveBeenCalled();
    expect(h.spawn).toHaveBeenCalledTimes(1);
  });

  it("an alias (symlink) of the workspace root still gets .daax shadowed", async () => {
    h.aliases.set("/workspace/repo/rootlink", "/workspace");
    await connect({
      ticket: userTicket(A),
      query: {
        cwd: "/workspace/repo/rootlink",
        mount: "/workspace/repo/rootlink",
      },
    });
    expect(runArgs()).toContain("type=tmpfs,destination=/workspace/.daax");
  });

  it("a mount that does not contain .daax gets no shadow", async () => {
    await connect({ ticket: userTicket(A) });
    expect(runArgs().join(" ")).not.toContain("tmpfs");
  });

  it("a whole-workspace mount shadows .daax (every tenant's credentials)", async () => {
    await connect({
      ticket: userTicket(A),
      query: { cwd: "/workspace", mount: "/workspace" },
    });
    expect(runArgs()).toContain("type=tmpfs,destination=/workspace/.daax");
  });
});

describe("credential stores under .daax", () => {
  it.each(["/workspace/.daax/users/bbbbbbbb/claude", "/workspace/.daax"])(
    "a user mounting %s is refused (another tenant's credentials)",
    async (mount) => {
      const ws = await connect({
        ticket: userTicket(A),
        query: { cwd: mount, mount },
      });
      expect(ws.close).toHaveBeenCalledWith(1008, "Path not allowed");
      expect(h.spawn).not.toHaveBeenCalled();
    },
  );

  it("the admin may mount it", async () => {
    const ws = await connect({
      ticket: adminTicket(),
      query: { cwd: "/workspace/.daax", mount: "/workspace/.daax" },
    });
    expect(ws.close).not.toHaveBeenCalled();
  });
});

describe("a bare forwarded admin when ticketing is configured", () => {
  it("is refused: the signed claims are the only authority", async () => {
    const ws = await connect({
      headers: { "x-forwarded-user": ADMIN },
      remoteAddress: "127.0.0.1",
    });
    expect(ws.close).toHaveBeenCalledWith(
      1008,
      "terminal refused: a terminal ticket is required",
    );
    expect(h.spawn).not.toHaveBeenCalled();
  });
});

describe("recordings over the WS message channel", () => {
  it("A lists only their own; the admin lists all", async () => {
    const wsA = await connect({ ticket: userTicket(A) });
    sendMsg(wsA, { type: "listRecordings" });
    expect(
      lastSent(wsA, "recordingsList").recordings.map(
        (r: { id: string }) => r.id,
      ),
    ).toEqual(["rec-a"]);

    const wsAdmin = await connect({ ticket: adminTicket() });
    sendMsg(wsAdmin, { type: "listRecordings" });
    expect(lastSent(wsAdmin, "recordingsList").recordings).toHaveLength(3);
  });

  it("A reading B's recording gets null (indistinguishable from missing)", async () => {
    const ws = await connect({ ticket: userTicket(A) });
    sendMsg(ws, { type: "getRecording", id: "rec-b" });
    expect(lastSent(ws, "recordingData").recording).toBeNull();
    sendMsg(ws, { type: "getRecording", id: "rec-a" });
    expect(lastSent(ws, "recordingData").recording.metadata.id).toBe("rec-a");
  });

  it("A deleting B's recording fails and nothing is deleted", async () => {
    const ws = await connect({ ticket: userTicket(A) });
    sendMsg(ws, { type: "deleteRecording", id: "rec-b" });
    expect(lastSent(ws, "recordingDeleted").success).toBe(false);
    expect(h.deleteRecording).not.toHaveBeenCalled();
  });

  it("a recording is stamped with its owner", async () => {
    await connect({ ticket: userTicket(A), query: { record: "true" } });
    const onData = h.pty.onData.mock.calls[0][0] as (d: string) => void;
    onData("hello");
    expect(h.startRecording).toHaveBeenCalled();
    expect(h.startRecording.mock.calls[0][6]).toBe(A);
  });

  it("without recording:write nothing is recorded", async () => {
    const ws = await connect({
      ticket: mintTicket(A, undefined, { perms: ["terminal:exec"] }).token,
      query: { record: "true" },
    });
    const onData = h.pty.onData.mock.calls[0][0] as (d: string) => void;
    onData("hello");
    sendMsg(ws, { type: "startRecording" });
    expect(h.startRecording).not.toHaveBeenCalled();
  });
});

describe("the attention stream", () => {
  it("is refused for a user (every agent's live events, no owner to filter)", () => {
    const client = {
      send: vi.fn(),
      on: vi.fn(),
      close: vi.fn(),
      readyState: 1,
    };
    const req = {
      url: "/?stream=attention",
      socket: { remoteAddress: "172.18.0.1" },
      headers: {
        origin: ORIGIN,
        "sec-websocket-protocol": `daax-ws-ticket, ${userTicket(A)}`,
      },
    } as unknown as IncomingMessage;
    handleAttentionBridge(client as unknown as WebSocket, req);
    expect(client.close).toHaveBeenCalledWith(
      1008,
      "attention stream is admin-only",
    );
  });
});
