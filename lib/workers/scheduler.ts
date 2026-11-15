/**
 * Worker scheduler (docs/plans/digital-workers.md §4.1, §4.5).
 *
 * Started once per web process from instrumentation.ts. Exactly one process
 * leads, chosen with a session-level Postgres advisory lock held on a
 * dedicated connection; only the leader creates automatic runs and executes
 * queued runs. API handlers only queue runs, so every instance can accept
 * requests while execution stays single-leader.
 */

import { Cron } from "croner";
import type { PoolClient } from "pg";
import { getClient } from "@/lib/db/pg";
import {
  removeLabelledContainers,
  resolveExecutor,
  stopExecutionAndWait,
  stopHostRunAndWait,
} from "./cli-runner";
import { executeRun } from "./runner";
import {
  RunConflictError,
  cancelQueuedRun,
  cancelRequestedAmong,
  countAutomaticRunsSince,
  createRun,
  failRunningRun,
  lastRunsByWorker,
  listQueuedRuns,
  listRunningRuns,
  listWorkers,
  pruneRuns,
  requestCancel,
} from "./store";
import type { Worker, WorkerRun } from "@/types/workers";

/** Advisory lock key: "daaxwork" as a 64-bit integer. */
const LEADER_LOCK_KEY = "7233451377399509611";
const TICK_MS = 5_000;
const TRIGGER_EVERY_MS = 30_000;
const PRUNE_EVERY_MS = 60 * 60 * 1000;

function maxConcurrent(): number {
  const n = Number(process.env.WORKERS_MAX_CONCURRENT);
  return Number.isInteger(n) && n > 0 ? n : 2;
}

function retentionDays(): number {
  const n = Number(process.env.WORKERS_RETENTION_DAYS);
  return Number.isInteger(n) && n > 0 ? n : 30;
}

/** Next cron fire time strictly after `after` (UTC), or null. */
export function nextCronRun(expr: string, after: Date): Date | null {
  try {
    return new Cron(expr, { timezone: "UTC", paused: true }).nextRun(after);
  } catch {
    return null;
  }
}

/**
 * Decide whether an automatic run is due. Pure, so it is unit-tested apart
 * from the database and timers.
 */
export function automaticTriggerDue(
  worker: Pick<Worker, "enabled" | "runMode" | "cron" | "cooldownSeconds">,
  lastRun: Pick<WorkerRun, "status" | "finishedAt" | "queuedAt"> | null,
  lastEvaluated: Date,
  now: Date,
): boolean {
  if (!worker.enabled) return false;
  if (lastRun && (lastRun.status === "queued" || lastRun.status === "running"))
    return false;
  if (worker.runMode === "schedule") {
    if (!worker.cron) return false;
    const next = nextCronRun(worker.cron, lastEvaluated);
    return next !== null && next.getTime() <= now.getTime();
  }
  if (worker.runMode === "continuous") {
    if (!lastRun) return true;
    const since = new Date(lastRun.finishedAt ?? lastRun.queuedAt).getTime();
    return now.getTime() - since >= worker.cooldownSeconds * 1000;
  }
  return false;
}

/** When the worker will next run automatically (for display). */
export function nextRunAt(
  worker: Pick<Worker, "enabled" | "runMode" | "cron" | "cooldownSeconds">,
  lastRun: Pick<WorkerRun, "status" | "finishedAt" | "queuedAt"> | null,
  now: Date,
): string | null {
  if (!worker.enabled) return null;
  if (worker.runMode === "schedule" && worker.cron) {
    return nextCronRun(worker.cron, now)?.toISOString() ?? null;
  }
  if (worker.runMode === "continuous") {
    if (!lastRun) return now.toISOString();
    if (lastRun.status === "queued" || lastRun.status === "running")
      return null;
    const since = new Date(lastRun.finishedAt ?? lastRun.queuedAt).getTime();
    return new Date(since + worker.cooldownSeconds * 1000).toISOString();
  }
  return null;
}

