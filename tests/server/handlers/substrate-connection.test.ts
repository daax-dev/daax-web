/**
 * Terminal-plane substrate attach (dx#114): a WS close is a detach, never a
 * kill; reattach reuses the same actor stream and recording; nothing is typed
 * into the PTY; authorization comes from the ticket claim.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WebSocket } from "ws";

const rec = vi.hoisted(() => ({
  startRecording: vi.fn((..._args: unknown[]) => "substrate-1-abcdef01"),
  stopRecording: vi.fn(),
  recordOutput: vi.fn(),
  recordInput: vi.fn(),
  flushRecordingBuffer: vi.fn(),
  listRecordings: vi.fn(() => []),
  getRecording: vi.fn(),
  deleteRecording: vi.fn(),
}));
vi.mock("@/server/recording/recorder", () => rec);

import {
  _resetHubs,
  handleSubstrateConnection,
  resolveAttachTarget,
  SubstrateHub,
} from "@/server/handlers/substrate-connection";
import type { IPty } from "@/server/sessions/types";
import type { Principal } from "@/lib/tenancy/ownership";

const SESSION = "6f1c2a9e-1111-4222-8333-444455556666";
const ACTOR = "daax-0123456789";
const OWNER = "0b8d2c1e-aaaa-4bbb-8ccc-ddddeeeeffff";

/** A non-admin tenant as a ticket's signed claims describe it (dx#119). */
const USER: Principal = {
  subject: OWNER,
  operator: false,
  admin: false,
  permissions: ["terminal:exec", "containers:write", "recording:write"],
};
const OPERATOR: Principal = {
  subject: null,
  operator: true,
  admin: true,
  permissions: ["terminal:exec", "recording:write"],
};

function fakePty() {
  const data: Array<(d: string) => void> = [];
  const exit: Array<(e: { exitCode: number }) => void> = [];
  const pty = {
    pid: -1,
    process: "substrate",
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(() => exit.forEach((l) => l({ exitCode: 0 }))),
    onData: (l: (d: string) => void) => data.push(l),
    onExit: (l: (e: { exitCode: number }) => void) => exit.push(l),
    emit: (d: string) => data.forEach((l) => l(d)),
    drop: () => exit.forEach((l) => l({ exitCode: 1 })),
  };
  return pty;
}

function fakeWs() {
  const handlers: Record<string, Array<(...a: unknown[]) => void>> = {};
  const ws = {
    readyState: 1,
    send: vi.fn(),
    close: vi.fn(() => {
      ws.readyState = 3;
    }),
    on: vi.fn((ev: string, fn: (...a: unknown[]) => void) => {
      (handlers[ev] ??= []).push(fn);
    }),
    fire: (ev: string, ...a: unknown[]) =>
      handlers[ev]?.forEach((f) => f(...a)),
  };
  return ws;
}

const sent = (ws: ReturnType<typeof fakeWs>) =>
  ws.send.mock.calls.map((c) => JSON.parse(c[0] as string));

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  _resetHubs();
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("resolveAttachTarget", () => {
  const url = (q: string) => new URL(`ws://x/?mode=substrate&${q}`);
  const ticket = (substrate?: {
    session: string;
    actor: string;
    owner?: string;
  }) => ({
    ok: true as const,
    user: "alice",
    method: "ticket" as const,
    hostShell: { ok: false as const, reason: "x" },
    principal: USER,
    substrate,
  });

  it("a ticket's claim decides the actor; query params cannot redirect it", () => {
    expect(
      resolveAttachTarget(
        ticket({ session: SESSION, actor: ACTOR }),
        url("actor=daax-ffffffffff"),
      ),
    ).toEqual({ ok: true, session: SESSION, actor: ACTOR, owner: null });
    expect(
      resolveAttachTarget(
        ticket({ session: SESSION, actor: ACTOR, owner: OWNER }),
        url(""),
      ),
    ).toEqual({ ok: true, session: SESSION, actor: ACTOR, owner: OWNER });
    expect(
      resolveAttachTarget(
        ticket({ session: SESSION, actor: ACTOR }),
        url("session=00000000-0000-4000-8000-000000000000"),
      ).ok,
    ).toBe(false);
  });

  it("refuses a plain ticket and a forwarded identity", () => {
    expect(resolveAttachTarget(ticket(), url("")).ok).toBe(false);
    expect(
      resolveAttachTarget(
        {
          ok: true,
          user: "u",
          method: "forwarded",
          hostShell: { ok: true },
          principal: USER,
        },
        url(`session=${SESSION}&actor=${ACTOR}`),
      ).ok,
    ).toBe(false);
  });

  it("the local operator attaches by validated session + actor", () => {
    const op = {
      ok: true as const,
      user: "local",
      method: "bypass" as const,
      hostShell: { ok: true as const },
      principal: OPERATOR,
    };
    expect(
      resolveAttachTarget(op, url(`session=${SESSION}&actor=${ACTOR}`)),
    ).toEqual({ ok: true, session: SESSION, actor: ACTOR, owner: "local" });
    expect(
      resolveAttachTarget(op, url(`session=${SESSION}&actor=jimmy`)).ok,
    ).toBe(false);
  });
});

