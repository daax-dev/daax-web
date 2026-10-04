// Client-side calls to /api/workers (browser only).

import type {
  Worker,
  WorkerEngine,
  WorkerGoal,
  WorkerRun,
  WorkerRunEvent,
  WorkerSummary,
} from "@/types/workers";

export interface EngineInfo {
  available: boolean;
  note: string;
}

export interface WorkersList {
  workers: WorkerSummary[];
  templates: { slug: string; name: string; description: string }[];
  engines: Record<WorkerEngine, EngineInfo>;
  schedulerLeader: boolean;
}

export interface WorkerDetailData {
  worker: WorkerSummary;
  goals: WorkerGoal[];
  brief: WorkerRun | null;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    message?: string;
  };
  if (!res.ok) {
    throw new ApiError(
      res.status,
      body.message
        ? `${body.error}: ${body.message}`
        : (body.error ?? res.statusText),
    );
  }
  return body as T;
}

const enc = encodeURIComponent;

export const workersApi = {
  list: () => call<WorkersList>("/api/workers"),
  createFromTemplate: (template: string) =>
    call<{ worker: Worker }>("/api/workers", {
      method: "POST",
      body: JSON.stringify({ template }),
    }),
  get: (id: string) => call<WorkerDetailData>(`/api/workers/${enc(id)}`),
  update: (id: string, patch: Partial<Worker>) =>
    call<{ worker: Worker }>(`/api/workers/${enc(id)}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  remove: (id: string) =>
    call<{ deleted: boolean }>(`/api/workers/${enc(id)}`, { method: "DELETE" }),
  addGoal: (id: string, goal: Partial<WorkerGoal>) =>
    call<{ goal: WorkerGoal }>(`/api/workers/${enc(id)}/goals`, {
      method: "POST",
      body: JSON.stringify(goal),
    }),
  updateGoal: (id: string, goalId: string, patch: Partial<WorkerGoal>) =>
    call<{ goal: WorkerGoal }>(`/api/workers/${enc(id)}/goals/${enc(goalId)}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  deleteGoal: (id: string, goalId: string) =>
    call<{ deleted: boolean }>(`/api/workers/${enc(id)}/goals/${enc(goalId)}`, {
      method: "DELETE",
    }),
  runs: (id: string, limit = 20) =>
    call<{ runs: WorkerRun[] }>(`/api/workers/${enc(id)}/runs?limit=${limit}`),
  startRun: (id: string, input = "", trigger: "adhoc" | "voice" = "adhoc") =>
    call<{ run: WorkerRun }>(`/api/workers/${enc(id)}/runs`, {
      method: "POST",
      body: JSON.stringify({ input, trigger }),
    }),
  run: (runId: string, after = -1) =>
    call<{ run: WorkerRun; events: WorkerRunEvent[]; hasMore?: boolean }>(
      `/api/workers/runs/${enc(runId)}?after=${after}`,
    ),
  cancelRun: (runId: string) =>
    call<{ cancelled: boolean }>(`/api/workers/runs/${enc(runId)}`, {
      method: "DELETE",
    }),
  mcpCatalog: () =>
    call<{ state?: { mcps?: { id: string; name: string; source: string }[] } }>(
      "/api/mcp/config",
    ),
};
