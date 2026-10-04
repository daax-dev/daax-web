/**
 * Digital Workers store + migration against a real Postgres
 * (provided by `bun run test:integration`). Self-skips when Postgres is not
 * configured. Resets to a clean migrated schema in beforeAll.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import path from "node:path";
import { Client } from "pg";
import { runner } from "node-pg-migrate";
import { resolveDbConfig, isDbConfigured } from "@/lib/db/config";
import { query, closePool } from "@/lib/db/pg";
import { resetSchema } from "./helpers";
import {
  RunConflictError,
  appendRunEvent,
  cancelRequestedAmong,
  cancelQueuedRun,
  countAutomaticRunsSince,
  createGoal,
  createRun,
  createWorker,
  deleteGoal,
  deleteWorker,
  deleteWorkerIfIdle,
  failRunningRun,
  finishRun,
  getRun,
  getWorker,
  hasActiveRun,
  lastRunsByWorker,
  latestBrief,
  listGoals,
  listQueuedRuns,
  listRunEvents,
  listRunningRuns,
  listRuns,
  listWorkers,
  markRunStarted,
  pruneRuns,
  recentFinishedStatuses,
  requestCancel,
  setExecutorRef,
  updateGoal,
  updateWorker,
} from "@/lib/workers/store";
import { TPM_TEMPLATE } from "@/lib/workers/templates";
import { parseWorkerCreate } from "@/lib/workers/validation";

const MIGRATIONS_DIR = path.resolve(process.cwd(), "migrations");
const MIGRATION = "1781568000400_digital-workers";
const TABLES = ["workers", "worker_goals", "worker_runs", "worker_run_events"];
const configured = isDbConfigured();

async function migrate(
  direction: "up" | "down",
  count = Infinity,
): Promise<void> {
  const client = new Client(resolveDbConfig().poolConfig);
  await client.connect();
  try {
    await runner({
      dbClient: client,
      migrationsTable: "pgmigrations",
      dir: MIGRATIONS_DIR,
      direction,
      count,
      createMigrationsSchema: false,
      singleTransaction: true,
      log: () => {},
    });
  } finally {
    await client.end();
  }
}

async function existingTables(): Promise<string[]> {
  const res = await query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ANY($1) ORDER BY table_name`,
    [TABLES],
  );
  return res.rows.map((r) => r.table_name);
}

async function newWorker(slug: string, over: Record<string, unknown> = {}) {
  return createWorker({ slug, name: slug, ...over }, "tester");
}

describe.skipIf(!configured)("digital workers store (Postgres)", () => {
  beforeAll(async () => {
    await resetSchema();
    await migrate("up");
  });

  afterAll(async () => {
    await closePool();
  });

  beforeEach(async () => {
    await query("DELETE FROM workers");
  });

  it("migration is the latest and round-trips down/up for all four tables", async () => {
    const last = await query<{ name: string }>(
      "SELECT name FROM pgmigrations ORDER BY run_on DESC, id DESC LIMIT 1",
    );
    expect(last.rows[0].name).toBe(MIGRATION);
    expect(await existingTables()).toEqual([...TABLES].sort());

    await migrate("down", 1);
    expect(await existingTables()).toEqual([]);

    await migrate("up");
    expect(await existingTables()).toEqual([...TABLES].sort());
    const idx = await query(
      "SELECT indexdef FROM pg_indexes WHERE indexname = 'worker_runs_one_active_idx'",
    );
    expect(String(idx.rows[0].indexdef)).toMatch(/WHERE .*queued.*running/);
  });

  it("createWorker applies defaults; getWorker by slug and by id", async () => {
    const w = await newWorker("alpha");
    expect(w).toMatchObject({
      slug: "alpha",
      name: "alpha",
      role: "custom",
      engine: "claude-cli",
      runMode: "adhoc",
      cooldownSeconds: 900,
      maxRunsPerDay: 24,
      timeoutSeconds: 900,
      autonomy: "propose",
      executor: "auto",
      mcpServers: [],
      enabled: false,
      pausedReason: null,
      createdBy: "tester",
    });
    expect(w.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(w.createdAt).toMatch(/Z$/);
    expect(await getWorker("alpha")).toEqual(w);
    expect(await getWorker(w.id)).toEqual(w);
    expect(await getWorker("nope")).toBeNull();
    expect(await getWorker("00000000-0000-4000-8000-000000000000")).toBeNull();
  });

  it("the TPM template validates and persists its MCP server list as jsonb", async () => {
    const parsed = parseWorkerCreate(TPM_TEMPLATE);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const w = await createWorker(parsed.value, null);
    expect(w).toMatchObject({
      slug: "tpm",
      enabled: false,
      autonomy: "propose",
      cron: "0 8,16 * * 1-5",
    });
    expect(w.mcpServers).toEqual(TPM_TEMPLATE.mcpServers);
  });

  it("slug is unique; CHECK constraints reject bad enums", async () => {
    await newWorker("dup");
    await expect(newWorker("dup")).rejects.toMatchObject({ code: "23505" });
    await expect(
      newWorker("bad-engine", { engine: "gpt" }),
    ).rejects.toMatchObject({
      code: "23514",
    });
  });

  it("updateWorker patches given fields (incl. explicit null) and bumps updated_at", async () => {
    const w = await newWorker("upd", {
      cron: "0 * * * *",
      runMode: "schedule",
    });
    await new Promise((r) => setTimeout(r, 10));
    const u = await updateWorker(w.id, {
      enabled: true,
      pausedReason: null,
      runMode: "adhoc",
      cron: null,
      mcpServers: [{ kind: "ref", id: "github" }],
    });
    expect(u).toMatchObject({
      enabled: true,
      runMode: "adhoc",
      cron: null,
      name: "upd",
    });
    expect(u!.mcpServers).toEqual([{ kind: "ref", id: "github" }]);
    expect(new Date(u!.updatedAt).getTime()).toBeGreaterThan(
      new Date(w.updatedAt).getTime(),
    );
    expect(await updateWorker(w.id, {})).toEqual(u);
    expect(
      await updateWorker("00000000-0000-4000-8000-000000000000", {
        enabled: true,
      }),
    ).toBeNull();
  });

  it("goals CRUD, ordered by priority desc, scoped to the worker", async () => {
    const w = await newWorker("goals");
    const other = await newWorker("other");
    const low = await createGoal(w.id, { title: "low" });
    const high = await createGoal(w.id, {
      title: "high",
      priority: 10,
      projectRef: "/workspace/p",
    });
    expect(low).toMatchObject({
      status: "active",
      priority: 0,
      description: "",
      projectRef: null,
    });
    expect((await listGoals(w.id)).map((g) => g.title)).toEqual([
      "high",
      "low",
    ]);

    const done = await updateGoal(w.id, low.id, { status: "done" });
    expect(done?.status).toBe("done");
    expect((await listGoals(w.id, "active")).map((g) => g.id)).toEqual([
      high.id,
    ]);
    expect(await updateGoal(w.id, low.id, {})).toMatchObject({
      id: low.id,
      status: "done",
    });

    // A goal cannot be touched through another worker.
    expect(await updateGoal(other.id, high.id, { title: "x" })).toBeNull();
    expect(await updateGoal(other.id, high.id, {})).toBeNull();
    expect(await deleteGoal(other.id, high.id)).toBe(false);

    expect(await deleteGoal(w.id, high.id)).toBe(true);
    expect(await deleteGoal(w.id, high.id)).toBe(false);
    await expect(
      updateGoal(w.id, low.id, { status: "paused" as never }),
    ).rejects.toMatchObject({
      code: "23514",
    });
  });

  it("createRun enforces one active run per worker (partial unique index)", async () => {
    const w = await newWorker("one-active");
    const r1 = await createRun(w, "adhoc", "hi", "op");
    expect(r1).toMatchObject({
      status: "queued",
      trigger: "adhoc",
      input: "hi",
      engine: "claude-cli",
      usage: {},
    });
    await expect(
      createRun(w, "schedule", "", "scheduler"),
    ).rejects.toBeInstanceOf(RunConflictError);

    // Still conflicts while running.
    expect(await markRunStarted(r1.id)).toBe(true);
    await expect(createRun(w, "adhoc", "", null)).rejects.toBeInstanceOf(
      RunConflictError,
    );

    // Terminal → a new run may be queued.
    await finishRun(r1.id, { status: "succeeded", summary: "ok" });
    const r2 = await createRun(w, "adhoc", "", null);
    expect(r2.status).toBe("queued");

    // Another worker is independent.
    const w2 = await newWorker("one-active-2");
    await expect(createRun(w2, "adhoc", "", null)).resolves.toMatchObject({
      status: "queued",
    });
  });

  it("markRunStarted only transitions from queued", async () => {
    const w = await newWorker("start");
    const r = await createRun(w, "adhoc", "", null);
    expect(await markRunStarted(r.id)).toBe(true);
    const running = await getRun(r.id);
    expect(running?.status).toBe("running");
    expect(running?.startedAt).not.toBeNull();
    expect(await markRunStarted(r.id)).toBe(false);

    const r2Worker = await newWorker("start-2");
    const r2 = await createRun(r2Worker, "adhoc", "", null);
    expect(await cancelQueuedRun(r2.id)).toMatchObject({
      status: "cancelled",
      error: "cancelled by operator",
    });
    expect(await markRunStarted(r2.id)).toBe(false);
    expect(await cancelQueuedRun(r2.id)).toBeNull();
  });

  it("finishRun records status, summary, error, usage and finished_at", async () => {
    const w = await newWorker("finish");
    const r = await createRun(w, "adhoc", "", null);
    await markRunStarted(r.id);
    const f = await finishRun(r.id, {
      status: "failed",
      error: "boom",
      usage: { inputTokens: 2, outputTokens: 4, costUsd: 0.13, turns: 1 },
    });
    expect(f).toMatchObject({
      status: "failed",
      summary: null,
      error: "boom",
      usage: { inputTokens: 2, outputTokens: 4, costUsd: 0.13, turns: 1 },
    });
    expect(f?.finishedAt).not.toBeNull();
    expect(
      await finishRun("00000000-0000-4000-8000-000000000000", {
        status: "failed",
      }),
    ).toBeNull();
  });

  it("appendRunEvent / listRunEvents(after) keep order; seq is unique per run", async () => {
    const w = await newWorker("events");
    const r = await createRun(w, "adhoc", "", null);
    await appendRunEvent(r.id, 0, {
      type: "system",
      text: "start",
      data: { version: "2.1.283" },
    });
    await appendRunEvent(r.id, 1, {
      type: "tool_call",
      tool: "mcp__backlog__task_list",
      data: { input: {} },
    });
    await appendRunEvent(r.id, 2, { type: "message", text: "done" });
    const all = await listRunEvents(r.id);
    expect(all.map((e) => e.seq)).toEqual([0, 1, 2]);
    expect(all[0]).toMatchObject({
      runId: r.id,
      type: "system",
      text: "start",
      data: { version: "2.1.283" },
    });
    expect(all[1].tool).toBe("mcp__backlog__task_list");
    expect(all[2].data).toBeUndefined();
    expect(all[2].tool).toBeUndefined();
    expect((await listRunEvents(r.id, 1)).map((e) => e.seq)).toEqual([2]);
    expect(await listRunEvents(r.id, 2)).toEqual([]);
    expect((await listRunEvents(r.id, -1, 2)).map((e) => e.seq)).toEqual([
      0, 1,
    ]);
    await expect(
      appendRunEvent(r.id, 1, { type: "message", text: "dup" }),
    ).rejects.toMatchObject({
      code: "23505",
    });
  });

  it("migration adds executor_ref and cancel_requested with defaults", async () => {
    const cols = await query<{
      column_name: string;
      data_type: string;
      is_nullable: string;
      column_default: string | null;
    }>(
      `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns
        WHERE table_name = 'worker_runs' AND column_name IN ('executor_ref','cancel_requested')
        ORDER BY column_name`,
    );
    expect(cols.rows).toEqual([
      {
        column_name: "cancel_requested",
        data_type: "boolean",
        is_nullable: "NO",
        column_default: "false",
      },
      {
        column_name: "executor_ref",
        data_type: "text",
        is_nullable: "YES",
        column_default: null,
      },
    ]);
    const r = await createRun(await newWorker("cols"), "adhoc", "", null);
    expect(r.cancelRequested).toBe(false);
  });

  it("a 36-hex-char (non-UUID) slug is looked up by slug", async () => {
    const slug = "abcdefabcdefabcdefabcdefabcdefabcdef";
    const w = await newWorker(slug);
    expect((await getWorker(slug))?.id).toBe(w.id);
  });

  it("finishRun is a no-op on a run that is already terminal", async () => {
    const w = await newWorker("stale-finish");
    const r = await createRun(w, "adhoc", "", null);
    await markRunStarted(r.id);
    // A new leader releases the orphan; the old executor then reports late.
    expect(await failRunningRun(r.id, "interrupted: daax restarted")).toBe(
      true,
    );
    expect(
      await finishRun(r.id, { status: "succeeded", summary: "late report" }),
    ).toBeNull();
    expect(await getRun(r.id)).toMatchObject({
      status: "failed",
      summary: null,
      error: "interrupted: daax restarted",
    });

    // Cancelled-while-queued is terminal too.
    const r2 = await createRun(w, "adhoc", "", null);
    await cancelQueuedRun(r2.id);
    expect(await finishRun(r2.id, { status: "failed", error: "x" })).toBeNull();
    expect((await getRun(r2.id))?.status).toBe("cancelled");

    // finishRun still works from queued (e.g. worker deleted before start).
    const r3 = await createRun(w, "adhoc", "", null);
    expect(
      await finishRun(r3.id, { status: "failed", error: "gone" }),
    ).toMatchObject({
      status: "failed",
    });
  });

  it("requestCancel only flags running runs; cancelRequestedAmong filters ids", async () => {
    const a = await createRun(await newWorker("rc-a"), "adhoc", "", null);
    const b = await createRun(await newWorker("rc-b"), "adhoc", "", null);
    const c = await createRun(await newWorker("rc-c"), "adhoc", "", null);
    await markRunStarted(a.id);
    await markRunStarted(b.id);

    expect(await requestCancel(c.id)).toBe(false); // queued
    expect(await requestCancel(a.id)).toBe(true);
    expect(await requestCancel("00000000-0000-4000-8000-000000000000")).toBe(
      false,
    );
    expect((await getRun(a.id))?.cancelRequested).toBe(true);
    expect((await getRun(b.id))?.cancelRequested).toBe(false);

    expect(await cancelRequestedAmong([])).toEqual([]);
    expect(await cancelRequestedAmong([a.id, b.id, c.id])).toEqual([a.id]);
    expect(await cancelRequestedAmong([b.id])).toEqual([]);

    await finishRun(a.id, { status: "cancelled" });
    expect(await requestCancel(a.id)).toBe(false); // terminal
  });

  it("setExecutorRef / listRunningRuns / hasActiveRun", async () => {
    const w = await newWorker("exec-ref");
    expect(await hasActiveRun(w.id)).toBe(false);
    const r = await createRun(w, "adhoc", "", null);
    expect(await hasActiveRun(w.id)).toBe(true);
    expect(await listRunningRuns()).toEqual([]);

    await markRunStarted(r.id);
    await setExecutorRef(r.id, "container:daax-w-abcd");
    expect(await listRunningRuns()).toEqual([
      { id: r.id, executorRef: "container:daax-w-abcd" },
    ]);
    expect(await hasActiveRun(w.id)).toBe(true);

    await finishRun(r.id, { status: "succeeded" });
    expect(await hasActiveRun(w.id)).toBe(false);
    expect(await listRunningRuns()).toEqual([]);
  });

  it("failRunningRun only touches that run, and only while it is running", async () => {
    const running = await createRun(
      await newWorker("int-running"),
      "schedule",
      "",
      null,
    );
    await markRunStarted(running.id);
    const queued = await createRun(
      await newWorker("int-queued"),
      "schedule",
      "",
      null,
    );
    const done = await createRun(
      await newWorker("int-done"),
      "adhoc",
      "",
      null,
    );
    await finishRun(done.id, { status: "succeeded", summary: "s" });

    expect(
      await failRunningRun(running.id, "interrupted: daax restarted"),
    ).toBe(true);
    expect(await getRun(running.id)).toMatchObject({
      status: "failed",
      error: "interrupted: daax restarted",
    });
    expect(await failRunningRun(queued.id, "x")).toBe(false);
    expect(await failRunningRun(done.id, "x")).toBe(false);
    expect((await getRun(queued.id))?.status).toBe("queued");
    expect((await getRun(done.id))?.status).toBe("succeeded");
    expect(await failRunningRun(running.id, "again")).toBe(false);
    expect((await listQueuedRuns()).map((r) => r.id)).toEqual([queued.id]);
  });

  it("countAutomaticRunsSince counts schedule/continuous only, since the cutoff", async () => {
    const w = await newWorker("count");
    for (const trigger of [
      "schedule",
      "continuous",
      "adhoc",
      "cli",
      "voice",
      "schedule",
    ] as const) {
      const r = await createRun(w, trigger, "", null);
      await finishRun(r.id, { status: "succeeded" });
    }
    const old = await createRun(w, "schedule", "", null);
    await finishRun(old.id, { status: "succeeded" });
    await query(
      "UPDATE worker_runs SET queued_at = now() - interval '2 days' WHERE id = $1",
      [old.id],
    );

    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    expect(await countAutomaticRunsSince(w.id, dayAgo)).toBe(3);
    expect(
      await countAutomaticRunsSince(
        w.id,
        new Date(Date.now() - 3 * 86_400_000),
      ),
    ).toBe(4);
  });

  it("lastRunsByWorker, listRuns, recentFinishedStatuses and latestBrief", async () => {
    const a = await newWorker("last-a");
    const b = await newWorker("last-b");
    const a1 = await createRun(a, "adhoc", "1", null);
    await finishRun(a1.id, { status: "succeeded", summary: "brief one" });
    const a2 = await createRun(a, "adhoc", "2", null);
    await finishRun(a2.id, { status: "failed", error: "x" });
    const a3 = await createRun(a, "adhoc", "3", null);
    const b1 = await createRun(b, "adhoc", "b", null);

    const last = await lastRunsByWorker();
    expect(last.get(a.id)?.id).toBe(a3.id);
    expect(last.get(b.id)?.id).toBe(b1.id);
    expect((await listRuns(a.id)).map((r) => r.id)).toEqual([
      a3.id,
      a2.id,
      a1.id,
    ]);
    expect((await listRuns(a.id, 1)).map((r) => r.id)).toEqual([a3.id]);
    expect(await recentFinishedStatuses(a.id, 3)).toEqual([
      "failed",
      "succeeded",
    ]);

    const brief = await latestBrief(a.id);
    expect(brief?.id).toBe(a1.id);
    expect(brief?.summary).toBe("brief one");
    expect(await latestBrief(b.id)).toBeNull();
  });

  it("pruneRuns deletes runs older than N days and cascades their events", async () => {
    const w = await newWorker("prune");
    const old = await createRun(w, "adhoc", "", null);
    await appendRunEvent(old.id, 0, { type: "message", text: "old" });
    await finishRun(old.id, { status: "succeeded" });
    await query(
      "UPDATE worker_runs SET queued_at = now() - interval '40 days' WHERE id = $1",
      [old.id],
    );
    await query(
      "UPDATE worker_runs SET finished_at = now() - interval '40 days' WHERE id = $1",
      [old.id],
    );
    // An old run still marked running (its cleanup unverified) is never
    // pruned: it holds the worker's exclusion and its recovery reference.
    const w2 = await newWorker("prune-stuck");
    const stuck = await createRun(w2, "adhoc", "", null);
    await markRunStarted(stuck.id);
    await query(
      "UPDATE worker_runs SET queued_at = now() - interval '40 days' WHERE id = $1",
      [stuck.id],
    );
    const fresh = await createRun(w, "adhoc", "", null);

    expect(await pruneRuns(30)).toBe(1);
    expect((await getRun(stuck.id))?.status).toBe("running");
    expect(await getRun(old.id)).toBeNull();
    expect(await getRun(fresh.id)).not.toBeNull();
    const ev = await query(
      "SELECT count(*)::int AS n FROM worker_run_events WHERE run_id = $1",
      [old.id],
    );
    expect(ev.rows[0].n).toBe(0);
    expect(await pruneRuns(30)).toBe(0);
  });

  it("deleteWorker cascades goals, runs and events", async () => {
    const w = await newWorker("cascade");
    await createGoal(w.id, { title: "g" });
    const r = await createRun(w, "adhoc", "", null);
    await appendRunEvent(r.id, 0, { type: "message", text: "x" });

    expect(await deleteWorker(w.id)).toBe(true);
    expect(await deleteWorker(w.id)).toBe(false);
    expect(await getWorker(w.id)).toBeNull();
    for (const table of ["worker_goals", "worker_runs", "worker_run_events"]) {
      const res = await query(`SELECT count(*)::int AS n FROM ${table}`);
      expect(res.rows[0].n).toBe(0);
    }
    expect(await listWorkers()).toEqual([]);
  });

  it("deleteWorkerIfIdle refuses while a run is active and is serialized with run creation", async () => {
    const w = await newWorker("idle-delete");
    const r = await createRun(w, "adhoc", "", null);
    expect(await deleteWorkerIfIdle(w.id)).toBe("active");
    expect(await getWorker(w.id)).not.toBeNull();

    await cancelQueuedRun(r.id);
    expect(await deleteWorkerIfIdle(w.id)).toBe("deleted");
    expect(await deleteWorkerIfIdle(w.id)).toBe("missing");
    // A run created after deletion fails on the foreign key: no orphan run.
    await expect(createRun(w, "adhoc", "", null)).rejects.toThrow();
  });
});
