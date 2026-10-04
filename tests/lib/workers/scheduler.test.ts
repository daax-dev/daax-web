import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";

const st = vi.hoisted(() => {
  class RunConflictError extends Error {}
  return {
    RunConflictError,
    cancelQueuedRun: vi.fn(),
    cancelRequestedAmong: vi.fn(),
    countAutomaticRunsSince: vi.fn(),
    createRun: vi.fn(),
    failRunningRun: vi.fn(),
    lastRunsByWorker: vi.fn(),
    listQueuedRuns: vi.fn(),
    listRunningRuns: vi.fn(),
    listWorkers: vi.fn(),
    pruneRuns: vi.fn(),
    requestCancel: vi.fn(),
  };
});
const cli = vi.hoisted(() => ({
  stopHostRunAndWait: vi.fn(async (_id: string, _ref: string) => undefined),
  stopExecutionAndWait: vi.fn(async (_ref: string) => undefined),
  removeLabelledContainers: vi.fn(),
  resolveExecutor: vi.fn(() => "host"),
  stopExecution: vi.fn(),
}));
const { getClient, spawnSync } = vi.hoisted(() => ({
  getClient: vi.fn(),
  spawnSync: vi.fn(),
}));
vi.mock("@/lib/db/pg", () => ({ getClient, query: vi.fn() }));
vi.mock("@/lib/workers/runner", () => ({ executeRun: vi.fn() }));
vi.mock("@/lib/workers/store", () => st);
vi.mock("@/lib/workers/cli-runner", () => cli);
vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return { ...actual, default: { ...actual, spawnSync }, spawnSync };
});

import {
  WorkerScheduler,
  automaticTriggerDue,
  nextCronRun,
  nextRunAt,
} from "@/lib/workers/scheduler";
import type { RunStatus, Worker } from "@/types/workers";

const at = (s: string) => new Date(s);
const sched = {
  enabled: true,
  runMode: "schedule" as const,
  cron: "0 8 * * *",
  cooldownSeconds: 900,
};
const cont = {
  enabled: true,
  runMode: "continuous" as const,
  cron: null,
  cooldownSeconds: 900,
};
const run = (
  status: RunStatus,
  finishedAt: string | null,
  queuedAt = "2026-09-26T07:00:00Z",
) => ({
  status,
  finishedAt,
  queuedAt,
});

describe("nextCronRun", () => {
  it("returns the next UTC fire strictly after `after`, null for invalid", () => {
    expect(
      nextCronRun("0 8 * * *", at("2026-09-26T07:59:00Z"))?.toISOString(),
    ).toBe("2026-09-26T08:00:00.000Z");
    expect(
      nextCronRun("0 8 * * *", at("2026-09-26T08:00:00Z"))?.toISOString(),
    ).toBe("2026-09-27T08:00:00.000Z");
    expect(nextCronRun("garbage", new Date())).toBeNull();
  });
});

describe("automaticTriggerDue", () => {
  it("schedule: due when a fire time falls in (lastEvaluated, now]", () => {
    expect(
      automaticTriggerDue(
        sched,
        null,
        at("2026-09-26T07:59:30Z"),
        at("2026-09-26T08:00:00Z"),
      ),
    ).toBe(true);
    expect(
      automaticTriggerDue(
        sched,
        null,
        at("2026-09-26T07:59:30Z"),
        at("2026-09-26T08:00:10Z"),
      ),
    ).toBe(true);
  });

  it("schedule: not due before the fire time or once it was already evaluated", () => {
    expect(
      automaticTriggerDue(
        sched,
        null,
        at("2026-09-26T07:00:00Z"),
        at("2026-09-26T07:59:59Z"),
      ),
    ).toBe(false);
    expect(
      automaticTriggerDue(
        sched,
        null,
        at("2026-09-26T08:00:00Z"),
        at("2026-09-26T08:00:30Z"),
      ),
    ).toBe(false);
  });

  it("schedule without cron / with invalid cron is never due", () => {
    const now = at("2026-09-26T08:00:00Z");
    const before = at("2026-09-26T07:00:00Z");
    expect(
      automaticTriggerDue({ ...sched, cron: null }, null, before, now),
    ).toBe(false);
    expect(
      automaticTriggerDue({ ...sched, cron: "nope" }, null, before, now),
    ).toBe(false);
  });

  it("disabled workers and adhoc workers are never due", () => {
    const now = at("2026-09-26T08:00:00Z");
    const before = at("2026-09-26T07:00:00Z");
    expect(
      automaticTriggerDue({ ...sched, enabled: false }, null, before, now),
    ).toBe(false);
    expect(
      automaticTriggerDue({ ...cont, enabled: false }, null, before, now),
    ).toBe(false);
    expect(
      automaticTriggerDue({ ...cont, runMode: "adhoc" }, null, before, now),
    ).toBe(false);
  });

  it.each(["queued", "running"] as const)(
    "an active (%s) run blocks both modes",
    (status) => {
      const now = at("2026-09-26T08:00:00Z");
      const before = at("2026-09-26T07:00:00Z");
      expect(automaticTriggerDue(sched, run(status, null), before, now)).toBe(
        false,
      );
      expect(
        automaticTriggerDue(
          cont,
          run(status, null, "2026-09-20T00:00:00Z"),
          before,
          now,
        ),
      ).toBe(false);
    },
  );

  it("continuous: due with no prior run, then after the cooldown", () => {
    const now = at("2026-09-26T08:00:00Z");
    expect(automaticTriggerDue(cont, null, now, now)).toBe(true);
    // finished 14m59s ago, cooldown 15m → not due
    expect(
      automaticTriggerDue(
        cont,
        run("succeeded", "2026-09-26T07:45:01Z"),
        now,
        now,
      ),
    ).toBe(false);
    // exactly 15m → due
    expect(
      automaticTriggerDue(
        cont,
        run("failed", "2026-09-26T07:45:00Z"),
        now,
        now,
      ),
    ).toBe(true);
    // falls back to queuedAt when finishedAt is null
    expect(
      automaticTriggerDue(
        cont,
        run("cancelled", null, "2026-09-26T07:50:00Z"),
        now,
        now,
      ),
    ).toBe(false);
  });
});

