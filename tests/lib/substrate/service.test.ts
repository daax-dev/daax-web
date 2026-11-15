import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  attachSession,
  createSession,
  endSession,
  getSession,
  isAlreadyRunning,
  listSessions,
  publicReason,
  resumeSession,
  suspendSession,
} from "@/lib/substrate/service";
import { verifyTicket } from "@/lib/ws-ticket";
import { ActorNameTakenError } from "@/server/backends/substrate";
import { ADMIN, ALICE, BOB, makeDeps } from "./fakes";

const SECRET = "s".repeat(64);

describe("createSession", () => {
  it("records the owner, validates egress and provisions in the background", async () => {
    const { deps, backend, store, settle } = makeDeps();
    const res = await createSession(deps, ALICE, {
      agent: "codex",
      egressPresets: ["npm", "github"],
      egressHosts: ["example.org"],
    });
    expect(res.ok && res.status).toBe(202);
    if (!res.ok) return;
    expect(res.body).toMatchObject({
      ownerSubject: "alice-sub",
      agent: "codex",
      sandboxClass: "gvisor",
      template: "codex-gvisor-abc",
      state: "creating",
      egressPresets: ["github", "npm"],
    });
    expect(res.body.egressHosts).toContain("registry.npmjs.org");
    expect(res.body.egressHosts).toContain("example.org");
    await settle();
    expect(backend.spawn).toHaveBeenCalledWith(
      expect.objectContaining({
        actorName: res.body.actorName,
        template: "codex-gvisor-abc",
        egressHosts: res.body.egressHosts,
      }),
    );
    expect((await store.get(res.body.id))?.actorOwned).toBe(true);
    expect((await store.get(res.body.id))?.state).toBe("running");
  });

  it("a provisioning failure tears down the half-made actor and records a public reason", async () => {
    const { deps, backend, store, settle } = makeDeps();
    vi.spyOn(console, "error").mockImplementation(() => {});
    // The actor was created, then a later step failed.
    backend.spawn.mockImplementationOnce(async (spec) => {
      await spec.onActorCreated?.();
      throw new Error(
        "ResourceExhausted: quota; token-file /run/secret/ate endpoint 10.128.0.5:8080",
      );
    });
    const res = await createSession(deps, ALICE, { agent: "claude" });
    await settle();
    if (!res.ok) throw new Error("expected ok");
    const row = await store.get(res.body.id);
    expect(row?.state).toBe("error");
    expect(row?.lastError).toBe(
      "create: the cluster has no capacity for this session",
    );
    expect(row?.lastError).not.toMatch(/token-file|10\.128/);
    expect(backend.stop).toHaveBeenCalledWith(res.body.actorName);
    // An errored session cannot be resumed (its actor may lack a policy).
    const resumed = await resumeSession(deps, ALICE, res.body.id);
    expect(!resumed.ok && resumed.status).toBe(409);
    expect(backend.resume).not.toHaveBeenCalled();
  });

  it("End before the actor exists deletes nothing; the create then cleans up what it made", async () => {
    let finishSpawn!: () => void;
    const { deps, backend, store, settle } = makeDeps();
    backend.spawn.mockImplementationOnce(
      (spec) =>
        new Promise<null>(
          (r) =>
            (finishSpawn = async () => {
              await spec.onActorCreated?.();
              r(null);
            }),
        ),
    );
    const res = await createSession(deps, ALICE, { agent: "claude" });
    if (!res.ok) throw new Error("expected ok");
    // The candidate name may still belong to someone else: End must not
    // touch it before this session's create call has confirmed it. The
    // in-flight create finishes the End (202 `ending`).
    const end = await endSession(deps, ALICE, res.body.id);
    expect(end.ok && end.status).toBe(202);
    expect(end.ok && end.body.state).toBe("ending");
    expect(backend.stop).not.toHaveBeenCalled();
    finishSpawn();
    await settle();
    expect(backend.stop).toHaveBeenCalledTimes(1);
    expect(backend.stop).toHaveBeenCalledWith(res.body.actorName);
    expect((await store.get(res.body.id))?.state).toBe("ended");
  });

  it("a failed cleanup after End leaves a visible, retryable error (never a hidden live actor)", async () => {
    let finishSpawn!: () => void;
    const { deps, backend, store, settle } = makeDeps();
    vi.spyOn(console, "error").mockImplementation(() => {});
    backend.spawn.mockImplementationOnce(
      (spec) =>
        new Promise<null>(
          (r) =>
            (finishSpawn = async () => {
              await spec.onActorCreated?.();
              r(null);
            }),
        ),
    );
    const res = await createSession(deps, ALICE, { agent: "claude" });
    if (!res.ok) throw new Error("expected ok");
    await endSession(deps, ALICE, res.body.id);
    // A repeated End while the create still runs also defers (Codex r5):
    // it must not close the record ahead of the create's cleanup.
    const again = await endSession(deps, ALICE, res.body.id);
    expect(again.ok && again.body.state).toBe("ending");
    expect((await store.get(res.body.id))?.endedAt).toBeNull();
    backend.stop.mockRejectedValueOnce(new Error("unavailable"));
    finishSpawn();
    await settle();
    const row = await store.get(res.body.id);
    expect(row).toMatchObject({
      state: "error",
      actorOwned: true,
      endedAt: null,
    });
    expect((await getSession(deps, ALICE, res.body.id)).ok).toBe(true);
    // End retry (create no longer in flight) deletes the owned actor.
    const retry = await endSession(deps, ALICE, res.body.id);
    expect(retry.ok && retry.body.state).toBe("ended");
    expect(backend.stop).toHaveBeenLastCalledWith(res.body.actorName);
  });

  it("End during a failed create's cleanup is settled when the cleanup succeeds (Codex r6)", async () => {
    const { deps, backend, store, settle } = makeDeps();
    vi.spyOn(console, "error").mockImplementation(() => {});
    backend.spawn.mockImplementationOnce(async (spec) => {
      await spec.onActorCreated?.();
      throw new Error("egress policy rejected");
    });
    let finishCleanup!: () => void;
    let cleanupStarted!: () => void;
    const started = new Promise<void>((r) => (cleanupStarted = r));
    backend.stop.mockImplementationOnce(
      () =>
        new Promise<void>((r) => {
          finishCleanup = r;
          cleanupStarted();
        }),
    );
    const res = await createSession(deps, ALICE, { agent: "claude" });
    if (!res.ok) throw new Error("expected ok");
    await started; // provisioning is inside its cleanup
    const end = await endSession(deps, ALICE, res.body.id);
    expect(end.ok && end.body.state).toBe("ending");
    finishCleanup();
    await settle();
    expect((await store.get(res.body.id))?.state).toBe("ended");
  });

  it("an End racing the create's final read is not deferred to a finished create (Codex r7)", async () => {
    const { deps, backend, store, settle } = makeDeps();
    vi.spyOn(console, "error").mockImplementation(() => {});
    backend.spawn.mockImplementationOnce(async (spec) => {
      await spec.onActorCreated?.();
      throw new Error("egress policy rejected");
    });
    // Pause provisioning's final read after it captured `error`, and run
    // End before the snapshot is returned.
    const realGet = store.get.bind(store);
    let gets = 0;
    let endDone!: Promise<unknown>;
    vi.spyOn(store, "get").mockImplementation(async (id: string) => {
      const snap = await realGet(id);
      if (snap?.state === "error" && gets++ === 0) {
        endDone = endSession(deps, ALICE, id);
        await endDone;
      }
      return snap;
    });
    const res = await createSession(deps, ALICE, { agent: "claude" });
    if (!res.ok) throw new Error("expected ok");
    await settle();
    const end = (await endDone) as { ok: boolean; body?: { state: string } };
    expect(end.ok && end.body?.state).toBe("ended");
    expect((await realGet(res.body.id))?.state).toBe("ended");
    expect(backend.stop).toHaveBeenLastCalledWith(res.body.actorName);
  });

  it("End during a create that collides never deletes the taken actor", async () => {
    let reject!: (e: Error) => void;
    const { deps, backend, settle } = makeDeps();
    vi.spyOn(console, "error").mockImplementation(() => {});
    backend.spawn.mockImplementationOnce(
      () => new Promise<null>((_r, rj) => (reject = rj)),
    );
    const res = await createSession(deps, ALICE, { agent: "claude" });
    if (!res.ok) throw new Error("expected ok");
    expect((await endSession(deps, ALICE, res.body.id)).ok).toBe(true);
    reject(new ActorNameTakenError(res.body.actorName));
    await settle();
    expect(backend.stop).not.toHaveBeenCalled();
    expect(backend.spawn).toHaveBeenCalledTimes(1); // no fresh-name retry after End
  });

  it("a create failure before the actor exists deletes nothing", async () => {
    const { deps, backend, settle } = makeDeps();
    vi.spyOn(console, "error").mockImplementation(() => {});
    backend.spawn.mockRejectedValueOnce(new Error("permission denied"));
    await createSession(deps, ALICE, { agent: "claude" });
    await settle();
    expect(backend.stop).not.toHaveBeenCalled();
  });

  it.each([
    [{ agent: "kiro" }, "invalid-agent"],
    [{ agent: "claude", sandboxClass: "vm" }, "invalid-class"],
    [{ agent: "claude", egressPresets: ["cargo"] }, "invalid-presets"],
    [{ agent: "claude", egressHosts: ["10.0.0.1"] }, "invalid-egress"],
    [{ agent: "claude", egressHosts: ["x.sslip.io"] }, "invalid-egress"],
    [{ agent: "claude", egressHosts: "github.com" }, "invalid-hosts"],
  ])("rejects %j", async (input, error) => {
    const { deps, backend } = makeDeps();
    const res = await createSession(deps, ALICE, input);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe(error);
    expect(backend.spawn).not.toHaveBeenCalled();
  });

  it("rejects hosts that resolve to private addresses", async () => {
    const { deps } = makeDeps({ resolver: async () => ["10.96.0.1"] });
    const res = await createSession(deps, ALICE, {
      agent: "claude",
      egressHosts: ["sneaky.example.com"],
    });
    expect(!res.ok && res.error).toBe("invalid-egress");
  });

  it("503 when no template is deployed for the agent/class", async () => {
    const { deps } = makeDeps({ template: () => null });
    const res = await createSession(deps, ALICE, { agent: "gemini" });
    expect(!res.ok && res.status).toBe(503);
  });
});

