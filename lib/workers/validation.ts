/**
 * Digital Workers — request-body validation (system boundary).
 *
 * Every /api/workers route parses its body through these functions. They
 * return a discriminated result instead of throwing so routes map failures to
 * a 400 with a precise message.
 */

import { Cron } from "croner";
import {
  GOAL_STATUSES,
  WORKER_AUTONOMY,
  WORKER_ENGINES,
  WORKER_EXECUTORS,
  WORKER_ROLES,
  WORKER_RUN_MODES,
  UUID_RE,
  type GoalStatus,
  type WorkerMcpServer,
} from "@/types/workers";
import { isReservedEnvName } from "./mcp";
import type { GoalInput, WorkerInput, WorkerPatch } from "./store";

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export const LIMITS = {
  nameMax: 100,
  descriptionMax: 2_000,
  instructionsMax: 20_000,
  modelMax: 100,
  cronMax: 100,
  pathMax: 1_024,
  mcpServersMax: 20,
  goalTitleMax: 200,
  goalTextMax: 5_000,
  askMax: 4_000,
  cooldownMin: 300,
  cooldownMax: 86_400,
  runsPerDayMin: 1,
  runsPerDayMax: 288,
  timeoutMin: 60,
  timeoutMax: 3_600,
} as const;

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,48}$/;
const MCP_ID_RE = /^[A-Za-z0-9_.-]{1,64}$/;
const ENV_NAME_RE = /^[A-Z_][A-Z0-9_]{0,63}$/;

type Body = Record<string, unknown>;

function isObject(v: unknown): v is Body {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(
  body: Body,
  key: string,
  max: number,
  errors: string[],
): string | undefined {
  const v = body[key];
  if (v === undefined) return undefined;
  if (typeof v !== "string") {
    errors.push(`${key} must be a string`);
    return undefined;
  }
  if (v.length > max) errors.push(`${key} must be at most ${max} characters`);
  return v;
}

function nullableStr(
  body: Body,
  key: string,
  max: number,
  errors: string[],
): string | null | undefined {
  if (body[key] === null) return null;
  const v = str(body, key, max, errors);
  return v === "" ? null : v;
}

function int(
  body: Body,
  key: string,
  min: number,
  max: number,
  errors: string[],
): number | undefined {
  const v = body[key];
  if (v === undefined) return undefined;
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) {
    errors.push(`${key} must be an integer between ${min} and ${max}`);
    return undefined;
  }
  return v;
}

function oneOf<T extends string>(
  body: Body,
  key: string,
  allowed: readonly T[],
  errors: string[],
): T | undefined {
  const v = body[key];
  if (v === undefined) return undefined;
  if (typeof v !== "string" || !allowed.includes(v as T)) {
    errors.push(`${key} must be one of: ${allowed.join(", ")}`);
    return undefined;
  }
  return v as T;
}

/** Validate a cron expression; returns an error message or null. */
export function cronError(expr: string): string | null {
  try {
    new Cron(expr, { timezone: "UTC", paused: true });
    return null;
  } catch (err) {
    return `cron is invalid: ${err instanceof Error ? err.message : String(err)}`;
  }
}