describe("nextRunAt", () => {
  const now = at("2026-09-26T07:00:00Z");
  it("schedule → next cron fire; disabled/adhoc → null", () => {
    expect(nextRunAt(sched, null, now)).toBe("2026-09-26T08:00:00.000Z");
    expect(nextRunAt({ ...sched, enabled: false }, null, now)).toBeNull();
    expect(nextRunAt({ ...cont, runMode: "adhoc" }, null, now)).toBeNull();
    expect(nextRunAt({ ...sched, cron: "bad" }, null, now)).toBeNull();
  });
  it("continuous → now with no run, null while active, else finish + cooldown", () => {
    expect(nextRunAt(cont, null, now)).toBe(now.toISOString());
    expect(nextRunAt(cont, run("running", null), now)).toBeNull();
    expect(nextRunAt(cont, run("succeeded", "2026-09-26T06:50:00Z"), now)).toBe(
      "2026-09-26T07:05:00.000Z",
    );
  });
});

type Internals = {
  started: boolean;
  inFlight: Map<string, AbortController>;
  leaderSince: Date;
  tick(): Promise<void>;
  createDueRuns(now: Date): Promise<void>;
};
// Tests drive tick() directly; mark the scheduler started as start() would
// (without the interval timer).
const internals = (s: WorkerScheduler) => {
  const i = s as unknown as Internals;
  i.started = true;
  return i;
};

function lockClient(locked = true) {
  const client = Object.assign(new EventEmitter(), {
    query: vi.fn(async (sql: string) =>
      sql.includes("pg_try_advisory_lock")
        ? { rows: [{ ok: locked }] }
        : { rows: [] },
    ),
    release: vi.fn(),
  });
  getClient.mockResolvedValue(client);
  return client;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  cli.resolveExecutor.mockReturnValue("host");
  st.cancelRequestedAmong.mockResolvedValue([]);
  st.listRunningRuns.mockResolvedValue([]);
  st.failRunningRun.mockResolvedValue(true);
  st.listWorkers.mockResolvedValue([]);
  st.lastRunsByWorker.mockResolvedValue(new Map());
  st.listQueuedRuns.mockResolvedValue([]);
  st.pruneRuns.mockResolvedValue(0);
});

describe("WorkerScheduler.cancel", () => {
  it("aborts an in-flight run on this instance without touching the store", async () => {
    const s = new WorkerScheduler();
    const controller = new AbortController();
    internals(s).inFlight.set("r1", controller);
    await expect(s.cancel("r1")).resolves.toBe(true);
    expect(controller.signal.aborted).toBe(true);
    expect(st.cancelQueuedRun).not.toHaveBeenCalled();
    expect(st.requestCancel).not.toHaveBeenCalled();
  });

  it("cancels a queued run through the store", async () => {
    st.cancelQueuedRun.mockResolvedValue({ id: "r2", status: "cancelled" });
    await expect(new WorkerScheduler().cancel("r2")).resolves.toBe(true);
    expect(st.cancelQueuedRun).toHaveBeenCalledWith("r2");
    expect(st.requestCancel).not.toHaveBeenCalled();
    expect(getClient).not.toHaveBeenCalled();
  });

  it("persists a cancel request for a run executing elsewhere", async () => {
    st.cancelQueuedRun.mockResolvedValue(null);
    st.requestCancel.mockResolvedValue(true);
    await expect(new WorkerScheduler().cancel("r3")).resolves.toBe(true);
    expect(st.requestCancel).toHaveBeenCalledWith("r3");
  });

  it("returns false when the run is no longer active", async () => {
    st.cancelQueuedRun.mockResolvedValue(null);
    st.requestCancel.mockResolvedValue(false);
    await expect(new WorkerScheduler().cancel("r4")).resolves.toBe(false);
  });
});