export class WorkerScheduler {
  private timer: NodeJS.Timeout | null = null;
  private lockClient: PoolClient | null = null;
  private leader = false;
  private ticking = false;
  private lastTriggerCheck = 0;
  private lastPrune = 0;
  /** Per-worker schedule cursor: fires in (cursor, now] are due. */
  private readonly evaluatedAt = new Map<string, Date>();
  private leaderSince = new Date();
  private readonly inFlight = new Map<string, AbortController>();
  /** Only a started scheduler leads or executes (WORKERS_SCHEDULER=off). */
  private started = false;

  start(): void {
    if (this.timer) return;
    this.started = true;
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.timer.unref();
    void this.tick();
  }

  async stop(): Promise<void> {
    this.started = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.abortAll();
    await this.releaseLeadership();
  }

  isLeader(): boolean {
    return this.leader;
  }

  /** Is this instance executing the run right now? */
  isExecuting(runId: string): boolean {
    return this.inFlight.has(runId);
  }

  /** Execute queued runs now instead of waiting for the next tick. */
  kick(): void {
    if (this.started) void this.tick();
  }

  /**
   * Cancel a run from any instance. Queued → cancelled immediately; running
   * here → aborted; running on another instance → a persisted request that
   * the executing leader acts on within one tick. False if nothing to cancel.
   */
  async cancel(runId: string): Promise<boolean> {
    const controller = this.inFlight.get(runId);
    if (controller) {
      controller.abort();
      return true;
    }
    if ((await cancelQueuedRun(runId)) !== null) return true;
    return requestCancel(runId);
  }

  private abortAll(): void {
    for (const c of this.inFlight.values()) c.abort();
  }

  /** Lost the lock: stop executing, so the next leader never runs a duplicate. */
  private loseLeadership(reason: string): void {
    if (!this.leader && !this.lockClient) return;
    console.error(
      `[workers] scheduler leadership lost (${reason}); aborting in-flight runs`,
    );
    this.leader = false;
    this.lockClient = null;
    this.abortAll();
  }

  /**
   * Stop whatever a dead leader left running before its runs are marked
   * failed, so a worker never has two executions at once.
   */
  /**
   * Release runs marked running that this leader is not executing — left by
   * a dead leader, or kept after a failed cleanup — but only once their
   * execution is verified stopped. Unverifiable ones stay running (so the
   * worker cannot start a second execution) and are retried every tick.
   */
  private async reconcile(): Promise<number> {
    let released = 0;
    for (const r of await listRunningRuns()) {
      if (this.inFlight.has(r.id)) continue;
      const ref = r.executorRef;
      try {
        if (ref?.startsWith("container:")) await stopExecutionAndWait(ref);
        else if (ref?.startsWith("host:")) await stopHostRunAndWait(r.id, ref);
        // No ref: the executor reference is written before any spawn, so
        // this run never started an execution.
      } catch (err) {
        console.error(
          `[workers] run ${r.id}: cleanup not verified, keeping it active:`,
          (err as Error).message,
        );
        continue;
      }
      if (
        await failRunningRun(
          r.id,
          "interrupted: execution was stopped by the scheduler",
        )
      ) {
        released++;
      }
    }
    return released;
  }

  private async acquireLeadership(): Promise<void> {
    const client = await getClient();
    let locked = false;
    try {
      const res = await client.query<{ ok: boolean }>(
        "SELECT pg_try_advisory_lock($1::bigint) AS ok",
        [LEADER_LOCK_KEY],
      );
      locked = res.rows[0]?.ok === true;
      if (!locked) {
        client.release();
        return;
      }
      // Leadership is published only after recovery succeeds. Labelled
      // containers can only belong to a previous leader at this point.
      if (resolveExecutor("auto") === "container") removeLabelledContainers();
      const failed = await this.reconcile();
      client.on("error", () => this.loseLeadership("lock connection error"));
      this.lockClient = client;
      this.leader = true;
      this.leaderSince = new Date();
      this.evaluatedAt.clear();
      console.log(
        `[workers] scheduler leadership acquired${failed ? ` (${failed} interrupted run(s) marked failed)` : ""}`,
      );
    } catch (err) {
      if (locked) {
        await client
          .query("SELECT pg_advisory_unlock($1::bigint)", [LEADER_LOCK_KEY])
          .catch(() => undefined);
      }
      // Destroy rather than return a possibly lock-holding session to the pool.
      client.release(err instanceof Error ? err : true);
      throw err;
    }
  }