describe("SubstrateHub", () => {
  it("fans one upstream out to every viewer and detaches only when the last leaves", async () => {
    const pty = fakePty();
    const attach = vi.fn(async () => pty as unknown as IPty);
    const hub = new SubstrateHub(SESSION, ACTOR, attach);
    const a = fakeWs();
    const b = fakeWs();
    await hub.join(a as unknown as WebSocket, {
      record: false,
      sessionType: "s",
    });
    await hub.join(b as unknown as WebSocket, {
      record: false,
      sessionType: "s",
    });
    expect(attach).toHaveBeenCalledTimes(1);
    pty.emit("hello");
    expect(sent(a)).toContainEqual({ type: "output", data: "hello" });
    expect(sent(b)).toContainEqual({ type: "output", data: "hello" });
    hub.leave(a as unknown as WebSocket);
    expect(pty.kill).not.toHaveBeenCalled();
    hub.leave(b as unknown as WebSocket);
    expect(pty.kill).toHaveBeenCalledTimes(1); // detach of the stream only
    expect(pty.write).not.toHaveBeenCalled(); // no EOF, no typed command
  });

  it("recording continues across reattaches and while nobody is attached", async () => {
    const pty = fakePty();
    const attach = vi.fn(async () => pty as unknown as IPty);
    const hub = new SubstrateHub(SESSION, ACTOR, attach);
    const first = fakeWs();
    await hub.join(first as unknown as WebSocket, {
      record: true,
      sessionType: "claude",
    });
    pty.emit("one");
    expect(rec.startRecording).toHaveBeenCalledTimes(1);
    expect(rec.startRecording.mock.calls[0][0]).toBe(SESSION);
    hub.leave(first as unknown as WebSocket);
    // Recording: the stream stays open with no viewers (not a kill, not a stop).
    expect(pty.kill).not.toHaveBeenCalled();
    expect(rec.stopRecording).not.toHaveBeenCalled();
    expect(rec.flushRecordingBuffer).toHaveBeenCalledWith(SESSION);
    pty.emit("while-away");
    expect(rec.recordOutput).toHaveBeenCalledWith(SESSION, "while-away");

    const second = fakeWs();
    await hub.join(second as unknown as WebSocket, {
      record: true,
      sessionType: "claude",
    });
    expect(attach).toHaveBeenCalledTimes(1); // same stream, same actor
    expect(sent(second)).toContainEqual({
      type: "recordingStarted",
      recordingId: "substrate-1-abcdef01",
    });
    pty.emit("two");
    expect(rec.startRecording).toHaveBeenCalledTimes(1);
    expect(rec.recordOutput).toHaveBeenCalledWith(SESSION, "one");
    expect(rec.recordOutput).toHaveBeenCalledWith(SESSION, "two");
  });

  it("a viewer who asked to record and left before any output keeps the stream recording", async () => {
    const pty = fakePty();
    const hub = new SubstrateHub(
      SESSION,
      ACTOR,
      async () => pty as unknown as IPty,
    );
    const ws = fakeWs();
    await hub.join(ws as unknown as WebSocket, {
      record: true,
      sessionType: "claude",
    });
    hub.leave(ws as unknown as WebSocket); // before the first output
    expect(pty.kill).not.toHaveBeenCalled();
    pty.emit("unattended");
    expect(rec.startRecording).toHaveBeenCalledTimes(1);
    expect(rec.recordOutput).toHaveBeenCalledWith(SESSION, "unattended");
  });

  it("a viewer who asked to record and left while the stream was still connecting keeps it", async () => {
    const pty = fakePty();
    let resolve!: (p: IPty) => void;
    const hub = new SubstrateHub(
      SESSION,
      ACTOR,
      () => new Promise((r) => (resolve = r)),
    );
    const ws = fakeWs();
    const joined = hub.join(ws as unknown as WebSocket, {
      record: true,
      sessionType: "claude",
    });
    hub.leave(ws as unknown as WebSocket); // before the attach resolves
    resolve(pty as unknown as IPty);
    await joined;
    expect(pty.kill).not.toHaveBeenCalled();
    pty.emit("unattended");
    expect(rec.recordOutput).toHaveBeenCalledWith(SESSION, "unattended");
  });

  it("without a recording the last viewer leaving closes the stream", async () => {
    const pty = fakePty();
    const hub = new SubstrateHub(
      SESSION,
      ACTOR,
      async () => pty as unknown as IPty,
    );
    const ws = fakeWs();
    await hub.join(ws as unknown as WebSocket, {
      record: false,
      sessionType: "s",
    });
    hub.recordingId = undefined;
    hub.leave(ws as unknown as WebSocket);
    expect(pty.kill).toHaveBeenCalledTimes(1);
  });

  it("input sent while the upstream connects is queued, not lost", async () => {
    const pty = fakePty();
    let resolve!: (p: IPty) => void;
    const hub = new SubstrateHub(
      SESSION,
      ACTOR,
      () => new Promise((r) => (resolve = r)),
    );
    const ws = fakeWs();
    const joined = hub.join(ws as unknown as WebSocket, {
      record: false,
      sessionType: "s",
    });
    hub.facade.write("abc");
    resolve(pty as unknown as IPty);
    await joined;
    expect(pty.write).toHaveBeenCalledWith("abc");
  });

  it("a viewer can never kill the session through the facade", () => {
    const hub = new SubstrateHub(
      SESSION,
      ACTOR,
      async () => fakePty() as unknown as IPty,
    );
    expect(() => hub.facade.kill()).not.toThrow();
  });

  it("an upstream loss tells viewers they are detached", async () => {
    const pty = fakePty();
    const hub = new SubstrateHub(
      SESSION,
      ACTOR,
      async () => pty as unknown as IPty,
    );
    const ws = fakeWs();
    await hub.join(ws as unknown as WebSocket, {
      record: false,
      sessionType: "s",
    });
    pty.drop();
    expect(sent(ws)).toContainEqual({
      type: "detached",
      reason: "actor stream closed",
    });
    expect(ws.close).toHaveBeenCalledWith(1000, "detached");
  });
});

