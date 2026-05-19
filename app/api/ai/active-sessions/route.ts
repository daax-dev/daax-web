/**
 * GET /api/ai/active-sessions
 *
 * Returns the ground-truth list of AI Coding container sessions by
 * shelling out to `docker ps` (filtered to the `daax-` prefix used by
 * server/handlers/connection-handler.ts when spawning containers).
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

const execFileAsync = promisify(execFile);

// Filter prefix for AI Coding / shell containers. Matches the naming
// scheme in server/handlers/connection-handler.ts (`daax-<sessionId8>`).
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

    const sessions: ActiveSession[] = await Promise.all(
      rows.map(async (row) => {
        // `docker ps --format '{{json .}}'` emits "Names" as a comma list
        // for containers with multiple names; first entry is canonical.
        const name = (row.Names || "").split(",")[0]?.trim() || row.ID;

        const [inspect, lastLog] = await Promise.all([
          inspectContainer(name),
          getLastLogTimestamp(name),
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
      }),
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
