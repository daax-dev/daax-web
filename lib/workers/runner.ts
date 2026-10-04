/**
 * Executes one queued run end to end: resolve tools, build the tool policy
 * and prompts, collect project signals, run the worker's engine, persist the
 * (redacted) event stream, record the outcome, and auto-pause a worker after
 * repeated automatic failures.
 *
 * One deadline covers the whole run — tool discovery, signal collection and
 * the engine — starting when the run is claimed.
 */

import { randomUUID } from "node:crypto";
import { realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { maskSecrets } from "@/lib/redaction/mask";
import { clip } from "./events";
import {
  ExecutionCleanupError,
  baseChildEnv,
  runCliEngine,
  runMarker,
  type CliRunResult,
} from "./cli-runner";
import {
  listServerTools,
  resolveMcpServers,
  type McpToolInfo,
  type ResolvedMcpServer,
} from "./mcp";
import { buildPrompts, buildToolPolicy } from "./plan";
import { runSdkEngine } from "./sdk-runner";
import { collectSignals } from "./signals";
import {
  appendRunEvent,
  finishRun,
  getRun,
  getWorker,
  listGoals,
  markRunStarted,
  recentFinishedStatuses,
  setExecutorRef,
  updateWorker,
} from "./store";
import { resolveWorkspaceRoot } from "./workspace";
import type { RunEvent, RunStatus, Worker, WorkerRun } from "@/types/workers";

/** Consecutive failed automatic runs before a worker is paused. */
export const FAILURE_PAUSE_THRESHOLD = 3;

export class WorkingDirError extends Error {}

/**
 * The worker's working directory: absolute or relative to the workspace root,
 * resolved through symlinks, and required to be an existing directory inside
 * the (also resolved) workspace root.
 */
export function resolveWorkingDir(
  worker: Pick<Worker, "workingDir">,
  root: string,
): string {
  let realRoot: string;
  try {
    realRoot = realpathSync(root);
  } catch {
    throw new WorkingDirError(`workspace root ${root} does not exist`);
  }
  if (!worker.workingDir) return realRoot;
  const target = isAbsolute(worker.workingDir)
    ? worker.workingDir
    : resolve(realRoot, worker.workingDir);
  let real: string;
  try {
    real = realpathSync(target);
  } catch {
    throw new WorkingDirError(`workingDir ${worker.workingDir} does not exist`);
  }
  const rel = relative(realRoot, real);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new WorkingDirError("workingDir is outside the workspace");
  }
  if (!statSync(real).isDirectory()) {
    throw new WorkingDirError(
      `workingDir ${worker.workingDir} is not a directory`,
    );
  }
  return real;
}

export function outcomeStatus(result: CliRunResult): RunStatus {
  if (result.cancelled) return "cancelled";
  if (result.timedOut) return "timeout";
  return result.final.ok ? "succeeded" : "failed";
}

/** Secret values that must never be stored in run history. */
export function knownSecretValues(
  servers: ResolvedMcpServer[],
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const values = servers.flatMap((s) => Object.values(s.env));
  for (const [k, v] of Object.entries(env)) {
    if (
      v &&
      /(TOKEN|SECRET|PASSWORD|API_KEY|DATABASE_URL|PRIVATE|CREDENTIAL)/.test(k)
    ) {
      values.push(v);
    }
  }
  // maskSecrets ignores values shorter than 4 characters.
  return values.filter((v) => v.length >= 4);
}

/** Redact secrets from any string inside an event (text and data). */
/**
 * Redact one stored string: first remove every known secret literal from the
 * RAW string (so values inside ANSI/OSC escape payloads, which the
 * presentation masker preserves, are gone too), then apply the pattern
 * masker for secrets of known shapes.
 */
export function redactString(s: string, knownValues: string[]): string {
  let out = s;
  for (const v of knownValues) {
    if (v.length >= 4 && out.includes(v)) out = out.split(v).join("[redacted]");
  }
  return maskSecrets(out, { knownValues });
}

/** Redact every string in a JSON-like value, keys included. */
export function redactValue<T>(value: T, knownValues: string[]): T {
  const mask = (s: string) => redactString(s, knownValues);
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") return mask(v);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>).map(([k, x]) => [
          // Keys are redacted too: tool-call arguments are structured.
          mask(k),
          walk(x),
        ]),
      );
    }
    return v;
  };
  return walk(value) as T;
}

/** Redact every string an event carries: text, tool, data keys and values. */
export function redactEvent(e: RunEvent, knownValues: string[]): RunEvent {
  const mask = (s: string) => redactString(s, knownValues);
  const walk = (v: unknown) => redactValue(v, knownValues);
  return {
    ...e,
    text: e.text === undefined ? undefined : clip(mask(e.text)),
    tool: e.tool === undefined ? undefined : mask(e.tool),
    data: e.data === undefined ? undefined : walk(e.data),
  };
}

/** Pause an automatic worker whose last N runs all failed. */
export async function applyFailurePolicy(worker: Worker): Promise<boolean> {
  if (worker.runMode === "adhoc" || !worker.enabled) return false;
  const recent = await recentFinishedStatuses(
    worker.id,
    FAILURE_PAUSE_THRESHOLD,
  );
  const failing =
    recent.length === FAILURE_PAUSE_THRESHOLD &&
    recent.every((s) => s === "failed" || s === "timeout");
  if (!failing) return false;
  await updateWorker(worker.id, {
    enabled: false,
    pausedReason: `paused after ${FAILURE_PAUSE_THRESHOLD} consecutive failed runs`,
  });
  return true;
}

