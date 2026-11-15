/** Fixtures shared by the /api/workers route tests (tests/api/workers-*.test.ts). */
import type { Worker, WorkerRun } from "@/types/workers";

export const WORKER_ID = "11111111-2222-4333-8444-555555555555";
export const RUN_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

export function workerFixture(over: Partial<Worker> = {}): Worker {
  return {
    id: WORKER_ID,
    slug: "tpm",
    name: "Technical Project Manager",
    role: "tpm",
    description: "",
    instructions: "",
    engine: "claude-cli",
    model: null,
    runMode: "schedule",
    cron: "0 8 * * *",
    cooldownSeconds: 900,
    maxRunsPerDay: 6,
    timeoutSeconds: 900,
    autonomy: "propose",
    executor: "auto",
    workingDir: null,
    mcpServers: [],
    enabled: false,
    pausedReason: null,
    createdBy: "op",
    createdAt: "2026-09-26T00:00:00.000Z",
    updatedAt: "2026-09-26T00:00:00.000Z",
    ...over,
  };
}

export function runFixture(over: Partial<WorkerRun> = {}): WorkerRun {
  return {
    id: RUN_ID,
    workerId: WORKER_ID,
    trigger: "adhoc",
    input: "",
    status: "queued",
    engine: "claude-cli",
    queuedAt: "2026-09-26T00:00:00.000Z",
    startedAt: null,
    finishedAt: null,
    summary: null,
    error: null,
    usage: {},
    requestedBy: "op",
    cancelRequested: false,
    ...over,
  };
}
