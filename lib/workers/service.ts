/**
 * Read models for the API: workers with derived state (running, paused,
 * failing), last run, next automatic run, and active goal count.
 */

import { query } from "@/lib/db/pg";
import { nextRunAt } from "./scheduler";
import { getWorker, lastRunsByWorker, listRuns, listWorkers } from "./store";
import type { Worker, WorkerRun, WorkerSummary } from "@/types/workers";

export function deriveState(
  worker: Worker,
  lastRun: WorkerRun | null,
): WorkerSummary["state"] {
  if (lastRun && (lastRun.status === "queued" || lastRun.status === "running"))
    return "running";
  if (!worker.enabled && worker.pausedReason) return "paused";
  if (lastRun && (lastRun.status === "failed" || lastRun.status === "timeout"))
    return "failing";
  if (!worker.enabled && worker.runMode !== "adhoc") return "paused";
  return "idle";
}

async function activeGoalCounts(): Promise<Map<string, number>> {
  const res = await query<{ worker_id: string; n: string }>(
    "SELECT worker_id, count(*) AS n FROM worker_goals WHERE status = 'active' GROUP BY worker_id",
  );
  return new Map(res.rows.map((r) => [r.worker_id, Number(r.n)]));
}

function summarize(
  worker: Worker,
  lastRun: WorkerRun | null,
  goals: number,
  now: Date,
): WorkerSummary {
  return {
    ...worker,
    state: deriveState(worker, lastRun),
    lastRun,
    nextRunAt: nextRunAt(worker, lastRun, now),
    activeGoals: goals,
  };
}

export async function listWorkerSummaries(
  now = new Date(),
): Promise<WorkerSummary[]> {
  const [workers, lastRuns, goals] = await Promise.all([
    listWorkers(),
    lastRunsByWorker(),
    activeGoalCounts(),
  ]);
  return workers.map((w) =>
    summarize(w, lastRuns.get(w.id) ?? null, goals.get(w.id) ?? 0, now),
  );
}

export async function getWorkerSummary(
  idOrSlug: string,
  now = new Date(),
): Promise<WorkerSummary | null> {
  const worker = await getWorker(idOrSlug);
  if (!worker) return null;
  const [runs, goals] = await Promise.all([
    listRuns(worker.id, 1),
    activeGoalCounts(),
  ]);
  return summarize(worker, runs[0] ?? null, goals.get(worker.id) ?? 0, now);
}