describe("handleSubstrateConnection", () => {
  const auth = {
    ok: true as const,
    user: "alice",
    method: "ticket" as const,
    hostShell: { ok: false as const, reason: "x" },
    principal: USER,
    substrate: { session: SESSION, actor: ACTOR, owner: OWNER },
  };

  it("refuses when the backend is disabled", () => {
    const ws = fakeWs();
    handleSubstrateConnection(
      ws as unknown as WebSocket,
      new URL("ws://x/?mode=substrate"),
      auth,
      { ok: false, reason: "disabled" },
    );
    expect(ws.close).toHaveBeenCalledWith(1008, "substrate backend disabled");
  });

  it("attaches, forwards input, and a WS close never stops/suspends the actor", async () => {
    const pty = fakePty();
    const backend = {
      attach: vi.fn(async () => pty as unknown as IPty),
      stop: vi.fn(),
      suspend: vi.fn(),
    };
    const ws = fakeWs();
    handleSubstrateConnection(
      ws as unknown as WebSocket,
      new URL("ws://x/?mode=substrate&command=claude"),
      auth,
      { ok: true, backend } as never,
    );
    await flush();
    expect(backend.attach).toHaveBeenCalledWith(ACTOR, expect.any(Object));
    expect(sent(ws)[0]).toMatchObject({
      type: "session",
      id: SESSION,
      persistent: true,
    });
    ws.fire("message", JSON.stringify({ type: "input", data: "y" }));
    expect(pty.write).toHaveBeenCalledWith("y");
    // A `command` query param is never typed into a substrate PTY.
    expect(pty.write).not.toHaveBeenCalledWith(
      expect.stringContaining("claude"),
    );
    ws.fire("close");
    expect(pty.kill).toHaveBeenCalled();
    expect(backend.stop).not.toHaveBeenCalled();
    expect(backend.suspend).not.toHaveBeenCalled();
    expect(pty.write).not.toHaveBeenCalledWith("\x04");
  });

  it("reports an attach failure and closes 1011", async () => {
    const ws = fakeWs();
    vi.spyOn(console, "error").mockImplementation(() => {});
    handleSubstrateConnection(
      ws as unknown as WebSocket,
      new URL("ws://x/?mode=substrate"),
      auth,
      {
        ok: true,
        backend: {
          attach: async () => {
            throw new Error("tunnel exited");
          },
        },
      } as never,
    );
    await flush();
    await flush();
    expect(sent(ws).at(-1)).toMatchObject({ type: "error" });
    expect(ws.close).toHaveBeenCalledWith(1011, "attach failed");
  });
});

