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
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { requireAuth } from "@/lib/auth";
import { isAiSessionName } from "@/lib/ai-session-name";

const execFileAsync = promisify(execFile);

const DAAX_NAME_PREFIX = "daax-";
const DEFAULT_IDLE_THRESHOLD_SECONDS = 30 * 60;

interface ReapResult {
  containerName: string;
  removed: boolean;
  idleSeconds: number;
  reason?: string;
}

async function listDaaxContainerNames(): Promise<string[]> {
  const { stdout } = await execFileAsync(
    "docker",
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

async function lastActivityMs(name: string): Promise<number> {
  // Last activity = max(StartedAt, last log line timestamp).
  let startedAt = 0;
  try {
    const { stdout } = await execFileAsync("docker", [
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
    const { stdout } = await execFileAsync(
      "docker",
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
    const names = await listDaaxContainerNames();
    const now = Date.now();
    const results: ReapResult[] = [];

    for (const name of names) {
      const lastMs = await lastActivityMs(name);
      const idleSeconds =
        lastMs > 0
          ? Math.floor((now - lastMs) / 1000)
          : Number.MAX_SAFE_INTEGER;

      if (idleSeconds < idleThresholdSeconds) {
        results.push({ containerName: name, removed: false, idleSeconds });
        continue;
      }

      try {
        await execFileAsync("docker", ["rm", "-f", name]);
        results.push({ containerName: name, removed: true, idleSeconds });
      } catch (err) {
        results.push({
          containerName: name,
          removed: false,
          idleSeconds,
          reason: err instanceof Error ? err.message : "rm failed",
        });
      }
    }

    const reaped = results.filter((r) => r.removed).length;
    return NextResponse.json({
      success: true,
      idleThresholdSeconds,
      reaped,
      results,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Reap failed",
      },
      { status: 500 },
    );
  }
}
