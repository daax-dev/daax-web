/**
 * Shared helpers for the /api/workers routes.
 */

import { spawnSync } from "node:child_process";
import { NextResponse } from "next/server";
import { isDbConfigured } from "@/lib/db/config";
import { agentSdkAvailable } from "./sdk-runner";
import { resolveExecutor } from "./cli-runner";
import type { WorkerEngine } from "@/types/workers";

export function jsonError(status: number, error: string, message?: string) {
  return NextResponse.json(message ? { error, message } : { error }, {
    status,
  });
}

/** Workers need Postgres; without it every route answers 503. */
export function dbUnavailable(): NextResponse | null {
  return isDbConfigured()
    ? null
    : jsonError(
        503,
        "Postgres not configured",
        "Digital workers need DATABASE_URL (or PG* variables).",
      );
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

export function serverError(context: string, err: unknown) {
  console.error(
    `[workers] ${context}:`,
    err instanceof Error ? err.message : err,
  );
  return jsonError(500, `Failed to ${context}`);
}

let cliCache: { at: number; value: Record<string, boolean> } | null = null;

function onPath(bin: string): boolean {
  return (
    spawnSync("sh", ["-c", `command -v ${bin}`], { stdio: "ignore" }).status ===
    0
  );
}

/**
 * Which engines can run here. CLI engines in container mode run inside the
 * agent image, so they are available whenever Docker is; on the host they
 * need the CLI on PATH. Cached for a minute.
 */
export function engineAvailability(): Record<
  WorkerEngine,
  { available: boolean; note: string }
> {
  const now = Date.now();
  if (!cliCache || now - cliCache.at > 60_000) {
    const container = resolveExecutor("auto") === "container";
    cliCache = {
      at: now,
      value: {
        claude: container ? onPath("docker") : onPath("claude"),
        codex: container ? onPath("docker") : onPath("codex"),
      },
    };
  }
  const where =
    resolveExecutor("auto") === "container" ? "agent container" : "host";
  return {
    "claude-cli": {
      available: cliCache.value.claude,
      note: `claude -p (${where}, subscription login)`,
    },
    "codex-cli": {
      available: cliCache.value.codex,
      note: `codex exec (${where}, subscription login)`,
    },
    "agent-sdk": {
      available: agentSdkAvailable(),
      note: agentSdkAvailable()
        ? "Claude Agent SDK (ANTHROPIC_API_KEY, metered)"
        : "Claude Agent SDK — set ANTHROPIC_API_KEY to enable",
    },
  };
}
