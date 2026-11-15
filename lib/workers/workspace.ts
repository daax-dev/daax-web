import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * The workspace root workers run inside. Same resolution order as
 * instrumentation.ts (WORKSPACE_PATH → DAAX_WORKSPACE → /workspace → ~/prj).
 */
export function resolveWorkspaceRoot(
  env: NodeJS.ProcessEnv = process.env,
): string {
  if (env.WORKSPACE_PATH) return env.WORKSPACE_PATH;
  if (env.DAAX_WORKSPACE) return env.DAAX_WORKSPACE;
  if (existsSync("/workspace")) return "/workspace";
  return join(homedir(), "prj");
}