async function seeded() {
  const ctx = makeDeps();
  const a = await createSession(ctx.deps, ALICE, { agent: "claude" });
  const b = await createSession(ctx.deps, BOB, { agent: "codex" });
  await ctx.settle();
  if (!a.ok || !b.ok) throw new Error("seed failed");
  return { ...ctx, alice: a.body, bob: b.body };
}

describe("owner filters", () => {
  it("list shows only the caller's sessions; an admin sees all", async () => {
    const { deps, backend, alice } = await seeded();
    backend.list.mockResolvedValue([
      {
        id: alice.actorName,
        state: "SUSPENDED",
        actor: { name: alice.actorName, template: "t", state: "SUSPENDED" },
      },
    ]);
    const mine = await listSessions(deps, ALICE);
    expect(mine.ok && mine.body.sessions.map((s) => s.ownerSubject)).toEqual([
      "alice-sub",
    ]);
    expect(mine.ok && mine.body.sessions[0].actorState).toBe("SUSPENDED");
    const all = await listSessions(deps, ADMIN);
    expect(all.ok && all.body.sessions).toHaveLength(2);
  });

  it("list still answers when substrate is unreachable", async () => {
    const { deps, backend } = await seeded();
    backend.list.mockRejectedValue(new Error("connection refused"));
    const res = await listSessions(deps, ALICE);
    expect(res.ok && res.body.sessions[0].actorState).toBeUndefined();
  });

  it.each([
    ["get", getSession],
    ["attach", attachSession],
    ["suspend", suspendSession],
    ["resume", resumeSession],
    ["end", endSession],
  ] as const)(
    "%s of another user's session is 404 and touches nothing",
    async (_n, op) => {
      const { deps, backend, bob } = await seeded();
      const res = await op(deps, ALICE, bob.id);
      expect(!res.ok && res.status).toBe(404);
      expect(backend.stop).not.toHaveBeenCalled();
      expect(backend.suspend).not.toHaveBeenCalled();
      expect(backend.resume).not.toHaveBeenCalled();
    },
  );

  it("an admin may end another user's session", async () => {
    const { deps, backend, bob } = await seeded();
    const res = await endSession(deps, ADMIN, bob.id);
    expect(res.ok).toBe(true);
    expect(backend.stop).toHaveBeenCalledWith(bob.actorName);
  });
});

