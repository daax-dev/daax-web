/**
 * Git worktree management utilities
 * Server-side only - uses Node.js child_process
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { existsSync, mkdirSync, realpathSync } from "fs";
import { join, resolve, sep } from "path";
import { homedir } from "os";
import { expandPath } from "./path-utils";
import { getSettings } from "./settings";

const execFileAsync = promisify(execFile);

/**
 * Resolve the operator-configured workspace root for path confinement.
 *
 * This is the SAME namespace that translatePath() maps candidate paths into:
 * - Container mode: the host workspace is bind-mounted at /workspace, and
 *   translatePath() rewrites host/tilde paths to /workspace/... , so the root
 *   is "/workspace".
 * - Host mode: the operator's configured base path from settings (default
 *   "~/prj"), expanded to an absolute path — the same source used by the
 *   workspace API (app/api/workspace/route.ts).
 *
 * Not a new config path — it reuses the existing HOST_WORKSPACE_PATH/"/workspace"
 * container convention and the settings basePath.
 */
export function resolveWorkspaceRoot(): string {
  if (process.env.HOST_WORKSPACE_PATH && existsSync("/workspace")) {
    return "/workspace";
  }
  return expandPath(getSettings().basePath);
}

/**
 * Canonicalize a path for confinement comparison: resolve to an absolute path
 * and, where it exists on disk, follow symlinks via realpath so a symlinked
 * escape cannot slip past the boundary. Where the path does not exist yet, fall
 * back to a lexical resolve (there is nothing to dereference).
 */
function canonicalizePath(p: string): string {
  const resolved = resolve(p);
  try {
    return realpathSync(resolved);
  } catch {
    return resolved;
  }
}

/**
 * Validates a path to prevent path traversal attacks AND enforce workspace-root
 * confinement.
 *
 * `basePath` is REQUIRED: every accepted path must resolve to a location inside
 * (or equal to) `basePath`. Callers pass the operator-configured workspace root
 * (see resolveWorkspaceRoot()). An absolute host path outside that root — even a
 * sibling-prefix like "/workspaceEVIL" for base "/workspace" — is rejected.
 *
 * Confinement is done on CANONICALIZED paths, in the execution-context namespace:
 * the candidate is first run through translatePath() (host/tilde -> container
 * mapping) so it is compared in the same namespace as the git command's cwd,
 * then both candidate and base are resolved with realpath (where they exist) and
 * compared with a trailing-separator boundary. A raw normalize()+startsWith()
 * would let "/workspaceEVIL" pass for base "/workspace"; the separator boundary
 * and realpath do not.
 *
 * @param path - The path to validate (host-form or already-translated)
 * @param basePath - Workspace root the path must be confined within (required)
 * @returns true if the path is safe and confined, false otherwise
 */
export function isValidPath(path: string, basePath: string): boolean {
  // Check for null bytes (common injection vector)
  if (path.includes("\0")) {
    return false;
  }

  // Check for ".." in the ORIGINAL path before normalization
  // This catches attempts like "/foo/../../../etc/passwd"
  if (path.includes("..")) {
    return false;
  }

  // Compare in the execution-context namespace: the git command runs with
  // cwd = translatePath(path), so that is the location that must be confined.
  const candidate = canonicalizePath(translatePath(path));
  const base = canonicalizePath(translatePath(basePath));

  // Equal to the root, or strictly inside it (trailing-separator boundary so a
  // sibling-prefix such as "/workspaceEVIL" does NOT pass for base "/workspace").
  return candidate === base || candidate.startsWith(base + sep);
}

/**
 * Validates a git branch name to prevent command injection.
 * Git branch names have specific rules:
 * - Cannot start with a hyphen (prevents option injection)
 * - Cannot contain spaces, backslashes, or control characters
 * - Cannot contain sequences like .., @{, or end with .lock
 * @param branchName - The branch name to validate
 * @returns true if the branch name is safe for use in git commands
 */
export function isValidBranchName(branchName: string): boolean {
  // Cannot be empty or start with hyphen (prevents -flag injection)
  if (!branchName || branchName.startsWith("-")) {
    return false;
  }

  // Must only contain safe characters
  // Allows: lowercase letters, numbers, hyphens, underscores, forward slashes
  if (!/^([a-z0-9][a-z0-9_/-]*[a-z0-9]|[a-z0-9])$/.test(branchName)) {
    return false;
  }

  // Check for dangerous sequences
  const dangerousPatterns = [
    "..", // Path traversal
    "@{", // Git reflog syntax
    "\\", // Backslash
    " ", // Space
    "~", // Git parent syntax
    "^", // Git parent syntax
    ":", // Git range syntax
    "?", // Glob pattern
    "*", // Glob pattern
    "[", // Glob pattern
    "\0", // Null byte
  ];

  for (const pattern of dangerousPatterns) {
    if (branchName.includes(pattern)) {
      return false;
    }
  }

  // Cannot end with .lock
  if (branchName.endsWith(".lock")) {
    return false;
  }

  return true;
}

