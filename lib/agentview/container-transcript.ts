/** daax's own fact about its container store, never read from the daemon. */

import "server-only";
import { lstat } from "node:fs/promises";
import path from "node:path";
import { isSessionUuid } from "./resume";

/**
 * Inside the daax container, the store daax agent containers mount as
 * CLAUDE_CONFIG_DIR (server/docker/auth-paths.ts, getClaudeAuthLocalPath).
 * A session whose cwd was /workspace records its transcript under the
 * project key `-workspace`.
 */
export const CONTAINER_CLAUDE_STORE = "/workspace/.daax/claude";

export function containerTranscriptPath(
  sessionId: string,
  store = CONTAINER_CLAUDE_STORE,
): string | null {
  if (!isSessionUuid(sessionId)) return null;
  return path.join(store, "projects", "-workspace", `${sessionId}.jsonl`);
}

export type TranscriptCheck =
  | { exists: boolean }
  | { exists?: undefined; reason: string };

/** A regular file only: lstat, so a planted symlink is not a transcript. */
export async function checkContainerTranscript(
  sessionId: string,
  store = CONTAINER_CLAUDE_STORE,
): Promise<TranscriptCheck> {
  const file = containerTranscriptPath(sessionId, store);
  if (file === null)
    return { reason: "the session id is not a UUID; no path was built" };
  try {
    return { exists: (await lstat(file)).isFile() };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return { exists: false };
    return { reason: `reading the container store failed: ${code ?? err}` };
  }
}