  private async releaseLeadership(): Promise<void> {
    const client = this.lockClient;
    this.leader = false;
    this.lockClient = null;
    if (!client) return;
    try {
      await client.query("SELECT pg_advisory_unlock($1::bigint)", [
        LEADER_LOCK_KEY,
      ]);
    } finally {
      client.release();
    }
  }

  private async tick(): Promise<void> {
    if (this.ticking || !this.started) return;
    this.ticking = true;
    try {
      const wasLeader = this.leader;
      if (!wasLeader) await this.acquireLeadership();
      if (!this.leader) return;
      await this.applyCancelRequests();
      // Acquisition already reconciled; afterwards, every tick retries.
      if (wasLeader) await this.reconcile();
      const now = Date.now();
      if (now - this.lastTriggerCheck >= TRIGGER_EVERY_MS) {
        this.lastTriggerCheck = now;
        await this.createDueRuns(new Date(now));
      }
      await this.dispatchQueued();
      if (now - this.lastPrune >= PRUNE_EVERY_MS) {
        this.lastPrune = now;
        const n = await pruneRuns(retentionDays());
        if (n)
          console.log(
            `[workers] pruned ${n} run(s) older than ${retentionDays()} days`,
          );
      }
    } catch (err) {
      console.error("[workers] scheduler tick failed:", (err as Error).message);
    } finally {
      this.ticking = false;
    }
  }

  private async applyCancelRequests(): Promise<void> {
    const ids = await cancelRequestedAmong([...this.inFlight.keys()]);
    for (const id of ids) this.inFlight.get(id)?.abort();
  }

  private async createDueRuns(now: Date): Promise<void> {
    const [workers, lastRuns] = await Promise.all([
      listWorkers(),
      lastRunsByWorker(),
    ]);
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    for (const worker of workers) {
      // Missed fires while daax was down (or before this leader) are not
      // back-filled: each worker's cursor starts at leadership.
      const since = this.evaluatedAt.get(worker.id) ?? this.leaderSince;
      const last = lastRuns.get(worker.id) ?? null;
      try {
        if (!automaticTriggerDue(worker, last, since, now)) continue;
        const count = await countAutomaticRunsSince(worker.id, dayAgo);
        if (count >= worker.maxRunsPerDay) continue;
        const trigger =
          worker.runMode === "schedule" ? "schedule" : "continuous";
        await createRun(worker, trigger, "", "scheduler");
      } catch (err) {
        if (!(err instanceof RunConflictError)) {
          // Leave this worker's cursor where it was; retry next pass.
          console.error(
            `[workers] trigger check failed for ${worker.slug}:`,
            (err as Error).message,
          );
          continue;
        }
      }
      this.evaluatedAt.set(worker.id, now);
    }
  }

  private async dispatchQueued(): Promise<void> {
    const free = maxConcurrent() - this.inFlight.size;
    if (free <= 0) return;
    const queued = await listQueuedRuns(free + this.inFlight.size);
    for (const run of queued) {
      if (!this.leader || this.inFlight.size >= maxConcurrent()) break;
      if (this.inFlight.has(run.id)) continue;
      const controller = new AbortController();
      this.inFlight.set(run.id, controller);
      void executeRun(run.id, controller.signal)
        .catch((err) =>
          console.error(
            `[workers] run ${run.id} crashed:`,
            (err as Error).message,
          ),
        )
        .finally(() => {
          this.inFlight.delete(run.id);
          this.kick();
        });
    }
  }
}

const GLOBAL_KEY = Symbol.for("daax.workers.scheduler");
type GlobalWithScheduler = typeof globalThis & {
  [GLOBAL_KEY]?: WorkerScheduler;
};

/** The process-wide scheduler (survives dev hot reloads). */
export function getScheduler(): WorkerScheduler {
  const g = globalThis as GlobalWithScheduler;
  if (!g[GLOBAL_KEY]) g[GLOBAL_KEY] = new WorkerScheduler();
  return g[GLOBAL_KEY]!;
}