describe("lifecycle", () => {
  it("suspend and resume are explicit and state-checked", async () => {
    const { deps, backend, store, alice } = await seeded();
    expect((await suspendSession(deps, ALICE, alice.id)).ok).toBe(true);
    expect(backend.suspend).toHaveBeenCalledWith(alice.actorName);
    expect((await store.get(alice.id))?.state).toBe("suspended");
    const again = await suspendSession(deps, ALICE, alice.id);
    expect(!again.ok && again.status).toBe(409);
    expect((await resumeSession(deps, ALICE, alice.id)).ok).toBe(true);
    expect(backend.resume).toHaveBeenCalledWith(alice.actorName);
    expect((await store.get(alice.id))?.state).toBe("running");
  });

  it("a failed suspend leaves the session running with the error", async () => {
    const { deps, backend, store, alice } = await seeded();
    vi.spyOn(console, "error").mockImplementation(() => {});
    backend.suspend.mockRejectedValueOnce(new Error("snapshot failed"));
    const res = await suspendSession(deps, ALICE, alice.id);
    expect(!res.ok && res.status).toBe(502);
    const row = await store.get(alice.id);
    expect(row?.state).toBe("running");
    expect(row?.lastError).toMatch(/^suspend: /);
    expect(row?.lastError).not.toMatch(/snapshot failed/);
  });

  it("end is the only kill: deletes actor + policy and hides the session", async () => {
    const { deps, backend, alice } = await seeded();
    expect((await endSession(deps, ALICE, alice.id)).ok).toBe(true);
    expect(backend.stop).toHaveBeenCalledTimes(1);
    expect(backend.stop).toHaveBeenCalledWith(alice.actorName);
    const after = await getSession(deps, ALICE, alice.id);
    expect(!after.ok && after.status).toBe(404);
  });

  it("a failed end keeps the record (state error) so End can be retried", async () => {
    const { deps, backend, store, alice } = await seeded();
    vi.spyOn(console, "error").mockImplementation(() => {});
    backend.stop.mockRejectedValueOnce(new Error("api unavailable"));
    expect((await endSession(deps, ALICE, alice.id)).ok).toBe(false);
    expect((await store.get(alice.id))?.state).toBe("error");
    expect((await endSession(deps, ALICE, alice.id)).ok).toBe(true);
  });
});

