/**
 * Tiny seam over `docker` shell-outs so the active-sessions routes can be
 * unit-tested by injecting a stub instead of mocking the promisified
 * `node:child_process` `execFile` (whose `util.promisify.custom` binding is
 * captured at module load and is awkward to intercept under the test runner).
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { NextResponse } from "next/server";

const execFileAsync = promisify(execFile);

export type DockerExec = (
  args: string[],
  opts?: { maxBuffer?: number; timeout?: number },
) => Promise<{ stdout: string; stderr: string }>;

export const defaultDockerExec: DockerExec = async (args, opts) => {
  // Default encoding is utf8, so stdout/stderr are strings at runtime; the
  // promisified type widens them to string|Buffer, so coerce explicitly.
  const { stdout, stderr } = await execFileAsync("docker", args, opts);
  return { stdout: stdout.toString(), stderr: stderr.toString() };
};

/**
 * True when an error from a `docker` shell-out means the daemon/socket is
 * unreachable — or the CLI itself is missing — as opposed to the docker
 * command failing (no such image/container, etc.). This is the expected state
 * of the split-deploy web container (F3 #100), which holds no
 * /var/run/docker.sock.
 */
export function isDockerUnavailableError(error: unknown): boolean {
  const err = error as NodeJS.ErrnoException & { stderr?: unknown };
  if (err?.code === "ENOENT") return true; // docker CLI not on PATH
  const text = `${err?.message ?? ""} ${typeof err?.stderr === "string" ? err.stderr : ""}`;
  return /cannot connect to the docker daemon|is the docker daemon running|docker daemon is not running|error during connect|permission denied while trying to connect/i.test(
    text,
  );
}

/**
 * The graceful 503 a docker-backed web route returns when the daemon is
 * unreachable — the SAME shape as GET /api/containers, so the UI has one
 * consistent "Docker unavailable" state instead of a raw 500. In the split
 * deploy (F3 #100) the operator fallback for AI session cleanup is manual:
 * `docker ps` / `docker rm -f daax-<id>` on the host.
 */
export function dockerUnavailableResponse(error: unknown): NextResponse {
  return NextResponse.json(
    {
      error: "Docker daemon not available",
      details: error instanceof Error ? error.message : String(error),
      hint: "Make sure Docker is running and the socket is accessible.",
    },
    { status: 503 },
  );
}