function mcpServers(
  body: Body,
  errors: string[],
): WorkerMcpServer[] | undefined {
  const v = body.mcpServers;
  if (v === undefined) return undefined;
  if (!Array.isArray(v) || v.length > LIMITS.mcpServersMax) {
    errors.push(
      `mcpServers must be an array of at most ${LIMITS.mcpServersMax}`,
    );
    return undefined;
  }
  const out: WorkerMcpServer[] = [];
  const seen = new Set<string>();
  for (const [i, raw] of v.entries()) {
    const at = `mcpServers[${i}]`;
    if (
      !isObject(raw) ||
      typeof raw.id !== "string" ||
      !MCP_ID_RE.test(raw.id)
    ) {
      errors.push(`${at}.id must match ${MCP_ID_RE}`);
      continue;
    }
    if (seen.has(raw.id)) {
      errors.push(`${at}.id "${raw.id}" is duplicated`);
      continue;
    }
    seen.add(raw.id);
    if (raw.kind === "ref") {
      out.push({ kind: "ref", id: raw.id });
      continue;
    }
    if (raw.kind !== "inline") {
      errors.push(`${at}.kind must be "ref" or "inline"`);
      continue;
    }
    if (raw.type !== "stdio" && raw.type !== "http") {
      errors.push(`${at}.type must be "stdio" or "http"`);
      continue;
    }
    if (raw.type === "stdio") {
      if (typeof raw.command !== "string" || !raw.command.trim()) {
        errors.push(`${at}.command is required for stdio servers`);
        continue;
      }
      if (
        raw.args !== undefined &&
        (!Array.isArray(raw.args) ||
          raw.args.length > 50 ||
          !raw.args.every((a) => typeof a === "string" && a.length <= 1_000))
      ) {
        errors.push(`${at}.args must be an array of strings`);
        continue;
      }
    } else {
      let okUrl = false;
      try {
        const u = new URL(String(raw.url));
        okUrl = u.protocol === "https:" || u.protocol === "http:";
      } catch {
        okUrl = false;
      }
      if (!okUrl) {
        errors.push(`${at}.url must be an http(s) URL`);
        continue;
      }
    }
    const env = raw.envPassthrough;
    if (
      env !== undefined &&
      (!Array.isArray(env) ||
        env.length > 20 ||
        !env.every((e) => typeof e === "string" && ENV_NAME_RE.test(e)))
    ) {
      errors.push(
        `${at}.envPassthrough must list environment variable NAMES (values are never stored)`,
      );
      continue;
    }
    const reserved = ((env as string[] | undefined) ?? []).filter(
      isReservedEnvName,
    );
    if (reserved.length) {
      errors.push(
        `${at}.envPassthrough cannot include daax or engine variables: ${reserved.join(", ")}`,
      );
      continue;
    }
    out.push({
      kind: "inline",
      id: raw.id,
      type: raw.type,
      command: raw.type === "stdio" ? String(raw.command) : undefined,
      args:
        raw.type === "stdio" ? (raw.args as string[] | undefined) : undefined,
      url: raw.type === "http" ? String(raw.url) : undefined,
      envPassthrough: env as string[] | undefined,
    });
  }
  return out;
}

function parseWorkerFields(body: Body, errors: string[]): WorkerPatch {
  const patch: WorkerPatch = {
    name: str(body, "name", LIMITS.nameMax, errors),
    role: oneOf(body, "role", WORKER_ROLES, errors),
    description: str(body, "description", LIMITS.descriptionMax, errors),
    instructions: str(body, "instructions", LIMITS.instructionsMax, errors),
    engine: oneOf(body, "engine", WORKER_ENGINES, errors),
    model: nullableStr(body, "model", LIMITS.modelMax, errors),
    runMode: oneOf(body, "runMode", WORKER_RUN_MODES, errors),
    cron: nullableStr(body, "cron", LIMITS.cronMax, errors),
    cooldownSeconds: int(
      body,
      "cooldownSeconds",
      LIMITS.cooldownMin,
      LIMITS.cooldownMax,
      errors,
    ),
    maxRunsPerDay: int(
      body,
      "maxRunsPerDay",
      LIMITS.runsPerDayMin,
      LIMITS.runsPerDayMax,
      errors,
    ),
    timeoutSeconds: int(
      body,
      "timeoutSeconds",
      LIMITS.timeoutMin,
      LIMITS.timeoutMax,
      errors,
    ),
    autonomy: oneOf(body, "autonomy", WORKER_AUTONOMY, errors),
    executor: oneOf(body, "executor", WORKER_EXECUTORS, errors),
    workingDir: nullableStr(body, "workingDir", LIMITS.pathMax, errors),
    mcpServers: mcpServers(body, errors),
  };
  if (body.enabled !== undefined) {
    if (typeof body.enabled !== "boolean")
      errors.push("enabled must be a boolean");
    else patch.enabled = body.enabled;
  }
  if (patch.name !== undefined && !patch.name.trim()) {
    errors.push("name must not be empty");
  }
  if (patch.cron) {
    const e = cronError(patch.cron);
    if (e) errors.push(e);
  }
  // Absolute, or relative to the workspace root (portable between host and
  // container mode). Confinement is enforced at run time on the real path.
  if (patch.workingDir && patch.workingDir.includes("\0")) {
    errors.push("workingDir must not contain NUL");
  }
  return patch;
}