describe("Codex round 1 fixes", () => {
  it("a name collision moves the session to a fresh name; End never touches the taken one", async () => {
    const { deps, backend, store, settle } = makeDeps();
    vi.spyOn(console, "error").mockImplementation(() => {});
    backend.spawn.mockRejectedValueOnce(new ActorNameTakenError("taken"));
    const res = await createSession(deps, ALICE, { agent: "claude" });
    await settle();
    if (!res.ok) throw new Error("expected ok");
    const taken = res.body.actorName;
    const calls = backend.spawn.mock.calls as unknown as Array<
      [{ actorName: string }]
    >;
    expect(calls).toHaveLength(2);
    const fresh = calls[1][0].actorName;
    expect(fresh).not.toBe(taken);
    const row = await store.get(res.body.id);
    expect(row).toMatchObject({ state: "running", actorName: fresh });
    expect(backend.stop).not.toHaveBeenCalled();
    expect((await endSession(deps, ALICE, res.body.id)).ok).toBe(true);
    expect(backend.stop).toHaveBeenCalledTimes(1);
    expect(backend.stop).toHaveBeenCalledWith(fresh);
    expect(backend.stop).not.toHaveBeenCalledWith(taken);
  });

  it("if every name collides, the record closes without any substrate call", async () => {
    const { deps, backend, store, settle } = makeDeps();
    vi.spyOn(console, "error").mockImplementation(() => {});
    backend.spawn.mockRejectedValue(new ActorNameTakenError("taken"));
    const res = await createSession(deps, ALICE, { agent: "claude" });
    await settle();
    if (!res.ok) throw new Error("expected ok");
    expect(backend.spawn).toHaveBeenCalledTimes(3);
    expect((await store.get(res.body.id))?.state).toBe("ended");
    const end = await endSession(deps, ALICE, res.body.id);
    expect(!end.ok && end.status).toBe(404);
    expect(backend.stop).not.toHaveBeenCalled();
  });

  it.each(["suspending", "resuming"] as const)(
    "a session stuck in %s (web restart) can still be ended",
    async (stuck) => {
      const { deps, backend, store, alice } = await seeded();
      await store.setState(alice.id, stuck);
      expect((await endSession(deps, ALICE, alice.id)).ok).toBe(true);
      expect(backend.stop).toHaveBeenCalledWith(alice.actorName);
    },
  );

  it("a suspend completing after End began cannot revive the session", async () => {
    const { deps, backend, store, alice } = await seeded();
    let finish!: () => void;
    backend.suspend.mockImplementationOnce(
      () => new Promise<void>((r) => (finish = r)),
    );
    const suspending = suspendSession(deps, ALICE, alice.id);
    await new Promise((r) => setTimeout(r, 0));
    expect((await endSession(deps, ALICE, alice.id)).ok).toBe(true);
    finish();
    const res = await suspending;
    expect(res.ok).toBe(false);
    expect((await store.get(alice.id))?.state).toBe("ended");
  });
});