export async function executeRun(
  runId: string,
  signal: AbortSignal,
): Promise<WorkerRun | null> {
  const run = await getRun(runId);
  if (!run || run.status !== "queued") return run;
  const worker = await getWorker(run.workerId);
  if (!worker) {
    return finishRun(runId, {
      status: "failed",
      error: "worker no longer exists",
    });
  }

  if (!(await markRunStarted(runId))) return getRun(runId);
  const timeoutMs = worker.timeoutSeconds * 1000;
  const startedAt = Date.now();
  const deadline = AbortSignal.timeout(timeoutMs);
  const runSignal = AbortSignal.any([signal, deadline]);
  const remainingMs = () => Math.max(1, timeoutMs - (Date.now() - startedAt));

  let secrets = knownSecretValues([]);
  const redact = (s: string | null | undefined) =>
    s == null ? s : redactString(s, secrets);
  let seq = 0;
  let engineVersion: string | undefined;
  const onEvent = async (e: RunEvent) => {
    const data = e.data as { version?: string } | undefined;
    if (e.type === "system" && typeof data?.version === "string")
      engineVersion = data.version;
    try {
      await appendRunEvent(runId, seq++, redactEvent(e, secrets));
    } catch (err) {
      console.error(
        "[workers] failed to store run event:",
        (err as Error).message,
      );
    }
  };
  const interrupted = (): RunStatus | null =>
    signal.aborted ? "cancelled" : deadline.aborted ? "timeout" : null;

  let status: RunStatus = "failed";
  try {
    const root = resolveWorkspaceRoot();
    const workingDir = resolveWorkingDir(worker, root);
    const goals = await listGoals(worker.id, "active");

    const { resolved, missing } = resolveMcpServers(
      worker.mcpServers,
      workingDir,
    );
    secrets = knownSecretValues(resolved);
    const serverTools: Record<string, McpToolInfo[]> = {};
    const usable: ResolvedMcpServer[] = [];
    for (const server of resolved) {
      if (runSignal.aborted) break;
      try {
        serverTools[server.id] = await listServerTools(server, {
          cwd: workingDir,
          signal: runSignal,
        });
        usable.push(server);
      } catch (err) {
        // Fail closed: a server whose tools cannot be listed cannot be
        // classified, so it is not given to the engine at all.
        missing.push(`${server.id} (${(err as Error).message})`);
      }
    }
    for (const m of missing)
      await onEvent({ type: "system", text: `MCP server unavailable: ${m}` });

    const policy = buildToolPolicy(worker.autonomy, serverTools);
    await onEvent({
      type: "system",
      text: `tool policy: ${policy.allowed.length} allowed, ${policy.denied.length} denied (${worker.autonomy})`,
      data: { mcpEnabled: policy.mcpEnabled },
    });

    const signals = runSignal.aborted
      ? ""
      : await collectSignals(workingDir, baseChildEnv(), runSignal);
    const early = interrupted();
    if (early) {
      status = early;
      return await finishRun(runId, {
        status,
        error:
          early === "timeout"
            ? `timed out after ${worker.timeoutSeconds}s`
            : "cancelled by operator",
      });
    }

    const prompts = buildPrompts(
      worker,
      goals,
      run.trigger,
      run.input,
      new Date(),
      missing,
      signals,
    );
    // A fresh random nonce per execution is the marker recovery uses to find
    // this run's agent by its command line (lib/workers/cli-runner.ts). It
    // exists only in the executor reference, so nothing else can match it.
    const nonce = randomUUID();
    // The nonce must never be stored or shown (it is what makes the marker
    // unforgeable): redact it everywhere from here on.
    secrets = [...secrets, nonce];
    prompts.system += `\n\n(${runMarker(nonce)})`;
    const common = {
      model: worker.model,
      workingDir,
      prompts,
      policy,
      servers: usable,
      timeoutMs: remainingMs(),
      // The combined signal, so the run's single deadline also covers engine
      // start-up; the runner decides timeout vs cancel below.
      signal: runSignal,
      onEvent,
    };
    const result =
      worker.engine === "agent-sdk"
        ? await runSdkEngine({
            ...common,
            runId,
            nonce,
            onExecutor: (ref) => setExecutorRef(runId, ref),
          })
        : await runCliEngine({
            ...common,
            runId,
            engine: worker.engine,
            executor: worker.executor,
            nonce,
            onExecutor: (ref) => setExecutorRef(runId, ref),
          });

    status = interrupted() ?? outcomeStatus(result);
    const error =
      status === "timeout"
        ? `timed out after ${worker.timeoutSeconds}s`
        : status === "cancelled"
          ? "cancelled by operator"
          : result.final.error;
    return await finishRun(runId, {
      status,
      summary: redact(result.final.summary),
      error: status === "succeeded" ? null : redact(error),
      // Every stored value is redacted, engine-reported metadata included.
      usage: redactValue({ ...result.final.usage, engineVersion }, secrets),
    });
  } catch (err) {
    const message = redact(
      err instanceof Error ? err.message : String(err),
    ) as string;
    await onEvent({ type: "error", text: message });
    if (err instanceof ExecutionCleanupError) {
      // Keep the run active (one-run-per-worker exclusion holds) until the
      // leader's reconciliation verifies the execution stopped.
      status = "running";
      return getRun(runId);
    }
    return finishRun(runId, { status: "failed", error: message });
  } finally {
    if (status === "failed" || status === "timeout") {
      const fresh = await getWorker(worker.id).catch(() => null);
      if (fresh) await applyFailurePolicy(fresh).catch(() => false);
    }
  }
}
