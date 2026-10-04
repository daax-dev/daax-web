/**
 * /api/workers/[id]/runs and /api/workers/runs/[runId] route tests.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import {
  RUN_ID,
  WORKER_ID,
  runFixture,
  workerFixture,
} from "./workers-fixtures";

const m = vi.hoisted(() => {
  class RunConflictError extends Error {
    constructor(public readonly workerId: string) {
      super("Worker already has a run in progress");
    }
  }
  return {
    RunConflictError,
    requireAuth: vi.fn(),
    requireRole: vi.fn(),
    isDbConfigured: vi.fn(() => true),
    getWorker: vi.fn(),
    createRun: vi.fn(),
    listRuns: vi.fn(),
    getRun: vi.fn(),
    listRunEvents: vi.fn(),
    kick: vi.fn(),
    cancel: vi.fn(),
    isExecuting: vi.fn(() => false),
    failRunningRun: vi.fn(),
  };
});

vi.mock("@/lib/auth", () => ({
  requireAuth: m.requireAuth,
  requireRole: m.requireRole,
}));
vi.mock("@/lib/db/config", () => ({ isDbConfigured: m.isDbConfigured }));
vi.mock("@/lib/workers/store", () => ({
  RunConflictError: m.RunConflictError,
  getWorker: m.getWorker,
  createRun: m.createRun,
  listRuns: m.listRuns,
  getRun: m.getRun,
  listRunEvents: m.listRunEvents,
  failRunningRun: m.failRunningRun,
}));
vi.mock("@/lib/workers/scheduler", () => ({
  getScheduler: () => ({
    kick: m.kick,
    cancel: m.cancel,
    isExecuting: m.isExecuting,
    isLeader: () => false,
  }),
}));

import {
  GET as runsGET,
  POST as runsPOST,
} from "@/app/api/workers/[id]/runs/route";
import {
  GET as runGET,
  DELETE as runDELETE,
} from "@/app/api/workers/runs/[runId]/route";

const USER = { username: "op", authenticated: true };

const req = (url: string, method = "GET", body?: unknown) =>
  new Request(`http://localhost${url}`, {
    method,
    headers:
      body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const ctx = (id = WORKER_ID) => ({ params: Promise.resolve({ id }) });
const runCtx = (runId = RUN_ID) => ({ params: Promise.resolve({ runId }) });

beforeEach(() => {
  vi.clearAllMocks();
  m.isDbConfigured.mockReturnValue(true);
  m.requireAuth.mockResolvedValue({ authenticated: true, user: USER });
  m.requireRole.mockResolvedValue({
    authorized: true,
    user: USER,
    subject: null,
  });
});

describe("auth / availability", () => {
  it("401 when unauthenticated", async () => {
    const response = NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
    m.requireAuth.mockResolvedValue({ authenticated: false, response });
    m.requireRole.mockResolvedValue({ authorized: false, response });
    for (const r of await Promise.all([
      runsGET(req("/x"), ctx()),
      runsPOST(req("/x", "POST", {}), ctx()),
      runGET(req("/x"), runCtx()),
      runDELETE(req("/x", "DELETE"), runCtx()),
    ])) {
      expect(r.status).toBe(401);
    }
    expect(m.createRun).not.toHaveBeenCalled();
    expect(m.cancel).not.toHaveBeenCalled();
  });

  it("run mutations require workers:run (403 when denied)", async () => {
    m.requireRole.mockResolvedValue({
      authorized: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    });
    expect((await runsPOST(req("/x", "POST", {}), ctx())).status).toBe(403);
    expect((await runDELETE(req("/x", "DELETE"), runCtx())).status).toBe(403);
    expect(m.requireRole.mock.calls.map((c) => c[0])).toEqual([
      "workers:run",
      "workers:run",
    ]);
    expect(m.createRun).not.toHaveBeenCalled();
    expect(m.cancel).not.toHaveBeenCalled();
  });

  it("503 when Postgres is not configured", async () => {
    m.isDbConfigured.mockReturnValue(false);
    expect((await runsPOST(req("/x", "POST", {}), ctx())).status).toBe(503);
    expect((await runGET(req("/x"), runCtx())).status).toBe(503);
  });
});

describe("POST /api/workers/[id]/runs", () => {
  it("queues an ad hoc run (202) and kicks the scheduler", async () => {
    const worker = workerFixture();
    m.getWorker.mockResolvedValue(worker);
    m.createRun.mockResolvedValue(runFixture({ input: "what's blocked?" }));
    const res = await runsPOST(
      req("/x", "POST", { input: " what's blocked? " }),
      ctx("tpm"),
    );
    expect(res.status).toBe(202);
    expect(m.createRun).toHaveBeenCalledWith(
      worker,
      "adhoc",
      "what's blocked?",
      "op",
    );
    expect(m.kick).toHaveBeenCalledTimes(1);
    expect((await res.json()).run.id).toBe(RUN_ID);
  });

  it("accepts an empty body (defaults) and a voice trigger", async () => {
    m.getWorker.mockResolvedValue(workerFixture());
    m.createRun.mockResolvedValue(runFixture());
    expect((await runsPOST(req("/x", "POST"), ctx())).status).toBe(202);
    expect(m.createRun.mock.calls[0].slice(1, 3)).toEqual(["adhoc", ""]);
    await runsPOST(req("/x", "POST", { trigger: "voice", input: "hi" }), ctx());
    expect(m.createRun.mock.calls[1][1]).toBe("voice");
  });

  it("409 on RunConflictError, without kicking", async () => {
    m.getWorker.mockResolvedValue(workerFixture());
    m.createRun.mockRejectedValue(new m.RunConflictError(WORKER_ID));
    const res = await runsPOST(req("/x", "POST", {}), ctx());
    expect(res.status).toBe(409);
    expect(m.kick).not.toHaveBeenCalled();
  });

  it("400 on invalid trigger; 404 on unknown worker", async () => {
    expect(
      (await runsPOST(req("/x", "POST", { trigger: "schedule" }), ctx()))
        .status,
    ).toBe(400);
    m.getWorker.mockResolvedValue(null);
    expect((await runsPOST(req("/x", "POST", {}), ctx())).status).toBe(404);
    expect(m.createRun).not.toHaveBeenCalled();
  });
});

describe("GET /api/workers/[id]/runs", () => {
  it.each([
    ["", 20],
    ["?limit=5", 5],
    ["?limit=1000", 100],
    ["?limit=-3", 20],
    ["?limit=abc", 20],
  ])("limit %s → %i", async (qs, limit) => {
    m.getWorker.mockResolvedValue(workerFixture());
    m.listRuns.mockResolvedValue([]);
    const res = await runsGET(req(`/api/workers/tpm/runs${qs}`), ctx("tpm"));
    expect(res.status).toBe(200);
    expect(m.listRuns).toHaveBeenCalledWith(WORKER_ID, limit);
  });
});

describe("GET /api/workers/runs/[runId]", () => {
  it("400 on a non-uuid run id, before the store is touched", async () => {
    for (const bad of ["abc", "../../etc", `${RUN_ID}x`]) {
      expect((await runGET(req("/x"), runCtx(bad))).status).toBe(400);
      expect((await runDELETE(req("/x", "DELETE"), runCtx(bad))).status).toBe(
        400,
      );
    }
    expect(m.getRun).not.toHaveBeenCalled();
  });

  it("returns the run and events after ?after", async () => {
    m.getRun.mockResolvedValue(runFixture({ status: "running" }));
    m.listRunEvents.mockResolvedValue([{ seq: 4 }]);
    const res = await runGET(
      req(`/api/workers/runs/${RUN_ID}?after=3`),
      runCtx(),
    );
    expect(res.status).toBe(200);
    expect(m.listRunEvents).toHaveBeenCalledWith(RUN_ID, 3, 500);
    const body = await res.json();
    expect(body.events).toEqual([{ seq: 4 }]);
    expect(body.hasMore).toBe(false);
    await runGET(req(`/api/workers/runs/${RUN_ID}?after=zz`), runCtx());
    expect(m.listRunEvents).toHaveBeenLastCalledWith(RUN_ID, -1, 500);
    await runGET(req(`/api/workers/runs/${RUN_ID}?after=-7`), runCtx());
    expect(m.listRunEvents).toHaveBeenLastCalledWith(RUN_ID, -1, 500);
  });

  it("hasMore is true when a full page of events comes back", async () => {
    m.getRun.mockResolvedValue(runFixture({ status: "succeeded" }));
    m.listRunEvents.mockResolvedValue(
      Array.from({ length: 500 }, (_, i) => ({ seq: i })),
    );
    const res = await runGET(req(`/api/workers/runs/${RUN_ID}`), runCtx());
    expect((await res.json()).hasMore).toBe(true);
  });

  it("404 on unknown run", async () => {
    m.getRun.mockResolvedValue(null);
    expect((await runGET(req("/x"), runCtx())).status).toBe(404);
  });
});

describe("DELETE /api/workers/runs/[runId]", () => {
  it.each(["succeeded", "failed", "cancelled", "timeout"] as const)(
    "409 when the run is already %s",
    async (status) => {
      m.getRun.mockResolvedValue(runFixture({ status }));
      const res = await runDELETE(req("/x", "DELETE"), runCtx());
      expect(res.status).toBe(409);
      expect((await res.json()).error).toBe(`Run already ${status}`);
      expect(m.cancel).not.toHaveBeenCalled();
    },
  );

  it("cancels a queued/running run", async () => {
    m.getRun.mockResolvedValue(runFixture({ status: "queued" }));
    m.cancel.mockResolvedValue(true);
    const res = await runDELETE(req("/x", "DELETE"), runCtx());
    expect(res.status).toBe(200);
    expect(m.cancel).toHaveBeenCalledWith(RUN_ID);
  });

  it("a run executing on another instance is cancelled via the persisted request", async () => {
    m.getRun.mockResolvedValue(runFixture({ status: "running" }));
    m.cancel.mockResolvedValue(true);
    const res = await runDELETE(req("/x", "DELETE"), runCtx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ cancelled: true });
  });

  it("409 when the run is no longer active (finished between read and cancel)", async () => {
    m.getRun.mockResolvedValue(runFixture({ status: "running" }));
    m.cancel.mockResolvedValue(false);
    const res = await runDELETE(req("/x", "DELETE"), runCtx());
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("Run is no longer active");
  });

  it("?force=1 needs workers:manage and force-releases a locked running run", async () => {
    m.getRun.mockResolvedValue(runFixture({ status: "running" }));
    m.failRunningRun.mockResolvedValue(true);
    const res = await runDELETE(req("/x?force=1", "DELETE"), runCtx());
    expect(m.requireRole).toHaveBeenLastCalledWith(
      "workers:manage",
      expect.anything(),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ released: true });
    expect(m.failRunningRun).toHaveBeenCalledWith(
      RUN_ID,
      expect.stringMatching(/^force-released by /),
    );
    expect(m.cancel).not.toHaveBeenCalled();
  });

  it("?force=1 refuses a run this instance is executing (cancel it instead)", async () => {
    m.getRun.mockResolvedValue(runFixture({ status: "running" }));
    m.isExecuting.mockReturnValueOnce(true);
    const res = await runDELETE(req("/x?force=1", "DELETE"), runCtx());
    expect(res.status).toBe(409);
    expect(m.failRunningRun).not.toHaveBeenCalled();
  });

  it("plain cancel needs only workers:run", async () => {
    m.getRun.mockResolvedValue(runFixture({ status: "queued" }));
    m.cancel.mockResolvedValue(true);
    await runDELETE(req("/x", "DELETE"), runCtx());
    expect(m.requireRole).toHaveBeenLastCalledWith(
      "workers:run",
      expect.anything(),
    );
  });

  it("404 on unknown run", async () => {
    m.getRun.mockResolvedValue(null);
    expect((await runDELETE(req("/x", "DELETE"), runCtx())).status).toBe(404);
  });
});