function stripUndefined<T extends object>(o: T): T {
  return Object.fromEntries(
    Object.entries(o).filter(([, v]) => v !== undefined),
  ) as T;
}

/** Validate a create body. `slug` and `name` are required. */
export function parseWorkerCreate(body: unknown): Result<WorkerInput> {
  if (!isObject(body))
    return { ok: false, error: "body must be a JSON object" };
  const errors: string[] = [];
  const slug = body.slug;
  if (typeof slug !== "string" || !SLUG_RE.test(slug)) {
    errors.push(
      "slug is required: lowercase letters, digits and dashes, 2-49 characters",
    );
  } else if (UUID_RE.test(slug)) {
    // Workers are looked up by id or slug; a UUID-shaped slug is ambiguous.
    errors.push("slug must not look like a UUID");
  }
  if (typeof body.name !== "string") errors.push("name is required");
  const patch = parseWorkerFields(body, errors);
  const mode = patch.runMode ?? "adhoc";
  if (mode === "schedule" && !patch.cron) {
    errors.push("cron is required when runMode is schedule");
  }
  if (errors.length) return { ok: false, error: errors.join("; ") };
  return {
    ok: true,
    value: stripUndefined({
      ...patch,
      slug: slug as string,
      name: patch.name!,
    }),
  };
}

/**
 * Validate an update body. Cross-field rules are checked against the merged
 * result by the caller via `checkRunPolicy`.
 */
export function parseWorkerPatch(body: unknown): Result<WorkerPatch> {
  if (!isObject(body))
    return { ok: false, error: "body must be a JSON object" };
  if ("slug" in body) return { ok: false, error: "slug cannot be changed" };
  const errors: string[] = [];
  const patch = parseWorkerFields(body, errors);
  if (errors.length) return { ok: false, error: errors.join("; ") };
  return { ok: true, value: stripUndefined(patch) };
}

/** Cross-field run-policy rule, applied to the merged worker. */
export function checkRunPolicy(w: {
  runMode: string;
  cron: string | null;
}): string | null {
  if (w.runMode === "schedule" && !w.cron) {
    return "cron is required when runMode is schedule";
  }
  return null;
}

export function parseGoal(
  body: unknown,
  partial: boolean,
): Result<Partial<GoalInput>> {
  if (!isObject(body))
    return { ok: false, error: "body must be a JSON object" };
  const errors: string[] = [];
  const title = str(body, "title", LIMITS.goalTitleMax, errors);
  if (!partial && (!title || !title.trim())) errors.push("title is required");
  if (partial && title !== undefined && !title.trim()) {
    errors.push("title must not be empty");
  }
  const value: Partial<GoalInput> = {
    title: title?.trim(),
    description: str(body, "description", LIMITS.goalTextMax, errors),
    projectRef: nullableStr(body, "projectRef", LIMITS.pathMax, errors),
    successCriteria: str(body, "successCriteria", LIMITS.goalTextMax, errors),
    status: oneOf<GoalStatus>(body, "status", GOAL_STATUSES, errors),
    priority: int(body, "priority", -100, 100, errors),
  };
  if (errors.length) return { ok: false, error: errors.join("; ") };
  return { ok: true, value: stripUndefined(value) };
}

/** Validate an ad hoc run / ask body. */
export function parseRunRequest(
  body: unknown,
): Result<{ input: string; trigger: "adhoc" | "cli" | "voice" }> {
  const b = body === undefined || body === null ? {} : body;
  if (!isObject(b)) return { ok: false, error: "body must be a JSON object" };
  const errors: string[] = [];
  const input = str(b, "input", LIMITS.askMax, errors) ?? "";
  const trigger =
    oneOf(b, "trigger", ["adhoc", "cli", "voice"] as const, errors) ?? "adhoc";
  if (errors.length) return { ok: false, error: errors.join("; ") };
  return { ok: true, value: { input: input.trim(), trigger } };
}
