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
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { isAiSessionName } from "@/lib/ai-session-name";

const execFileAsync = promisify(execFile);

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

// Order-preserving bounded-concurrency map. No external dependency.
async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const idx = next++;
      if (idx >= items.length) return;
      out[idx] = await fn(items[idx]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return out;
}

async function dockerPs(): Promise<DockerPsRow[]> {
  const { stdout } = await execFileAsync(
    "docker",
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
    .map((line) => JSON.parse(line) as DockerPsRow);
}

async function inspectContainer(
  name: string,
): Promise<{ createdAt: string; startedAt: string }> {
  try {
    const { stdout } = await execFileAsync("docker", [
      "inspect",
      "--format",
      "{{.Created}}|{{.State.StartedAt}}",
      name,
    ]);
    const [created, started] = stdout.trim().split("|");
    return { createdAt: created, startedAt: started };
  } catch {
    return {
      createdAt: new Date(0).toISOString(),
      startedAt: new Date(0).toISOString(),
    };
  }
}

async function getLastLogTimestamp(name: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      "docker",
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

export async function GET() {
  try {
    const rows = await dockerPs();
    const now = Date.now();

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
          inspectContainer(name),
          row.State === "running" ? getLastLogTimestamp(name) : null,
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

    return NextResponse.json({ success: true, sessions });
  } catch (error) {
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
