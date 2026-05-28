/**
 * Tiny seam over `docker` shell-outs so the active-sessions routes can be
 * unit-tested by injecting a stub instead of mocking the promisified
 * `node:child_process` `execFile` (whose `util.promisify.custom` binding is
 * captured at module load and is awkward to intercept under the test runner).
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type DockerExec = (
  args: string[],
  opts?: { maxBuffer?: number },
) => Promise<{ stdout: string; stderr: string }>;

export const defaultDockerExec: DockerExec = async (args, opts) => {
  // Default encoding is utf8, so stdout/stderr are strings at runtime; the
  // promisified type widens them to string|Buffer, so coerce explicitly.
  const { stdout, stderr } = await execFileAsync("docker", args, opts);
  return { stdout: stdout.toString(), stderr: stderr.toString() };
};