describe("WorkerScheduler leadership", () => {
  it("becomes leader after recovery, and aborts in-flight runs if the lock connection errors", async () => {
    const client = lockClient(true);
    st.listRunningRuns.mockResolvedValue([{ id: "old", executorRef: null }]);
    const s = new WorkerScheduler();
    await internals(s).tick();
    expect(s.isLeader()).toBe(true);
    expect(st.failRunningRun).toHaveBeenCalledWith("old", expect.any(String));
    expect(client.release).not.toHaveBeenCalled();

    const a = new AbortController();
    const b = new AbortController();
    internals(s).inFlight.set("ra", a);
    internals(s).inFlight.set("rb", b);
    client.emit("error", new Error("connection reset"));
    expect(s.isLeader()).toBe(false);
    expect(a.signal.aborted).toBe(true);
    expect(b.signal.aborted).toBe(true);
  });

  it("does not lead when the lock is held elsewhere (client returned to pool)", async () => {
    const client = lockClient(false);
    const s = new WorkerScheduler();
    await internals(s).tick();
    expect(s.isLeader()).toBe(false);
    expect(client.release).toHaveBeenCalledWith();
    expect(st.failRunningRun).not.toHaveBeenCalled();
    expect(st.listWorkers).not.toHaveBeenCalled();
  });

  it("recovery failure: unlocks, destroys the client, stays follower", async () => {
    const client = lockClient(true);
    const boom = new Error("recovery failed");
    st.listRunningRuns.mockRejectedValue(boom);
    const s = new WorkerScheduler();
    await internals(s).tick();
    expect(s.isLeader()).toBe(false);
    expect(client.query).toHaveBeenCalledWith(
      "SELECT pg_advisory_unlock($1::bigint)",
      expect.any(Array),
    );
    expect(client.release).toHaveBeenCalledWith(boom);
    expect(client.listenerCount("error")).toBe(0);
    expect(st.listWorkers).not.toHaveBeenCalled();
    expect(st.listQueuedRuns).not.toHaveBeenCalled();
  });

  it("releases each orphan only after its execution is verified stopped", async () => {
    lockClient(true);
    cli.resolveExecutor.mockReturnValue("container");
    st.listRunningRuns.mockResolvedValue([
      { id: "r1", executorRef: "container:daax-w-abcd" },
      { id: "r2", executorRef: "host:4242|Sat Sep 26 15:08:14 2026" },
      { id: "r3", executorRef: "host:pending" },
      // No ref: the reference is written before any spawn, so nothing ran.
      { id: "r4", executorRef: null },
    ]);
    const order: string[] = [];
    cli.stopExecutionAndWait.mockImplementation(async (ref: string) => {
      order.push(`stop ${ref}`);
    });
    cli.stopHostRunAndWait.mockImplementation(
      async (id: string, ref: string) => {
        order.push(`stop-host ${id} ${ref}`);
      },
    );
    st.failRunningRun.mockImplementation(async (id: string) => {
      order.push(`fail ${id}`);
      return true;
    });
    await internals(new WorkerScheduler()).tick();
    expect(cli.removeLabelledContainers).toHaveBeenCalledTimes(1);
    expect(order).toEqual([
      "stop container:daax-w-abcd",
      "fail r1",
      "stop-host r2 host:4242|Sat Sep 26 15:08:14 2026",
      "fail r2",
      "stop-host r3 host:pending",
      "fail r3",
      "fail r4",
    ]);
  });

  it("does not take leadership when labelled containers cannot be listed", async () => {
    lockClient(true);
    cli.resolveExecutor.mockReturnValue("container");
    cli.removeLabelledContainers.mockImplementation(() => {
      throw new Error("cannot list worker containers: daemon down");
    });
    const s = new WorkerScheduler();
    await internals(s).tick();
    expect(s.isLeader()).toBe(false);
    expect(st.failRunningRun).not.toHaveBeenCalled();
    cli.removeLabelledContainers.mockReset();
  });

  it("keeps a run active (exclusion holds) while its cleanup cannot be verified, and retries each tick", async () => {
    lockClient(true);
    st.listRunningRuns.mockResolvedValue([
      { id: "stuck", executorRef: "host:4242|T" },
    ]);
    cli.stopHostRunAndWait.mockRejectedValue(
      new Error("process group 4242 is alive but carries no marker"),
    );
    const s = new WorkerScheduler();
    await internals(s).tick();
    expect(s.isLeader()).toBe(true);
    expect(st.failRunningRun).not.toHaveBeenCalled();
    await internals(s).tick();
    expect(cli.stopHostRunAndWait).toHaveBeenCalledTimes(2);
    cli.stopHostRunAndWait.mockResolvedValue(undefined);
    await internals(s).tick();
    expect(st.failRunningRun).toHaveBeenCalledWith("stuck", expect.any(String));
    cli.stopHostRunAndWait.mockReset();
  });

  it("never reconciles a run this instance is executing", async () => {
    lockClient(true);
    const s = new WorkerScheduler();
    internals(s).inFlight.set("mine", new AbortController());
    st.listRunningRuns.mockResolvedValue([{ id: "mine", executorRef: null }]);
    await internals(s).tick();
    expect(st.failRunningRun).not.toHaveBeenCalled();
  });

  it("WORKERS_SCHEDULER=off: an instance that was never started neither leads nor executes, even when kicked", async () => {
    lockClient(true);
    const s = new WorkerScheduler(); // start() never called
    s.kick();
    await (s as unknown as Internals).tick();
    expect(getClient).not.toHaveBeenCalled();
    expect(s.isLeader()).toBe(false);
  });

  it("applies persisted cancel requests to runs executing here", async () => {
    lockClient(true);
    const s = new WorkerScheduler();
    await internals(s).tick();
    const mine = new AbortController();
    const other = new AbortController();
    internals(s).inFlight.set("mine", mine);
    internals(s).inFlight.set("other", other);
    st.cancelRequestedAmong.mockResolvedValue(["mine"]);
    await internals(s).tick();
    expect(st.cancelRequestedAmong).toHaveBeenLastCalledWith(["mine", "other"]);
    expect(mine.signal.aborted).toBe(true);
    expect(other.signal.aborted).toBe(false);
  });
});