/**
 * Translates a host filesystem path to a container path.
 *
 * When running inside a Docker container, paths on the host machine need to be
 * translated to their equivalent container paths. This function handles:
 * - Tilde (~) expansion - when in container mode, ~ refers to the HOST's home dir
 * - Translation from HOST_WORKSPACE_PATH to /workspace when running in container mode
 *
 * @param hostPath - The path as it exists on the host machine (may use ~ prefix)
 * @returns The translated path suitable for use within the current execution context
 *
 * @example
 * // When HOST_WORKSPACE_PATH="/Users/john/prj"
 * translatePath("~/prj/myapp") // Returns "/workspace/myapp" in container
 * translatePath("/other/path")  // Returns "/other/path" (no translation needed)
 */
function translatePath(hostPath: string): string {
  let path = hostPath;
  const hostWorkspacePath = process.env.HOST_WORKSPACE_PATH;

  // Handle tilde expansion
  if (path.startsWith("~/")) {
    if (hostWorkspacePath) {
      // In container mode: ~ refers to the HOST's home directory
      // HOST_WORKSPACE_PATH is like "/Users/john/prj" which is mounted to /workspace
      // So ~/prj/foo should become /workspace/foo

      // Extract what comes after ~/prj/ (assuming prj is the workspace name)
      // HOST_WORKSPACE_PATH ends with the workspace dir, e.g., /Users/john/prj
      // Normalize HOST_WORKSPACE_PATH enough to drop trailing slashes so that
      // values like "/Users/john/prj/" still yield a non-empty basename.
      const trimmedHostWorkspacePath = hostWorkspacePath.replace(/\/+$/, "");
      const workspaceBasename = trimmedHostWorkspacePath.split("/").pop() || "";

      if (workspaceBasename) {
        const tildePrefix = `~/${workspaceBasename}`;

        // Only translate when the tilde prefix matches a full path segment,
        // e.g., "~/prj" or "~/prj/...". This avoids mismatches like "~/prj2".
        if (path === tildePrefix) {
          // ~/prj → /workspace
          return "/workspace";
        }

        if (path.startsWith(tildePrefix + "/")) {
          // ~/prj/foo → /workspace/foo
          return "/workspace" + path.slice(tildePrefix.length);
        }
      }

      // Tilde path doesn't match workspace, or workspace basename could not
      // be determined reliably; expand using container homedir as fallback.
      path = join(homedir(), path.slice(2));
    } else {
      // Not in container mode: expand normally
      path = join(homedir(), path.slice(2));
    }
  }

  // If running in container, translate host path to container path
  if (hostWorkspacePath && path.startsWith(hostWorkspacePath)) {
    return "/workspace" + path.slice(hostWorkspacePath.length);
  }

  return path;
}

// Interfaces
export interface WorktreeInfo {
  path: string;
  branch: string;
  commit: string;
  projectPath: string;
}

export interface WorktreeStatus {
  isClean: boolean;
  hasUncommittedChanges: boolean;
  hasUntrackedFiles: boolean;
  aheadOfRemote: number;
  behindRemote: number;
}

export interface CleanupResult {
  success: boolean;
  pushed: boolean;
  deleted: boolean;
  error?: string;
  kept: boolean;
}

export interface CreateWorktreeOptions {
  projectPath: string;
  branchName: string;
  baseBranch?: string;
}

/**
 * Check if directory is a git repository
 */