describe("SubstrateHub races (review fixes)", () => {
  it("a stale stream's late close/data never reaches viewers who joined after it", async () => {
    const ptys = [fakePty(), fakePty()];
    // The first stream's close arrives late (not synchronously on kill()).
    ptys[0].kill = vi.fn();
    let i = 0;
    const hub = new SubstrateHub(
      SESSION,
      ACTOR,
      async () => ptys[i++] as unknown as IPty,
    );
    const oldTab = fakeWs();
    await hub.join(oldTab as unknown as WebSocket, {
      record: false,
      sessionType: "s",
    });
    hub.leave(oldTab as unknown as WebSocket); // refresh: old tab gone
    const newTab = fakeWs();
    await hub.join(newTab as unknown as WebSocket, {
      record: false,
      sessionType: "s",
    });
    ptys[0].emit("stale");
    ptys[0].drop(); // the old socket's close finally arrives
    expect(newTab.close).not.toHaveBeenCalled();
    expect(sent(newTab)).not.toContainEqual({ type: "output", data: "stale" });
    ptys[1].emit("fresh");
    expect(sent(newTab)).toContainEqual({ type: "output", data: "fresh" });
  });

  it("an explicit stopRecording is not undone by auto-start", async () => {
    const pty = fakePty();
    const backend = { attach: vi.fn(async () => pty as unknown as IPty) };
    const ws = fakeWs();
    handleSubstrateConnection(
      ws as unknown as WebSocket,
      new URL("ws://x/?mode=substrate&record=true"),
      {
        ok: true,
        user: "alice",
        method: "ticket",
        hostShell: { ok: false, reason: "x" },
        principal: USER,
        substrate: { session: SESSION, actor: ACTOR, owner: OWNER },
      },
      { ok: true, backend } as never,
    );
    await flush();
    pty.emit("a");
    expect(rec.startRecording).toHaveBeenCalledTimes(1);
    ws.fire("message", JSON.stringify({ type: "stopRecording" }));
    await flush();
    pty.emit("b");
    expect(rec.startRecording).toHaveBeenCalledTimes(1);
  });
});

describe("recording ownership (dx#119)", () => {
  const ADMIN: Principal = {
    subject: "ad000000-0000-4000-8000-0000000000ad",
    operator: false,
    admin: true,
    permissions: ["terminal:exec", "recording:write"],
  };
  const adminAuth = {
    ok: true as const,
    user: "root",
    method: "ticket" as const,
    hostShell: { ok: false as const, reason: "x" },
    principal: ADMIN,
    substrate: { session: SESSION, actor: ACTOR, owner: OWNER },
  };

  it("a recording an admin starts on a user's session belongs to the session owner", async () => {
    const pty = fakePty();
    const backend = { attach: vi.fn(async () => pty as unknown as IPty) };
    const ws = fakeWs();
    handleSubstrateConnection(
      ws as unknown as WebSocket,
      new URL("ws://x/?mode=substrate"),
      adminAuth,
      { ok: true, backend } as never,
    );
    await flush();
    ws.fire("message", JSON.stringify({ type: "startRecording" }));
    await flush();
    expect(rec.startRecording).toHaveBeenCalledTimes(1);
    expect(rec.startRecording.mock.calls[0][6]).toBe(OWNER);
  });

  it("an auto-started recording belongs to the session owner too", async () => {
    const pty = fakePty();
    const backend = { attach: vi.fn(async () => pty as unknown as IPty) };
    const ws = fakeWs();
    handleSubstrateConnection(
      ws as unknown as WebSocket,
      new URL("ws://x/?mode=substrate&record=true"),
      adminAuth,
      { ok: true, backend } as never,
    );
    await flush();
    pty.emit("a");
    expect(rec.startRecording.mock.calls[0][6]).toBe(OWNER);
  });

  it("record=true without recording:write does not record", async () => {
    const pty = fakePty();
    const backend = { attach: vi.fn(async () => pty as unknown as IPty) };
    const ws = fakeWs();
    handleSubstrateConnection(
      ws as unknown as WebSocket,
      new URL("ws://x/?mode=substrate&record=true"),
      { ...adminAuth, principal: { ...USER, permissions: ["terminal:exec"] } },
      { ok: true, backend } as never,
    );
    await flush();
    pty.emit("a");
    expect(rec.startRecording).not.toHaveBeenCalled();
  });
});

describe("attach failure reporting", () => {
  it("never sends kubectl-ate stderr to the browser", async () => {
    const ws = fakeWs();
    vi.spyOn(console, "error").mockImplementation(() => {});
    handleSubstrateConnection(
      ws as unknown as WebSocket,
      new URL("ws://x/?mode=substrate"),
      {
        ok: true,
        user: "alice",
        method: "ticket",
        hostShell: { ok: false, reason: "x" },
        principal: USER,
        substrate: { session: SESSION, actor: ACTOR, owner: OWNER },
      },
      {
        ok: true,
        backend: {
          attach: async () => {
            throw new Error(
              "actor tunnel exited during startup: dial tcp 10.128.0.5:8080 token-file /run/secret/ate",
            );
          },
        },
      } as never,
    );
    await flush();
    await flush();
    const err = sent(ws).at(-1);
    expect(err.error).toBe(
      "Could not attach to the session: could not reach the session (is it running?)",
    );
    expect(JSON.stringify(sent(ws))).not.toMatch(/10\.128|token-file/);
  });
});
