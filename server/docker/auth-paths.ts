/**
 * Authentication Path Management
 *
 * Manages paths for Claude and OpenCode authentication directories,
 * handling both host mode and container mode scenarios.
 */

import { homedir } from "os";
import { join } from "path";
import { mkdirSync, existsSync, chownSync } from "fs";
import {
  HOST_WORKSPACE_PATH,
  CONTAINER_WORKSPACE_PATH,
} from "../config/constants";

// In container mode, we store auth inside the mounted workspace so we can manage permissions.
// The daax container has /workspace mounted from HOST_WORKSPACE_PATH.
// We create .daax/ inside /workspace (which the container CAN access and chown).
// Then we mount ${HOST_WORKSPACE_PATH}/.daax/claude into spawned containers.

/**
 * Get the path where we CREATE the Claude auth directory (container-local or host-local).
 * In container mode, this is inside the mounted workspace so we can chown it.
 */
export function getClaudeAuthLocalPath(): string {
  if (HOST_WORKSPACE_PATH) {
    // Container mode: create inside the mounted workspace
    return `${CONTAINER_WORKSPACE_PATH}/.daax/claude`;
  }
  // Host mode: use home directory
  return `${homedir()}/.daax-claude`;
}

/**
 * Get the HOST path for Claude auth (used in Docker -v mounts for spawned containers).
 * In container mode, this translates the container path to the host path.
 */
export function getClaudeAuthHostPath(): string {
  if (HOST_WORKSPACE_PATH) {
    // Container mode: translate to host path for Docker volume mount
    return `${HOST_WORKSPACE_PATH}/.daax/claude`;
  }
  // Host mode: same as local path
  return `${homedir()}/.daax-claude`;
}

/**
 * Get the path where we CREATE the OpenCode auth directory (container-local or host-local).
 */
export function getOpenCodeAuthLocalPath(): string {
  if (HOST_WORKSPACE_PATH) {
    // Container mode: create inside the mounted workspace
    return `${CONTAINER_WORKSPACE_PATH}/.daax/opencode`;
  }
  // Host mode: respect XDG_DATA_HOME if set
  const xdgDataHome = process.env.XDG_DATA_HOME;
  if (xdgDataHome && xdgDataHome.trim().length > 0) {
    return join(xdgDataHome, "opencode");
  }
  return `${homedir()}/.local/share/opencode`;
}

/**
 * Get the HOST path for OpenCode auth (used in Docker -v mounts for spawned containers).
 */
export function getOpenCodeAuthHostPath(): string {
  if (HOST_WORKSPACE_PATH) {
    // Container mode: translate to host path for Docker volume mount
    return `${HOST_WORKSPACE_PATH}/.daax/opencode`;
  }
  // Host mode: same as local path
  const xdgDataHome = process.env.XDG_DATA_HOME;
  if (xdgDataHome && xdgDataHome.trim().length > 0) {
    return join(xdgDataHome, "opencode");
  }
  return `${homedir()}/.local/share/opencode`;
}

/**
 * Initialize Claude auth directory with correct permissions.
 * Returns the local and host paths for the directory.
 * Exits the process if the directory cannot be created.
 */
export function initializeClaudeAuthDir(): {
  localPath: string;
  hostPath: string;
} {
  const localPath = getClaudeAuthLocalPath();
  const hostPath = getClaudeAuthHostPath();

  try {
    const dirExisted = existsSync(localPath);
    mkdirSync(localPath, { recursive: true, mode: 0o755 });

    // Fix ownership: spawned containers run as vscode (UID 1000)
    // If we're running as root (container mode), chown to 1000:1000
    // This matches the host user UID and the vscode user in spawned containers
    // Do this for both new and existing directories to fix any permission issues
    if (process.getuid && process.getuid() === 0) {
      try {
        chownSync(localPath, 1000, 1000);
        if (dirExisted) {
          console.log(
            `[Terminal Server] Fixed ownership of ${localPath} to 1000:1000 (vscode user)`,
          );
        } else {
          console.log(
            `[Terminal Server] Created ${localPath} with ownership 1000:1000 (vscode user)`,
          );
        }
        console.log(
          `[Terminal Server] Claude auth will be mounted from host path: ${hostPath}`,
        );
      } catch (chownError) {
        console.warn(
          `[Terminal Server] Failed to set ownership of ${localPath}. ` +
            "AI containers may have permission issues writing Claude config.",
          chownError,
        );
      }
    }
  } catch (error) {
    // Only show the non-root (UID 1000 / chown) guidance when a non-root uid is
    // POSITIVELY detected. Where getuid is unavailable (e.g. Windows host-dev),
    // uid can't be determined, so don't assert a non-root cause.
    const runningNonRoot =
      typeof process.getuid === "function" && process.getuid() !== 0;
    console.error(
      `[Terminal Server] FATAL: cannot create the Claude auth directory at ${localPath}.`,
      error,
    );
    if (runningNonRoot) {
      // #185: the container now runs as the non-root `node` user (UID 1000) with
      // cap_drop:[ALL], so it can only write host mounts owned by / writable by
      // UID 1000. A root-owned /workspace mount is the usual cause here.
      console.error(
        "[Terminal Server] This container runs as the non-root 'node' user (UID 1000). " +
          "The mounted /workspace MUST be writable by UID 1000; the usual cause is a " +
          "root-owned /workspace bind mount.\n" +
          "  Fix on the HOST: chown -R 1000:1000 <your DAAX_WORKSPACE dir>.\n" +
          "  (If this deploy also mounts /host-config/.claude.json, ensure it too is " +
          "owned by / writable by UID 1000 — the split terminal service does not mount it.)",
      );
    } else {
      console.error(
        "[Terminal Server] Please check directory permissions and available disk space.",
      );
    }
    // Fail fast: this directory is required for Claude containers to work correctly
    process.exit(1);
  }

  return { localPath, hostPath };
}

/**
 * Initialize OpenCode auth directory with correct permissions.
 * Returns the local and host paths for the directory.
 * Does not exit on failure (OpenCode is optional).
 */
export function initializeOpenCodeAuthDir(): {
  localPath: string;
  hostPath: string;
} {
  const localPath = getOpenCodeAuthLocalPath();
  const hostPath = getOpenCodeAuthHostPath();

  try {
    const dirExisted = existsSync(localPath);
    mkdirSync(localPath, { recursive: true, mode: 0o755 });

    if (process.getuid && process.getuid() === 0) {
      try {
        chownSync(localPath, 1000, 1000);
        if (!dirExisted) {
          console.log(
            `[Terminal Server] Created ${localPath} with ownership 1000:1000 (vscode user)`,
          );
        }
        console.log(
          `[Terminal Server] OpenCode auth will be mounted from host path: ${hostPath}`,
        );
      } catch (chownError) {
        console.warn(
          `[Terminal Server] Failed to set ownership of ${localPath}. ` +
            "OpenCode containers may have permission issues.",
          chownError,
        );
      }
    }
  } catch (error) {
    console.warn(
      `[Terminal Server] Failed to create OpenCode auth directory at ${localPath}.`,
      error,
    );
    // Don't fail - OpenCode is optional
  }

  return { localPath, hostPath };
}