export async function isGitRepo(path: string): Promise<boolean> {
  try {
    const containerPath = translatePath(path);
    await execFileAsync("git", ["rev-parse", "--git-dir"], {
      cwd: containerPath,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get current branch name
 */
export async function getCurrentBranch(path: string): Promise<string> {
  const containerPath = translatePath(path);
  const { stdout } = await execFileAsync(
    "git",
    ["rev-parse", "--abbrev-ref", "HEAD"],
    {
      cwd: containerPath,
    },
  );
  return stdout.trim();
}

/**
 * List all branches (local + remote)
 */
export async function listBranches(path: string): Promise<string[]> {
  try {
    const containerPath = translatePath(path);
    const { stdout } = await execFileAsync(
      "git",
      ["branch", "-a", "--format=%(refname)"],
      { cwd: containerPath },
    );
    return stdout
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((ref) => {
        const headsPrefix = "refs/heads/";
        const originRemotePrefix = "refs/remotes/origin/";
        const remotesPrefix = "refs/remotes/";

        if (ref.startsWith(headsPrefix)) {
          // Local branch
          return ref.substring(headsPrefix.length);
        }

        if (ref.startsWith(originRemotePrefix)) {
          // Remote-tracking branch for origin: strip the 'origin/' prefix from the result
          return ref.substring(originRemotePrefix.length);
        }

        if (ref.startsWith(remotesPrefix)) {
          // Remote-tracking branch for a non-origin remote: keep '<remote>/<branch>'
          return ref.substring(remotesPrefix.length);
        }

        // Fallback: return the ref as-is
        return ref;
      });
  } catch (error) {
    console.error("Failed to list git branches:", error);
    return [];
  }
}

/**
 * List existing worktrees for a project
 */
export async function listWorktrees(
  projectPath: string,
): Promise<WorktreeInfo[]> {
  try {
    const containerPath = translatePath(projectPath);
    const { stdout } = await execFileAsync(
      "git",
      ["worktree", "list", "--porcelain"],
      {
        cwd: containerPath,
      },
    );
    const worktrees: WorktreeInfo[] = [];
    const blocks = stdout.split("\n\n").filter(Boolean);

    for (const block of blocks) {
      const lines = block.split("\n");
      const info: Partial<WorktreeInfo> = { projectPath };

      for (const line of lines) {
        if (line.startsWith("worktree ")) {
          info.path = line.replace("worktree ", "");
        } else if (line.startsWith("HEAD ")) {
          info.commit = line.replace("HEAD ", "");
        } else if (line.startsWith("branch ")) {
          info.branch = line.replace("branch refs/heads/", "");
        }
      }

      // Only include worktrees with a branch (not detached HEAD).
      // This feature always creates worktrees with new branches,
      // so detached HEAD worktrees are intentionally excluded.
      if (info.path && info.branch) {
        worktrees.push(info as WorktreeInfo);
      }
    }

    return worktrees;
  } catch (error) {
    console.error("Failed to list git worktrees:", error);
    return [];
  }
}

/**
 * Create a new worktree with a new branch
 */
export async function createWorktree(
  options: CreateWorktreeOptions,
): Promise<WorktreeInfo> {
  const { projectPath, branchName, baseBranch } = options;

  // Validate branch name to prevent command injection
  if (!isValidBranchName(branchName)) {
    throw new Error(`Invalid branch name: ${branchName}`);
  }

  // Validate base branch if provided
  if (baseBranch && !isValidBranchName(baseBranch)) {
    throw new Error(`Invalid base branch name: ${baseBranch}`);
  }

  const containerProjectPath = translatePath(projectPath);

  // Ensure .worktrees directory exists
  const worktreesDir = join(containerProjectPath, ".worktrees");
  if (!existsSync(worktreesDir)) {
    mkdirSync(worktreesDir, { recursive: true });
  }

  const containerWorktreePath = join(worktreesDir, branchName);

  // Create worktree with new branch using execFileAsync (array args prevent injection)
  const baseRef = baseBranch || "HEAD";
  await execFileAsync(
    "git",
    ["worktree", "add", "-b", branchName, containerWorktreePath, baseRef],
    { cwd: containerProjectPath },
  );

  // Get commit hash
  const { stdout: commit } = await execFileAsync("git", ["rev-parse", "HEAD"], {
    cwd: containerWorktreePath,
  });

  // Return the HOST path so it can be used for docker mounts
  const hostWorktreePath = join(projectPath, ".worktrees", branchName);

  return {
    path: hostWorktreePath,
    branch: branchName,
    commit: commit.trim(),
    projectPath,
  };
}

/**
 * Get the status of a worktree (clean/dirty, ahead/behind)
 */
export async function getWorktreeStatus(
  worktreePath: string,
): Promise<WorktreeStatus> {
  const containerPath = translatePath(worktreePath);

  // Check for uncommitted changes
  const { stdout: statusOutput } = await execFileAsync(
    "git",
    ["status", "--porcelain"],
    {
      cwd: containerPath,
    },
  );

  const lines = statusOutput.trim().split("\n").filter(Boolean);
  const hasUncommittedChanges = lines.some((l) => !l.startsWith("??"));
  const hasUntrackedFiles = lines.some((l) => l.startsWith("??"));

  // Check ahead/behind remote
  let aheadOfRemote = 0;
  let behindRemote = 0;

  try {
    const { stdout: trackingOutput } = await execFileAsync(
      "git",
      ["rev-list", "--left-right", "--count", "HEAD...@{upstream}"],
      { cwd: containerPath },
    );
    const [ahead, behind] = trackingOutput.trim().split("\t").map(Number);
    aheadOfRemote = ahead || 0;
    behindRemote = behind || 0;
  } catch (error) {
    // No upstream configured - that's expected for new branches
    // Only log if it's an unexpected error type
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (!errorMessage.includes("upstream") && !errorMessage.includes("@{u}")) {
      console.error("Unexpected error checking upstream status:", error);
    }
  }

  return {
    isClean: !hasUncommittedChanges && !hasUntrackedFiles,
    hasUncommittedChanges,
    hasUntrackedFiles,
    aheadOfRemote,
    behindRemote,
  };
}

/**
 * Push the current branch to origin
 */
export async function pushBranch(worktreePath: string): Promise<boolean> {
  try {
    const containerPath = translatePath(worktreePath);
    const { stdout: branch } = await execFileAsync(
      "git",
      ["rev-parse", "--abbrev-ref", "HEAD"],
      { cwd: containerPath },
    );

    const branchName = branch.trim();

    // Validate the branch name before using it
    if (!isValidBranchName(branchName)) {
      console.error("Invalid branch name detected:", branchName);
      return false;
    }

    // Push with -u to set upstream using execFileAsync (array args)
    await execFileAsync("git", ["push", "-u", "origin", branchName], {
      cwd: containerPath,
    });

    return true;
  } catch (error) {
    console.error("Failed to push branch:", error);
    return false;
  }
}

/**
 * Delete a worktree
 */
export async function deleteWorktree(
  projectPath: string,
  worktreePath: string,
  force = false,
): Promise<boolean> {
  try {
    const workspaceRoot = resolveWorkspaceRoot();

    // Validate paths BEFORE translation to catch injection attempts early
    if (!isValidPath(worktreePath, workspaceRoot)) {
      console.error("Invalid worktree path (pre-translation):", worktreePath);
      return false;
    }

    const containerProjectPath = translatePath(projectPath);
    const containerWorktreePath = translatePath(worktreePath);

    // Validate paths AFTER translation in case translation introduced issues
    if (!isValidPath(containerWorktreePath, workspaceRoot)) {
      console.error(
        "Invalid worktree path (post-translation):",
        containerWorktreePath,
      );
      return false;
    }

    // Build args array - using execFileAsync prevents command injection
    const args = ["worktree", "remove"];
    if (force) {
      args.push("--force");
    }
    args.push(containerWorktreePath);

    await execFileAsync("git", args, {
      cwd: containerProjectPath,
    });
    return true;
  } catch (error) {
    console.error("Failed to delete worktree:", error);
    return false;
  }
}

/**
 * Full cleanup: check status, push if commits exist, delete if clean
 */
export async function cleanupWorktree(
  projectPath: string,
  worktreePath: string,
  options: { pushBeforeCleanup?: boolean; forceDelete?: boolean } = {},
): Promise<CleanupResult> {
  const { pushBeforeCleanup = true, forceDelete = false } = options;

  try {
    const status = await getWorktreeStatus(worktreePath);

    // If dirty and not forcing, keep the worktree
    if (!status.isClean && !forceDelete) {
      return {
        success: false,
        pushed: false,
        deleted: false,
        kept: true,
        error: "Worktree has uncommitted changes",
      };
    }

    // Push to remote if there are commits ahead
    let pushed = false;
    if (pushBeforeCleanup && status.aheadOfRemote > 0) {
      pushed = await pushBranch(worktreePath);
    }

    // Delete the worktree
    const deleted = await deleteWorktree(
      projectPath,
      worktreePath,
      forceDelete,
    );

    return {
      success: deleted,
      pushed,
      deleted,
      kept: !deleted,
    };
  } catch (error) {
    return {
      success: false,
      pushed: false,
      deleted: false,
      kept: true,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Check if a worktree exists at the given path
 */
export async function worktreeExists(worktreePath: string): Promise<boolean> {
  return existsSync(worktreePath);
}
