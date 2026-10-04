/**
 * /api/workers and /api/workers/[id] (+ goals) route tests.
 * Auth, the Postgres store, the read-model service and the scheduler are mocked.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import { WORKER_ID, workerFixture } from "./workers-fixtures";

const m = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  requireRole: vi.fn(),
  isDbConfigured: vi.fn(() => true),
  getWorker: vi.fn(),
  createWorker: vi.fn(),
  updateWorker: vi.fn(),
  deleteWorker: vi.fn(),
  deleteWorkerIfIdle: vi.fn(),
  listGoals: vi.fn(),
  latestBrief: vi.fn(),
  createGoal: vi.fn(),
  updateGoal: vi.fn(),
  deleteGoal: vi.fn(),
  hasActiveRun: vi.fn(),
  listWorkerSummaries: vi.fn(),
  getWorkerSummary: vi.fn(),
  isLeader: vi.fn(() => true),
}));

vi.mock("@/lib/auth", () => ({
  requireAuth: m.requireAuth,
  requireRole: m.requireRole,
}));
vi.mock("@/lib/db/config", () => ({ isDbConfigured: m.isDbConfigured }));
vi.mock("@/lib/workers/store", () => ({
  RunConflictError: class RunConflictError extends Error {},
  getWorker: m.getWorker,
  createWorker: m.createWorker,
  updateWorker: m.updateWorker,
  deleteWorker: m.deleteWorker,
  deleteWorkerIfIdle: m.deleteWorkerIfIdle,
  listGoals: m.listGoals,
  latestBrief: m.latestBrief,
  createGoal: m.createGoal,
  updateGoal: m.updateGoal,
  deleteGoal: m.deleteGoal,
  hasActiveRun: m.hasActiveRun,
}));
vi.mock("@/lib/workers/service", () => ({
  listWorkerSummaries: m.listWorkerSummaries,
  getWorkerSummary: m.getWorkerSummary,
}));
vi.mock("@/lib/workers/scheduler", () => ({
  getScheduler: () => ({
    isLeader: m.isLeader,
    kick: vi.fn(),
    cancel: vi.fn(),
  }),
}));
vi.mock("@/lib/workers/http", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/workers/http")>()),
  engineAvailability: () => ({
    "claude-cli": { available: true, note: "t" },
    "codex-cli": { available: false, note: "t" },
    "agent-sdk": { available: false, note: "t" },
  }),
}));

import { GET as listGET, POST as createPOST } from "@/app/api/workers/route";
import { GET as detailGET, PATCH, DELETE } from "@/app/api/workers/[id]/route";
import {
  GET as goalsGET,
  POST as goalsPOST,
} from "@/app/api/workers/[id]/goals/route";
import {
  PATCH as goalPATCH,
  DELETE as goalDELETE,
} from "@/app/api/workers/[id]/goals/[goalId]/route";

const USER = { username: "op", authenticated: true };

function allow() {
  m.requireAuth.mockResolvedValue({ authenticated: true, user: USER });
  m.requireRole.mockResolvedValue({
    authorized: true,
    user: USER,
    subject: null,
  });
}

function deny401() {
  const response = NextResponse.json(
    { error: "Authentication required" },
    { status: 401 },
  );
  m.requireAuth.mockResolvedValue({ authenticated: false, response });
  m.requireRole.mockResolvedValue({ authorized: false, response });
}

function deny403() {
  m.requireRole.mockResolvedValue({
    authorized: false,
    response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
  });
}

const req = (url: string, method = "GET", body?: unknown) =>
  new Request(`http://localhost${url}`, {
    method,
    headers:
      body === undefined ? undefined : { "content-type": "application/json" },
    body:
      body === undefined
        ? undefined
        : typeof body === "string"
          ? body
          : JSON.stringify(body),
  });
const ctx = (id = WORKER_ID) => ({ params: Promise.resolve({ id }) });
const goalCtx = (goalId = "g1") => ({
  params: Promise.resolve({ id: WORKER_ID, goalId }),
});

beforeEach(() => {
  vi.clearAllMocks();
  m.isDbConfigured.mockReturnValue(true);
  allow();
});

describe("auth gates", () => {
  it("401 on every handler when unauthenticated, before touching the store", async () => {
    deny401();
    const results = await Promise.all([
      listGET(),
      createPOST(req("/api/workers", "POST", { template: "tpm" })),
      detailGET(req("/x"), ctx()),
      PATCH(req("/x", "PATCH", {}), ctx()),
      DELETE(req("/x", "DELETE"), ctx()),
      goalsGET(req("/x"), ctx()),
      goalsPOST(req("/x", "POST", { title: "t" }), ctx()),
      goalPATCH(req("/x", "PATCH", {}), goalCtx()),
      goalDELETE(req("/x", "DELETE"), goalCtx()),
    ]);
    for (const r of results) expect(r.status).toBe(401);
    expect(m.getWorker).not.toHaveBeenCalled();
    expect(m.createWorker).not.toHaveBeenCalled();
    expect(m.listWorkerSummaries).not.toHaveBeenCalled();
  });

  it("mutations require workers:manage and return 403 when denied", async () => {
    deny403();
    const results = await Promise.all([
      createPOST(req("/api/workers", "POST", { template: "tpm" })),
      PATCH(req("/x", "PATCH", { enabled: true }), ctx()),
      DELETE(req("/x", "DELETE"), ctx()),
      goalsPOST(req("/x", "POST", { title: "t" }), ctx()),
      goalPATCH(req("/x", "PATCH", {}), goalCtx()),
      goalDELETE(req("/x", "DELETE"), goalCtx()),
    ]);
    for (const r of results) expect(r.status).toBe(403);
    for (const call of m.requireRole.mock.calls)
      expect(call[0]).toBe("workers:manage");
    expect(m.createWorker).not.toHaveBeenCalled();
    expect(m.updateWorker).not.toHaveBeenCalled();
    expect(m.deleteWorker).not.toHaveBeenCalled();
  });

  it("503 when Postgres is not configured", async () => {
    m.isDbConfigured.mockReturnValue(false);
    const results = await Promise.all([
      listGET(),
      createPOST(req("/api/workers", "POST", { template: "tpm" })),
      detailGET(req("/x"), ctx()),
      PATCH(req("/x", "PATCH", {}), ctx()),
      goalsGET(req("/x"), ctx()),
    ]);
    for (const r of results) expect(r.status).toBe(503);
    expect((await results[0].json()).error).toBe("Postgres not configured");
  });
});

describe("GET /api/workers", () => {
  it("lists workers, templates, engines and leader flag", async () => {
    m.listWorkerSummaries.mockResolvedValue([{ id: WORKER_ID }]);
    const res = await listGET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.workers).toEqual([{ id: WORKER_ID }]);
    expect(body.templates).toEqual([
      expect.objectContaining({
        slug: "tpm",
        name: "Technical Project Manager",
      }),
    ]);
    expect(body.engines["claude-cli"].available).toBe(true);
    expect(body.schedulerLeader).toBe(true);
  });

  it("500 without leaking the error when the store fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    m.listWorkerSummaries.mockRejectedValue(
      new Error("connection refused 10.0.0.1"),
    );
    const res = await listGET();
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("10.0.0.1");
  });
});

describe("POST /api/workers", () => {
  it("template tpm creates a disabled, propose-autonomy worker", async () => {
    m.getWorker.mockResolvedValue(null);
    m.createWorker.mockImplementation(async (input) => workerFixture(input));
    const res = await createPOST(
      req("/api/workers", "POST", { template: "tpm" }),
    );
    expect(res.status).toBe(201);
    const [input, createdBy] = m.createWorker.mock.calls[0];
    expect(createdBy).toBe("op");
    expect(input).toMatchObject({
      slug: "tpm",
      role: "tpm",
      enabled: false,
      autonomy: "propose",
      runMode: "schedule",
      cron: "0 8,16 * * 1-5",
    });
    expect((await res.json()).worker.slug).toBe("tpm");
    expect(m.requireRole).toHaveBeenCalledWith("workers:manage", {
      route: "/api/workers",
    });
  });

  it("creates from a body", async () => {
    m.getWorker.mockResolvedValue(null);
    m.createWorker.mockImplementation(async (input) => workerFixture(input));
    const res = await createPOST(
      req("/api/workers", "POST", {
        slug: "my-worker",
        name: "Mine",
        runMode: "adhoc",
      }),
    );
    expect(res.status).toBe(201);
    expect(m.createWorker.mock.calls[0][0]).toEqual({
      slug: "my-worker",
      name: "Mine",
      runMode: "adhoc",
    });
  });

  it("409 on a duplicate slug", async () => {
    m.getWorker.mockResolvedValue(workerFixture());
    const res = await createPOST(
      req("/api/workers", "POST", { template: "tpm" }),
    );
    expect(res.status).toBe(409);
    expect(m.getWorker).toHaveBeenCalledWith("tpm");
    expect(m.createWorker).not.toHaveBeenCalled();
  });

  it.each([
    ["invalid JSON", "{nope"],
    ["missing slug", { name: "x" }],
    ["bad cron", { slug: "ab", name: "x", runMode: "schedule", cron: "bad" }],
    [
      "env value instead of name",
      {
        slug: "ab",
        name: "x",
        mcpServers: [
          {
            kind: "inline",
            id: "a",
            type: "stdio",
            command: "c",
            envPassthrough: ["T=secret"],
          },
        ],
      },
    ],
    ["unknown template", { template: "ceo" }],
  ])("400 on %s", async (_label, body) => {
    const res = await createPOST(req("/api/workers", "POST", body));
    expect(res.status).toBe(400);
    expect(m.createWorker).not.toHaveBeenCalled();
  });
});

describe("GET/PATCH/DELETE /api/workers/[id]", () => {
  it("GET returns worker, goals and brief; 404 when missing", async () => {
    m.getWorkerSummary.mockResolvedValue({ ...workerFixture(), state: "idle" });
    m.listGoals.mockResolvedValue([{ id: "g1" }]);
    m.latestBrief.mockResolvedValue(null);
    const res = await detailGET(req("/x"), ctx("tpm"));
    expect(res.status).toBe(200);
    expect(m.getWorkerSummary).toHaveBeenCalledWith("tpm");
    expect(await res.json()).toMatchObject({
      goals: [{ id: "g1" }],
      brief: null,
    });

    m.getWorkerSummary.mockResolvedValue(null);
    expect((await detailGET(req("/x"), ctx("nope"))).status).toBe(404);
  });

  it("PATCH enabled:true clears pausedReason", async () => {
    m.getWorker.mockResolvedValue(
      workerFixture({ pausedReason: "paused after 3" }),
    );
    m.updateWorker.mockImplementation(async (_id, p) => workerFixture(p));
    const res = await PATCH(req("/x", "PATCH", { enabled: true }), ctx("tpm"));
    expect(res.status).toBe(200);
    expect(m.updateWorker).toHaveBeenCalledWith(WORKER_ID, {
      enabled: true,
      pausedReason: null,
    });
  });

  it("PATCH enabled:false leaves pausedReason untouched", async () => {
    m.getWorker.mockResolvedValue(workerFixture({ enabled: true }));
    m.updateWorker.mockResolvedValue(workerFixture());
    await PATCH(req("/x", "PATCH", { enabled: false }), ctx());
    expect(m.updateWorker).toHaveBeenCalledWith(WORKER_ID, { enabled: false });
  });

  it("PATCH 400 on slug change, invalid field, and merged run-policy violation", async () => {
    m.getWorker.mockResolvedValue(
      workerFixture({ runMode: "adhoc", cron: null }),
    );
    expect((await PATCH(req("/x", "PATCH", { slug: "x" }), ctx())).status).toBe(
      400,
    );
    expect(
      (await PATCH(req("/x", "PATCH", { timeoutSeconds: 5 }), ctx())).status,
    ).toBe(400);
    const res = await PATCH(req("/x", "PATCH", { runMode: "schedule" }), ctx());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/cron is required/);
    expect(m.updateWorker).not.toHaveBeenCalled();
  });

  it("PATCH clearing cron of a schedule worker is rejected", async () => {
    m.getWorker.mockResolvedValue(workerFixture());
    expect(
      (await PATCH(req("/x", "PATCH", { cron: null }), ctx())).status,
    ).toBe(400);
  });

  it("PATCH 404 on unknown worker", async () => {
    m.getWorker.mockResolvedValue(null);
    expect(
      (await PATCH(req("/x", "PATCH", { enabled: true }), ctx())).status,
    ).toBe(404);
  });

  it("DELETE deletes by resolved id; 404 when missing", async () => {
    m.getWorker.mockResolvedValue(workerFixture());
    m.deleteWorkerIfIdle.mockResolvedValue("deleted");
    const res = await DELETE(req("/x", "DELETE"), ctx("tpm"));
    expect(res.status).toBe(200);
    expect(m.deleteWorkerIfIdle).toHaveBeenCalledWith(WORKER_ID);
    m.getWorker.mockResolvedValue(null);
    expect((await DELETE(req("/x", "DELETE"), ctx("tpm"))).status).toBe(404);
    // Deleted concurrently between lookup and the transactional delete.
    m.getWorker.mockResolvedValue(workerFixture());
    m.deleteWorkerIfIdle.mockResolvedValue("missing");
    expect((await DELETE(req("/x", "DELETE"), ctx("tpm"))).status).toBe(404);
  });

  it("DELETE 409 while the worker has a queued/running run (atomic check)", async () => {
    m.getWorker.mockResolvedValue(workerFixture());
    m.deleteWorkerIfIdle.mockResolvedValue("active");
    const res = await DELETE(req("/x", "DELETE"), ctx("tpm"));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/cancel it first/);
    expect(m.deleteWorker).not.toHaveBeenCalled();
  });
});

describe("goals routes", () => {
  it("GET lists goals; POST creates with 201; POST 400 without title", async () => {
    m.getWorker.mockResolvedValue(workerFixture());
    m.listGoals.mockResolvedValue([]);
    expect((await goalsGET(req("/x"), ctx())).status).toBe(200);

    m.createGoal.mockResolvedValue({ id: "g1", title: "Ship" });
    const res = await goalsPOST(
      req("/x", "POST", { title: " Ship ", priority: 5 }),
      ctx(),
    );
    expect(res.status).toBe(201);
    expect(m.createGoal).toHaveBeenCalledWith(WORKER_ID, {
      title: "Ship",
      priority: 5,
    });

    expect(
      (await goalsPOST(req("/x", "POST", { description: "d" }), ctx())).status,
    ).toBe(400);
  });

  it("goal PATCH/DELETE 404 when the goal is not the worker's", async () => {
    m.getWorker.mockResolvedValue(workerFixture());
    m.updateGoal.mockResolvedValue(null);
    m.deleteGoal.mockResolvedValue(false);
    expect(
      (await goalPATCH(req("/x", "PATCH", { status: "done" }), goalCtx()))
        .status,
    ).toBe(404);
    expect((await goalDELETE(req("/x", "DELETE"), goalCtx())).status).toBe(404);
    expect(m.updateGoal).toHaveBeenCalledWith(WORKER_ID, "g1", {
      status: "done",
    });
  });

  it("goal PATCH updates; 400 on bad status", async () => {
    m.getWorker.mockResolvedValue(workerFixture());
    m.updateGoal.mockResolvedValue({ id: "g1", status: "done" });
    expect(
      (await goalPATCH(req("/x", "PATCH", { status: "done" }), goalCtx()))
        .status,
    ).toBe(200);
    expect(
      (await goalPATCH(req("/x", "PATCH", { status: "zzz" }), goalCtx()))
        .status,
    ).toBe(400);
  });
});
