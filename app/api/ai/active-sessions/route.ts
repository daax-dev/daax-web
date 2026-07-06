/**
 * GET /api/ai/active-sessions
 *
 * Returns the ground-truth list of AI Coding container sessions by
 * shelling out to `docker ps` and keeping only the exact session-name
 * shape (`daax-<8 hex>`) used by server/handlers/connection-handler.ts.
 * The cheap `docker ps --filter name=daax-` prefix is a substring match,
 * so it also returns infrastructure containers like `daax-code-server`;
 * those are dropped here so the kill/reap UI never offers to remove them.
 *
 * The Next.js process can't read the terminal server's in-memory session
 * map (different process on port 4201), so we use docker as ground truth.
 * This deliberately surfaces "stray" containers that escaped teardown —
 * the management UI exists because the kill-on-disconnect policy doesn't
 * always succeed.
 */

import { NextResponse } from "next/server";
import { isAiSessionName } from "@/lib/ai-session-name";
import { mapPool } from "@/lib/concurrency";
import {
  defaultDockerExec,
  dockerUnavailableJson,
  isDockerUnavailableError,
  type DockerExec,
} from "@/lib/docker-exec";

// Cheap server-side prefilter for `docker ps`. This is a substring match,
// so results are re-filtered with isAiSessionName() before use.
const DAAX_NAME_PREFIX = "daax-";

export interface ActiveSession {
  containerName: string;
  containerId: string;
  image: string;
  command: string;
  status: string;
  state: string;
  createdAt: string;
  startedAt: string;
  lastActivityAt: string;
  idleSeconds: number;
  uptimeSeconds: number;
}

interface DockerPsRow {
  ID: string;
  Names: string;
  Image: string;
  Command: string;
  Status: string;
  State: string;
  CreatedAt: string;
}

// Bound how many `docker inspect`/`docker logs` subprocesses run at once so a
// host with many `daax-*` containers is not hit by an unbounded fan-out.
const DOCKER_PROBE_CONCURRENCY = 4;

async function dockerPs(exec: DockerExec): Promise<DockerPsRow[]> {
  const { stdout } = await exec(
    [
      "ps",
      "-a",
      "--filter",
      `name=${DAAX_NAME_PREFIX}`,
      "--format",
      "{{json .}}",
    ],
    { maxBuffer: 4 * 1024 * 1024 },
  );
  return stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      // Tolerate a malformed/partial line (truncated output, stray text)
      // rather than letting one bad line throw and break the whole listing.
      try {
        return JSON.parse(line) as DockerPsRow;
      } catch {
        return null;
      }
    })
    .filter((row): row is DockerPsRow => row !== null);
}

async function inspectContainer(
  name: string,
  exec: DockerExec,
): Promise<{ createdAt: string; startedAt: string }> {
  try {
    const { stdout } = await exec([
      "inspect",
      "--format",
      "{{.Created}}|{{.State.StartedAt}}",
      name,
    ]);
    // Expect a `created|started` pair. Guard against malformed output
    // (missing `|`, empty, partial) so a non-date string never reaches
    // `new Date(...)` and produces NaN-valued timestamps downstream.
    const epoch = new Date(0).toISOString();
    const parts = stdout.trim().split("|");
    const isValidDate = (v: string | undefined) =>
      !!v && !Number.isNaN(new Date(v).getTime());
    return {
      createdAt: isValidDate(parts[0]) ? parts[0] : epoch,
      startedAt: isValidDate(parts[1]) ? parts[1] : epoch,
    };
  } catch {
    return {
      createdAt: new Date(0).toISOString(),
      startedAt: new Date(0).toISOString(),
    };
  }
}

async function getLastLogTimestamp(
  name: string,
  exec: DockerExec,
): Promise<string | null> {
  try {
    const { stdout } = await exec(
      ["logs", "--tail", "1", "--timestamps", name],
      { maxBuffer: 64 * 1024 },
    );
    const line = stdout.trim();
    if (!line) return null;
    // docker prepends an RFC3339Nano timestamp to each log line
    const space = line.indexOf(" ");
    if (space < 0) return null;
    const ts = line.slice(0, space);
    const date = new Date(ts);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  } catch {
    return null;
  }
}

/**
 * Core session listing: `docker ps` + per-container probes via a bounded
 * pool. Takes an injectable `exec` (defaults to the real docker shell-out)
 * so it can be unit-tested without spawning subprocesses.
 */
export async function listAndProbeSessions(
  exec: DockerExec = defaultDockerExec,
  now: number = Date.now(),
): Promise<ActiveSession[]> {
  const rows = await dockerPs(exec);

  // Drop non-session containers the prefix filter let through
  // (e.g. daax-code-server, daax-net). `docker ps --format '{{json .}}'`
  // emits "Names" as a comma list; the first entry is canonical.
  const sessionRows = rows.filter((row) =>
    isAiSessionName((row.Names || "").split(",")[0]?.trim() || ""),
  );

  const sessions: ActiveSession[] = await mapPool(
    sessionRows,
    DOCKER_PROBE_CONCURRENCY,
    async (row) => {
      const name = (row.Names || "").split(",")[0]?.trim() || row.ID;

      // Only running containers can have new log activity; for stopped/exited
      // ones the StartedAt floor is sufficient, so skip the `docker logs`
      // subprocess entirely.
      const [inspect, lastLog] = await Promise.all([
        inspectContainer(name, exec),
        row.State === "running" ? getLastLogTimestamp(name, exec) : null,
      ]);

      const startedAtMs = new Date(inspect.startedAt).getTime();
      const lastLogMs = lastLog ? new Date(lastLog).getTime() : 0;
      const lastActivityMs = Math.max(startedAtMs, lastLogMs);
      const lastActivityAt = new Date(lastActivityMs || 0).toISOString();

      return {
        containerName: name,
        containerId: row.ID,
        image: row.Image,
        command: row.Command,
        status: row.Status,
        state: row.State,
        createdAt: inspect.createdAt,
        startedAt: inspect.startedAt,
        lastActivityAt,
        idleSeconds:
          lastActivityMs > 0
            ? Math.max(0, Math.floor((now - lastActivityMs) / 1000))
            : 0,
        uptimeSeconds:
          startedAtMs > 0
            ? Math.max(0, Math.floor((now - startedAtMs) / 1000))
            : 0,
      };
    },
  );

  // Newest first
  sessions.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  return sessions;
}

export async function GET() {
  try {
    const sessions = await listAndProbeSessions();
    return NextResponse.json({ success: true, sessions });
  } catch (error) {
    // Split deploy (F3 #100): the web plane holds no Docker socket, so this
    // route degrades to the same structured 503 as /api/containers instead of
    // a raw 500. Manual fallback: `docker ps` / `docker rm -f daax-<id>`.
    if (isDockerUnavailableError(error)) return dockerUnavailableJson(error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to list sessions",
      },
      { status: 500 },
    );
  }
}
