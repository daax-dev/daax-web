/**
 * Digital Workers — Postgres store (docs/plans/digital-workers.md §5).
 *
 * Plain async functions over the shared `pg` pool, following `lib/catalog/db.ts`:
 * jsonb columns are written with JSON.stringify and read back parsed;
 * timestamptz values are normalised to ISO-8601 strings.
 */

import { randomUUID } from "node:crypto";
import { getClient, query } from "@/lib/db/pg";
import { UUID_RE } from "@/types/workers";
import type {
  GoalStatus,
  RunEvent,
  RunStatus,
  RunTrigger,
  RunUsage,
  Worker,
  WorkerEngine,
  WorkerGoal,
  WorkerMcpServer,
  WorkerRun,
  WorkerRunEvent,
} from "@/types/workers";

type Row = Record<string, unknown>;

/** Thrown when a worker already has a queued or running run. */
export class RunConflictError extends Error {
  constructor(public readonly workerId: string) {
    super("Worker already has a run in progress");
    this.name = "RunConflictError";
  }
}

function iso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  return new Date(v as string).toISOString();
}

function isoOrNull(v: unknown): string | null {
  return v == null ? null : iso(v);
}

function toWorker(r: Row): Worker {
  return {
    id: r.id as string,
    slug: r.slug as string,
    name: r.name as string,
    role: r.role as Worker["role"],
    description: r.description as string,
    instructions: r.instructions as string,
    engine: r.engine as Worker["engine"],
    model: (r.model as string | null) ?? null,
    runMode: r.run_mode as Worker["runMode"],
    cron: (r.cron as string | null) ?? null,
    cooldownSeconds: r.cooldown_seconds as number,
    maxRunsPerDay: r.max_runs_per_day as number,
    timeoutSeconds: r.timeout_seconds as number,
    autonomy: r.autonomy as Worker["autonomy"],
    executor: r.executor as Worker["executor"],
    workingDir: (r.working_dir as string | null) ?? null,
    mcpServers: (r.mcp_servers as WorkerMcpServer[] | null) ?? [],
    enabled: r.enabled as boolean,
    pausedReason: (r.paused_reason as string | null) ?? null,
    createdBy: (r.created_by as string | null) ?? null,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

function toGoal(r: Row): WorkerGoal {
  return {
    id: r.id as string,
    workerId: r.worker_id as string,
    title: r.title as string,
    description: r.description as string,
    projectRef: (r.project_ref as string | null) ?? null,
    successCriteria: r.success_criteria as string,
    status: r.status as GoalStatus,
    priority: r.priority as number,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

function toRun(r: Row): WorkerRun {
  return {
    id: r.id as string,
    workerId: r.worker_id as string,
    trigger: r.trigger as RunTrigger,
    input: r.input as string,
    status: r.status as RunStatus,
    engine: r.engine as WorkerEngine,
    queuedAt: iso(r.queued_at),
    startedAt: isoOrNull(r.started_at),
    finishedAt: isoOrNull(r.finished_at),
    summary: (r.summary as string | null) ?? null,
    error: (r.error as string | null) ?? null,
    usage: (r.usage as RunUsage | null) ?? {},
    requestedBy: (r.requested_by as string | null) ?? null,
    cancelRequested: r.cancel_requested === true,
  };
}

function toEvent(r: Row): WorkerRunEvent {
  return {
    id: Number(r.id),
    runId: r.run_id as string,
    seq: r.seq as number,
    at: iso(r.at),
    type: r.type as WorkerRunEvent["type"],
    text: (r.text as string | null) ?? undefined,
    tool: (r.tool as string | null) ?? undefined,
    data: r.data ?? undefined,
  };
}

// ============================================================================
// Workers
// ============================================================================

/** Column name for each writable Worker field. */
const WORKER_COLUMNS = {
  slug: "slug",
  name: "name",
  role: "role",
  description: "description",
  instructions: "instructions",
  engine: "engine",
  model: "model",
  runMode: "run_mode",
  cron: "cron",
  cooldownSeconds: "cooldown_seconds",
  maxRunsPerDay: "max_runs_per_day",
  timeoutSeconds: "timeout_seconds",
  autonomy: "autonomy",
  executor: "executor",
  workingDir: "working_dir",
  mcpServers: "mcp_servers",
  enabled: "enabled",
  pausedReason: "paused_reason",
} as const satisfies Partial<Record<keyof Worker, string>>;

export type WorkerInput = Partial<Pick<Worker, keyof typeof WORKER_COLUMNS>> & {
  name: string;
  slug: string;
};

export type WorkerPatch = Partial<Pick<Worker, keyof typeof WORKER_COLUMNS>>;

function columnValue(key: keyof typeof WORKER_COLUMNS, value: unknown) {
  return key === "mcpServers" ? JSON.stringify(value ?? []) : value;
}

export async function listWorkers(): Promise<Worker[]> {
  const res = await query("SELECT * FROM workers ORDER BY name");
  return res.rows.map(toWorker);
}

/** Look a worker up by id (uuid) or slug. */
export async function getWorker(idOrSlug: string): Promise<Worker | null> {
  const isUuid = UUID_RE.test(idOrSlug);
  const res = await query(
    isUuid
      ? "SELECT * FROM workers WHERE id = $1"
      : "SELECT * FROM workers WHERE slug = $1",
    [idOrSlug],
  );
  return res.rows[0] ? toWorker(res.rows[0]) : null;
}

export async function createWorker(
  input: WorkerInput,
  createdBy: string | null,
): Promise<Worker> {
  const cols = ["id", "created_by"];
  const vals: unknown[] = [randomUUID(), createdBy];
  for (const [key, col] of Object.entries(WORKER_COLUMNS)) {
    const v = input[key as keyof WorkerInput];
    if (v !== undefined) {
      cols.push(col);
      vals.push(columnValue(key as keyof typeof WORKER_COLUMNS, v));
    }
  }
  const placeholders = vals.map((_, i) => `$${i + 1}`).join(", ");
  const res = await query(
    `INSERT INTO workers (${cols.join(", ")}) VALUES (${placeholders}) RETURNING *`,
    vals,
  );
  return toWorker(res.rows[0]);
}

export async function updateWorker(
  id: string,
  patch: WorkerPatch,
): Promise<Worker | null> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [key, col] of Object.entries(WORKER_COLUMNS)) {
    const v = patch[key as keyof WorkerPatch];
    if (v !== undefined) {
      vals.push(columnValue(key as keyof typeof WORKER_COLUMNS, v));
      sets.push(`${col} = $${vals.length}`);
    }
  }
  if (sets.length === 0) return getWorker(id);
  vals.push(id);
  const res = await query(
    `UPDATE workers SET ${sets.join(", ")}, updated_at = now() WHERE id = $${vals.length} RETURNING *`,
    vals,
  );
  return res.rows[0] ? toWorker(res.rows[0]) : null;
}

/**
 * Delete a worker only if it has no queued/running run, atomically. The row
 * lock (FOR UPDATE) conflicts with the key-share lock a concurrent run INSERT
 * takes through the worker_runs foreign key, so deletion and enqueue are
 * serialized: a run created first is seen here; one created after fails.
 */
export async function deleteWorkerIfIdle(
  id: string,
): Promise<"deleted" | "active" | "missing"> {
  const client = await getClient();
  try {
    await client.query("BEGIN");
    const found = await client.query(
      "SELECT id FROM workers WHERE id = $1 FOR UPDATE",
      [id],
    );
    if (found.rowCount === 0) {
      await client.query("ROLLBACK");
      return "missing";
    }
    const active = await client.query(
      "SELECT 1 FROM worker_runs WHERE worker_id = $1 AND status IN ('queued','running') LIMIT 1",
      [id],
    );
    if ((active.rowCount ?? 0) > 0) {
      await client.query("ROLLBACK");
      return "active";
    }
    await client.query("DELETE FROM workers WHERE id = $1", [id]);
    await client.query("COMMIT");
    return "deleted";
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteWorker(id: string): Promise<boolean> {
  const res = await query("DELETE FROM workers WHERE id = $1", [id]);
  return (res.rowCount ?? 0) > 0;
}

// ============================================================================
// Goals
// ============================================================================

export type GoalInput = Pick<WorkerGoal, "title"> &
  Partial<
    Pick<
      WorkerGoal,
      "description" | "projectRef" | "successCriteria" | "status" | "priority"
    >
  >;

const GOAL_COLUMNS = {
  title: "title",
  description: "description",
  projectRef: "project_ref",
  successCriteria: "success_criteria",
  status: "status",
  priority: "priority",
} as const;

export async function listGoals(
  workerId: string,
  status?: GoalStatus,
): Promise<WorkerGoal[]> {
  const res = status
    ? await query(
        "SELECT * FROM worker_goals WHERE worker_id = $1 AND status = $2 ORDER BY priority DESC, created_at",
        [workerId, status],
      )
    : await query(
        "SELECT * FROM worker_goals WHERE worker_id = $1 ORDER BY priority DESC, created_at",
        [workerId],
      );
  return res.rows.map(toGoal);
}

export async function createGoal(
  workerId: string,
  input: GoalInput,
): Promise<WorkerGoal> {
  const cols = ["id", "worker_id"];
  const vals: unknown[] = [randomUUID(), workerId];
  for (const [key, col] of Object.entries(GOAL_COLUMNS)) {
    const v = input[key as keyof GoalInput];
    if (v !== undefined) {
      cols.push(col);
      vals.push(v);
    }
  }
  const placeholders = vals.map((_, i) => `$${i + 1}`).join(", ");
  const res = await query(
    `INSERT INTO worker_goals (${cols.join(", ")}) VALUES (${placeholders}) RETURNING *`,
    vals,
  );
  return toGoal(res.rows[0]);
}

export async function updateGoal(
  workerId: string,
  goalId: string,
  patch: Partial<GoalInput>,
): Promise<WorkerGoal | null> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [key, col] of Object.entries(GOAL_COLUMNS)) {
    const v = patch[key as keyof GoalInput];
    if (v !== undefined) {
      vals.push(v);
      sets.push(`${col} = $${vals.length}`);
    }
  }
  if (sets.length === 0) {
    const res = await query(
      "SELECT * FROM worker_goals WHERE id = $1 AND worker_id = $2",
      [goalId, workerId],
    );
    return res.rows[0] ? toGoal(res.rows[0]) : null;
  }
  vals.push(goalId, workerId);
  const res = await query(
    `UPDATE worker_goals SET ${sets.join(", ")}, updated_at = now()
       WHERE id = $${vals.length - 1} AND worker_id = $${vals.length} RETURNING *`,
    vals,
  );
  return res.rows[0] ? toGoal(res.rows[0]) : null;
}

export async function deleteGoal(
  workerId: string,
  goalId: string,
): Promise<boolean> {
  const res = await query(
    "DELETE FROM worker_goals WHERE id = $1 AND worker_id = $2",
    [goalId, workerId],
  );
  return (res.rowCount ?? 0) > 0;
}

// ============================================================================
// Runs
// ============================================================================

/**
 * Queue a run. The partial unique index `worker_runs_one_active_idx` makes
 * "one queued/running run per worker" a database guarantee; a violation is
 * surfaced as RunConflictError.
 */
export async function createRun(
  worker: Pick<Worker, "id" | "engine">,
  trigger: RunTrigger,
  input: string,
  requestedBy: string | null,
): Promise<WorkerRun> {
  try {
    const res = await query(
      `INSERT INTO worker_runs (id, worker_id, trigger, input, engine, requested_by)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [randomUUID(), worker.id, trigger, input, worker.engine, requestedBy],
    );
    return toRun(res.rows[0]);
  } catch (err) {
    if ((err as { code?: string }).code === "23505") {
      throw new RunConflictError(worker.id);
    }
    throw err;
  }
}

/** queued → running. Returns false if the run is no longer queued (e.g. cancelled). */
export async function markRunStarted(runId: string): Promise<boolean> {
  const res = await query(
    "UPDATE worker_runs SET status = 'running', started_at = now() WHERE id = $1 AND status = 'queued'",
    [runId],
  );
  return (res.rowCount ?? 0) > 0;
}

/**
 * running → terminal. Only a run still `running` is updated, so a completion
 * from a deposed leader (whose run the new leader already failed) is ignored.
 */
export async function finishRun(
  runId: string,
  result: {
    status: RunStatus;
    summary?: string | null;
    error?: string | null;
    usage?: RunUsage;
  },
): Promise<WorkerRun | null> {
  const res = await query(
    `UPDATE worker_runs
        SET status = $2, summary = $3, error = $4, usage = $5, finished_at = now()
      WHERE id = $1 AND status IN ('queued','running') RETURNING *`,
    [
      runId,
      result.status,
      result.summary ?? null,
      result.error ?? null,
      JSON.stringify(result.usage ?? {}),
    ],
  );
  return res.rows[0] ? toRun(res.rows[0]) : null;
}

/** Record where a run executes (container name / host process group). */
export async function setExecutorRef(
  runId: string,
  ref: string,
): Promise<void> {
  await query("UPDATE worker_runs SET executor_ref = $2 WHERE id = $1", [
    runId,
    ref,
  ]);
}

/** Ask the executing leader to cancel a running run (any instance may call). */
export async function requestCancel(runId: string): Promise<boolean> {
  const res = await query(
    "UPDATE worker_runs SET cancel_requested = true WHERE id = $1 AND status = 'running'",
    [runId],
  );
  return (res.rowCount ?? 0) > 0;
}

/** Of the given run ids, those with a pending cancel request. */
export async function cancelRequestedAmong(
  runIds: string[],
): Promise<string[]> {
  if (runIds.length === 0) return [];
  const res = await query<{ id: string }>(
    "SELECT id FROM worker_runs WHERE id = ANY($1::uuid[]) AND cancel_requested",
    [runIds],
  );
  return res.rows.map((r) => r.id);
}

/** Runs still marked running (with where they execute), for leader recovery. */
export async function listRunningRuns(): Promise<
  { id: string; executorRef: string | null }[]
> {
  const res = await query<{ id: string; executor_ref: string | null }>(
    "SELECT id, executor_ref FROM worker_runs WHERE status = 'running'",
  );
  return res.rows.map((r) => ({ id: r.id, executorRef: r.executor_ref }));
}

/** Is any run of this worker queued or running? */
export async function hasActiveRun(workerId: string): Promise<boolean> {
  const res = await query(
    "SELECT 1 FROM worker_runs WHERE worker_id = $1 AND status IN ('queued','running') LIMIT 1",
    [workerId],
  );
  return (res.rowCount ?? 0) > 0;
}

export async function getRun(runId: string): Promise<WorkerRun | null> {
  const res = await query("SELECT * FROM worker_runs WHERE id = $1", [runId]);
  return res.rows[0] ? toRun(res.rows[0]) : null;
}

export async function listRuns(
  workerId: string,
  limit = 20,
): Promise<WorkerRun[]> {
  const res = await query(
    "SELECT * FROM worker_runs WHERE worker_id = $1 ORDER BY queued_at DESC LIMIT $2",
    [workerId, limit],
  );
  return res.rows.map(toRun);
}

/** Latest run per worker, keyed by worker id. */
export async function lastRunsByWorker(): Promise<Map<string, WorkerRun>> {
  const res = await query(
    `SELECT DISTINCT ON (worker_id) * FROM worker_runs
      ORDER BY worker_id, queued_at DESC`,
  );
  return new Map(res.rows.map((r) => [r.worker_id as string, toRun(r)]));
}

/**
 * The worker's "brief": the most recent successful full report (a run with
 * no question), falling back to the most recent answer when none exists.
 */
export async function latestBrief(workerId: string): Promise<WorkerRun | null> {
  const res = await query(
    `SELECT * FROM worker_runs
      WHERE worker_id = $1 AND status = 'succeeded' AND summary IS NOT NULL
      ORDER BY (input = '') DESC, finished_at DESC LIMIT 1`,
    [workerId],
  );
  return res.rows[0] ? toRun(res.rows[0]) : null;
}

/** Automatic (schedule/continuous) runs queued since `since`. */
export async function countAutomaticRunsSince(
  workerId: string,
  since: Date,
): Promise<number> {
  const res = await query<{ n: string }>(
    `SELECT count(*) AS n FROM worker_runs
      WHERE worker_id = $1 AND trigger IN ('schedule','continuous') AND queued_at >= $2`,
    [workerId, since.toISOString()],
  );
  return Number(res.rows[0]?.n ?? 0);
}

/** Statuses of the most recent finished runs, newest first. */
export async function recentFinishedStatuses(
  workerId: string,
  n: number,
): Promise<RunStatus[]> {
  const res = await query<{ status: RunStatus }>(
    `SELECT status FROM worker_runs
      WHERE worker_id = $1 AND finished_at IS NOT NULL
      ORDER BY finished_at DESC LIMIT $2`,
    [workerId, n],
  );
  return res.rows.map((r) => r.status);
}

/** Fail one still-running run whose execution was verified stopped. */
export async function failRunningRun(
  runId: string,
  error: string,
): Promise<boolean> {
  const res = await query(
    `UPDATE worker_runs SET status = 'failed', error = $2, finished_at = now()
      WHERE id = $1 AND status = 'running'`,
    [runId, error],
  );
  return (res.rowCount ?? 0) > 0;
}

/** Oldest queued runs across all workers (the leader's work queue). */
export async function listQueuedRuns(limit = 10): Promise<WorkerRun[]> {
  const res = await query(
    "SELECT * FROM worker_runs WHERE status = 'queued' ORDER BY queued_at LIMIT $1",
    [limit],
  );
  return res.rows.map(toRun);
}

/** Cancel a queued run, or flag a running one; returns the updated run. */
export async function cancelQueuedRun(
  runId: string,
): Promise<WorkerRun | null> {
  const res = await query(
    `UPDATE worker_runs SET status = 'cancelled', finished_at = now(), error = 'cancelled by operator'
      WHERE id = $1 AND status = 'queued' RETURNING *`,
    [runId],
  );
  return res.rows[0] ? toRun(res.rows[0]) : null;
}

/**
 * Delete finished runs (and, by cascade, their events) older than `days`.
 * Queued/running rows are never pruned: they hold the one-active-run
 * exclusion and the recovery reference of an execution still being cleaned up.
 */
export async function pruneRuns(days: number): Promise<number> {
  const res = await query(
    `DELETE FROM worker_runs
      WHERE status NOT IN ('queued','running')
        AND finished_at < now() - make_interval(days => $1)`,
    [days],
  );
  return res.rowCount ?? 0;
}

// ============================================================================
// Run events
// ============================================================================

export async function appendRunEvent(
  runId: string,
  seq: number,
  event: RunEvent,
): Promise<void> {
  await query(
    `INSERT INTO worker_run_events (run_id, seq, type, text, tool, data)
       VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      runId,
      seq,
      event.type,
      event.text ?? null,
      event.tool ?? null,
      event.data === undefined ? null : JSON.stringify(event.data),
    ],
  );
}

export async function listRunEvents(
  runId: string,
  afterSeq = -1,
  limit = 500,
): Promise<WorkerRunEvent[]> {
  const res = await query(
    `SELECT * FROM worker_run_events WHERE run_id = $1 AND seq > $2
      ORDER BY seq LIMIT $3`,
    [runId, afterSeq, limit],
  );
  return res.rows.map(toEvent);
}