describe("WorkerScheduler per-worker schedule cursor", () => {
  const worker = (id: string): Worker =>
    ({
      id,
      slug: id,
      enabled: true,
      runMode: "schedule",
      cron: "0 8 * * *",
      cooldownSeconds: 900,
      maxRunsPerDay: 10,
      engine: "claude-cli",
    }) as Worker;

  it("a failure for worker B does not re-fire worker A on the next pass", async () => {
    const A = worker("A");
    const B = worker("B");
    st.listWorkers.mockResolvedValue([A, B]);
    st.createRun.mockResolvedValue({});
    st.countAutomaticRunsSince
      .mockResolvedValueOnce(0) // pass 1, A
      .mockRejectedValueOnce(new Error("db blip")) // pass 1, B
      .mockResolvedValue(0); // pass 2, B
    const s = new WorkerScheduler();
    internals(s).leaderSince = new Date("2026-09-26T07:59:00Z");

    await internals(s).createDueRuns(new Date("2026-09-26T08:00:10Z"));
    await internals(s).createDueRuns(new Date("2026-09-26T08:00:40Z"));

    expect(st.createRun.mock.calls.map((c) => (c[0] as Worker).id)).toEqual([
      "A",
      "B",
    ]);
    expect(st.createRun).toHaveBeenCalledWith(B, "schedule", "", "scheduler");

    // Both cursors advanced: a third pass fires nothing.
    await internals(s).createDueRuns(new Date("2026-09-26T08:01:10Z"));
    expect(st.createRun).toHaveBeenCalledTimes(2);
  });

  it("a RunConflictError advances the cursor (no retry storm)", async () => {
    const A = worker("A");
    st.listWorkers.mockResolvedValue([A]);
    st.countAutomaticRunsSince.mockResolvedValue(0);
    st.createRun.mockRejectedValueOnce(new st.RunConflictError("A"));
    const s = new WorkerScheduler();
    internals(s).leaderSince = new Date("2026-09-26T07:59:00Z");
    await internals(s).createDueRuns(new Date("2026-09-26T08:00:10Z"));
    await internals(s).createDueRuns(new Date("2026-09-26T08:00:40Z"));
    expect(st.createRun).toHaveBeenCalledTimes(1);
  });

  it("respects maxRunsPerDay", async () => {
    st.listWorkers.mockResolvedValue([{ ...worker("A"), maxRunsPerDay: 2 }]);
    st.countAutomaticRunsSince.mockResolvedValue(2);
    const s = new WorkerScheduler();
    internals(s).leaderSince = new Date("2026-09-26T07:59:00Z");
    await internals(s).createDueRuns(new Date("2026-09-26T08:00:10Z"));
    expect(st.createRun).not.toHaveBeenCalled();
  });
});