describe("failure reporting", () => {
  it("only an explicit already-running reply counts as a successful resume", async () => {
    expect(isAlreadyRunning(new Error("actor is already running"))).toBe(true);
    expect(isAlreadyRunning(new Error("actor not running"))).toBe(false);
    expect(isAlreadyRunning(new Error("failed to reach running state"))).toBe(
      false,
    );
    const { deps, backend, store, alice } = await seeded();
    vi.spyOn(console, "error").mockImplementation(() => {});
    await suspendSession(deps, ALICE, alice.id);
    backend.resume.mockRejectedValueOnce(
      new Error("failed to reach running state"),
    );
    const res = await resumeSession(deps, ALICE, alice.id);
    expect(!res.ok && res.status).toBe(502);
    expect((await store.get(alice.id))?.state).toBe("suspended");
  });

  it("never returns raw kubectl-ate stderr to the user", async () => {
    const { deps, backend, alice } = await seeded();
    vi.spyOn(console, "error").mockImplementation(() => {});
    backend.stop.mockRejectedValueOnce(
      new Error(
        "rpc error: dial tcp 10.128.0.5:8080 via /home/u/.kube-substrate/config",
      ),
    );
    const res = await endSession(deps, ALICE, alice.id);
    expect(!res.ok && res.message).toBe(
      "the substrate operation failed (see server logs)",
    );
    expect(publicReason(new Error("timed out after 30000ms"))).toMatch(
      /timed out/,
    );
  });
});

describe("attachSession", () => {
  const saved = process.env.DAAX_WS_TOKEN_SECRET;
  beforeEach(() => {
    process.env.DAAX_WS_TOKEN_SECRET = SECRET;
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.DAAX_WS_TOKEN_SECRET;
    else process.env.DAAX_WS_TOKEN_SECRET = saved;
  });

  it("mints a ticket carrying the session's substrate claim for the owner", async () => {
    const { deps, alice } = await seeded();
    const res = await attachSession(deps, ALICE, alice.id);
    if (!res.ok) throw new Error(res.message);
    expect(res.body.query).toEqual({
      mode: "substrate",
      session: alice.id,
      actor: alice.actorName,
    });
    const v = verifyTicket(res.body.ticket!.token);
    expect(v.valid && v.payload).toMatchObject({
      sub: "alice-sub",
      substrate: { session: alice.id, actor: alice.actorName },
    });
    expect(v.valid && v.payload.hostShell).toBeUndefined();
  });

  it("never auto-resumes: a suspended session is 409", async () => {
    const { deps, backend, alice } = await seeded();
    await suspendSession(deps, ALICE, alice.id);
    const res = await attachSession(deps, ALICE, alice.id);
    expect(!res.ok && res.status).toBe(409);
    expect(backend.resume).not.toHaveBeenCalled();
  });

  it("without ticketing only the local operator gets a (ticketless) grant", async () => {
    delete process.env.DAAX_WS_TOKEN_SECRET;
    const { deps, store } = makeDeps();
    const op = { subject: "local", isAdmin: true, operator: true };
    const created = await createSession(deps, op, { agent: "claude" });
    if (!created.ok) throw new Error("seed");
    await store.setState(created.body.id, "running");
    const res = await attachSession(deps, op, created.body.id);
    expect(res.ok && res.body.ticket).toBeUndefined();
    const other = await createSession(deps, ALICE, { agent: "claude" });
    if (!other.ok) throw new Error("seed");
    await store.setState(other.body.id, "running");
    const denied = await attachSession(deps, ALICE, other.body.id);
    expect(!denied.ok && denied.status).toBe(503);
  });
});
