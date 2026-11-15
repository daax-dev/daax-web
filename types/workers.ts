// Digital Workers — shared types (docs/plans/digital-workers.md).

/** Canonical 8-4-4-4-12 UUID. Worker slugs of this shape are rejected. */
export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const WORKER_ENGINES = ["claude-cli", "codex-cli", "agent-sdk"] as const;
export type WorkerEngine = (typeof WORKER_ENGINES)[number];

export const WORKER_RUN_MODES = ["schedule", "adhoc", "continuous"] as const;
export type WorkerRunMode = (typeof WORKER_RUN_MODES)[number];

export const WORKER_AUTONOMY = ["observe", "propose", "act"] as const;
export type WorkerAutonomy = (typeof WORKER_AUTONOMY)[number];

export const WORKER_EXECUTORS = ["auto", "host", "container"] as const;
export type WorkerExecutor = (typeof WORKER_EXECUTORS)[number];

export const WORKER_ROLES = ["tpm", "custom"] as const;
export type WorkerRole = (typeof WORKER_ROLES)[number];

export const RUN_TRIGGERS = [
  "schedule",
  "adhoc",
  "continuous",
  "cli",
  "voice",
] as const;
export type RunTrigger = (typeof RUN_TRIGGERS)[number];

export const RUN_STATUSES = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
  "timeout",
] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export const TERMINAL_RUN_STATUSES: readonly RunStatus[] = [
  "succeeded",
  "failed",
  "cancelled",
  "timeout",
];

export const GOAL_STATUSES = ["active", "done", "dropped"] as const;
export type GoalStatus = (typeof GOAL_STATUSES)[number];

/**
 * An MCP server a worker may use.
 *
 * - `ref`: points at a server discovered by the /mcp page (~/.claude.json,
 *   ~/.mcp.json, …). Resolved at run time, so its env values (which may hold
 *   tokens) are never copied into the database.
 * - `inline`: a definition stored with the worker. It holds NO env values —
 *   only the NAMES of environment variables passed through from the daax
 *   process at run time.
 */
export type WorkerMcpServer =
  | { kind: "ref"; id: string }
  | {
      kind: "inline";
      id: string;
      type: "stdio" | "http";
      command?: string;
      args?: string[];
      url?: string;
      envPassthrough?: string[];
    };

export interface Worker {
  id: string;
  slug: string;
  name: string;
  role: WorkerRole;
  description: string;
  instructions: string;
  engine: WorkerEngine;
  model: string | null;
  runMode: WorkerRunMode;
  cron: string | null;
  cooldownSeconds: number;
  maxRunsPerDay: number;
  timeoutSeconds: number;
  autonomy: WorkerAutonomy;
  executor: WorkerExecutor;
  workingDir: string | null;
  mcpServers: WorkerMcpServer[];
  enabled: boolean;
  pausedReason: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkerGoal {
  id: string;
  workerId: string;
  title: string;
  description: string;
  projectRef: string | null;
  successCriteria: string;
  status: GoalStatus;
  priority: number;
  createdAt: string;
  updatedAt: string;
}

export interface RunUsage {
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  turns?: number;
  engineVersion?: string;
}

export interface WorkerRun {
  id: string;
  workerId: string;
  trigger: RunTrigger;
  input: string;
  status: RunStatus;
  engine: WorkerEngine;
  queuedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  summary: string | null;
  error: string | null;
  usage: RunUsage;
  requestedBy: string | null;
  cancelRequested: boolean;
}

/** Engine-neutral event shape — every engine's output is mapped onto this. */
export const RUN_EVENT_TYPES = [
  "message",
  "tool_call",
  "tool_result",
  "result",
  "error",
  "system",
] as const;
export type RunEventType = (typeof RUN_EVENT_TYPES)[number];

export interface RunEvent {
  type: RunEventType;
  /** Human-readable text (assistant text, tool name, error message). */
  text?: string;
  /** Tool name for tool_call / tool_result. */
  tool?: string;
  /** Structured payload (tool input, truncated tool output, usage). */
  data?: unknown;
}

export interface WorkerRunEvent extends RunEvent {
  id: number;
  runId: string;
  seq: number;
  at: string;
}

/** Worker as returned by list/detail APIs, with derived state. */
export interface WorkerSummary extends Worker {
  state: "idle" | "running" | "paused" | "failing";
  lastRun: WorkerRun | null;
  nextRunAt: string | null;
  activeGoals: number;
}
