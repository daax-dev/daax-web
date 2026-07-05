/**
 * POST /api/ai/active-sessions/reap
 *
 * Reaps stray AI Coding container sessions whose last activity (the
 * later of container start time and most recent log line) is older
 * than `idleThresholdSeconds` (default 1800s = 30 min).
 *
 * This is the cleanup pass for sessions that escaped the per-WebSocket
 * teardown in server/handlers/connection-handler.ts. By gating on
 * "idle + no PTY output" we avoid killing long-running builds that
 * just happen to be quiet.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { isAiSessionName } from "@/lib/ai-session-name";
import { mapPool } from "@/lib/concurrency";
import {
  defaultDockerExec,
  dockerUnavailableResponse,
  isDockerUnavailableError,
  type DockerExec,
} from "@/lib/docker-exec";

const DAAX_NAME_PREFIX = "daax-";
const DEFAULT_IDLE_THRESHOLD_SECONDS = 30 * 60;
// Bound concurrent docker subprocesses per reap pass (inspect/logs/rm),
// matching the active-sessions GET route's fan-out limit.
const REAP_CONCURRENCY = 4;

interface ReapResult {
  containerName: string;
  removed: boolean;
  idleSeconds: number;
  reason?: string;
}

async function listDaaxContainerNames(exec: DockerExec): Promise<string[]> {
  const { stdout } = await exec(
    [
      "ps",
      "-a",
      "--filter",
      `name=${DAAX_NAME_PREFIX}`,
      "--format",
      "{{.Names}}",
    ],
    { maxBuffer: 1024 * 1024 },
  );
  // `docker ps --filter name=` is a substring match, so it also returns
  // infrastructure containers like daax-code-server. Keep only the exact
  // session shape — this list feeds an unconditional `docker rm -f`.
  return stdout
    .trim()
    .split("\n")
    .map((s) => s.trim())
    .filter(isAiSessionName);
}

async function lastActivityMs(name: string, exec: DockerExec): Promise<number> {
  // Last activity = max(StartedAt, last log line timestamp).
  let startedAt = 0;
  try {
    const { stdout } = await exec([
      "inspect",
      "--format",
      "{{.State.StartedAt}}",
      name,
    ]);
    startedAt = new Date(stdout.trim()).getTime() || 0;
  } catch {
    // Container may have vanished mid-iteration; treat as ancient.
  }

  let lastLog = 0;
  try {
    const { stdout } = await exec(
      ["logs", "--tail", "1", "--timestamps", name],
      { maxBuffer: 64 * 1024 },
    );
    const line = stdout.trim();
    if (line) {
      const space = line.indexOf(" ");
      if (space > 0) {
        const ts = new Date(line.slice(0, space)).getTime();
        if (!Number.isNaN(ts)) lastLog = ts;
      }
    }
  } catch {
    // No logs available — fall back to startedAt only.
  }

  return Math.max(startedAt, lastLog);
}

/**
 * Core reap pass: list candidates, compute idle time, `docker rm -f` those
 * past the threshold — via a bounded pool with per-candidate error handling.
 * Takes an injectable `exec` (defaults to the real docker shell-out) and
 * `now` so it can be unit-tested without spawning subprocesses.
 */
export async function reapSessions(
  idleThresholdSeconds: number,
  exec: DockerExec = defaultDockerExec,
  now: number = Date.now(),
): Promise<ReapResult[]> {
  const names = await listDaaxContainerNames(exec);

  // Bounded-concurrency fan-out. The per-candidate try/catch stays inside
  // the worker so one failure is reported (removed:false + reason) without
  // aborting the rest of the pass.
  return mapPool(names, REAP_CONCURRENCY, async (name): Promise<ReapResult> => {
    const lastMs = await lastActivityMs(name, exec);
    const idleSeconds =
      lastMs > 0
        ? Math.max(0, Math.floor((now - lastMs) / 1000))
        : Number.MAX_SAFE_INTEGER;

    if (idleSeconds < idleThresholdSeconds) {
      return { containerName: name, removed: false, idleSeconds };
    }

    try {
      await exec(["rm", "-f", name]);
      return { containerName: name, removed: true, idleSeconds };
    } catch (err) {
      return {
        containerName: name,
        removed: false,
        idleSeconds,
        reason: err instanceof Error ? err.message : "rm failed",
      };
    }
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  let idleThresholdSeconds = DEFAULT_IDLE_THRESHOLD_SECONDS;
  try {
    const body = await req.json();
    if (typeof body?.idleThresholdSeconds === "number") {
      // Clamp to a sane range (1 minute .. 24 hours).
      idleThresholdSeconds = Math.max(
        60,
        Math.min(24 * 60 * 60, Math.floor(body.idleThresholdSeconds)),
      );
    }
  } catch {
    // No body / invalid JSON — use defaults.
  }

  try {
    const results = await reapSessions(idleThresholdSeconds);
    const reaped = results.filter((r) => r.removed).length;
    return NextResponse.json({
      success: true,
      idleThresholdSeconds,
      reaped,
      results,
    });
  } catch (error) {
    // Split deploy (F3 #100): no Docker socket on the web plane — same
    // structured 503 as /api/containers instead of a raw 500. Manual
    // fallback: `docker ps` / `docker rm -f daax-<id>` on the host.
    if (isDockerUnavailableError(error))
      return dockerUnavailableResponse(error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Reap failed",
      },
      { status: 500 },
    );
  }
}
