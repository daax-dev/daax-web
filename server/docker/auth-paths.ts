/**
 * Authentication Path Management
 *
 * Manages paths for Claude and OpenCode authentication directories,
 * handling both host mode and container mode scenarios.
 */

import { homedir } from "os";
import { mkdirSync, existsSync, chownSync } from "fs";
import {
  HOST_WORKSPACE_PATH,
  CONTAINER_WORKSPACE_PATH,
} from "../config/constants";
import {
  parseAdminAllowlist,
  canonicalizeSubject,
} from "../../lib/rbac/allowlist";
import { OPERATOR_OWNER, ownerDirName } from "../../lib/tenancy/ownership";

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
  // Host mode: use a daax-DEDICATED store (R4), NOT the operator's real global
  // `~/.local/share/opencode`. Mounting the real store RW into untrusted agent
  // containers let agent code exfiltrate/overwrite the operator's actual
  // OpenCode credential. Mirrors Claude host mode (`~/.daax-claude`): the dir is
  // created empty and populated by `opencode auth login` INSIDE a daax container.
  return `${homedir()}/.daax-opencode`;
}

/**
 * Get the HOST path for OpenCode auth (used in Docker -v mounts for spawned containers).
 */
export function getOpenCodeAuthHostPath(): string {
  if (HOST_WORKSPACE_PATH) {
    // Container mode: translate to host path for Docker volume mount
    return `${HOST_WORKSPACE_PATH}/.daax/opencode`;
  }
  // Host mode: daax-DEDICATED store (R4), same as the local path — never the
  // operator's real `~/.local/share/opencode`. See getOpenCodeAuthLocalPath.
  return `${homedir()}/.daax-opencode`;
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
    // Only emit the UID-1000 chown guidance when it actually applies:
    //   (a) container mode — HOST_WORKSPACE_PATH is set (the file's container signal), AND
    //   (b) a positively-known non-root uid — process.getuid is callable and returns != 0.
    // Where getuid is unavailable (uid unknown) or in non-container/host runs, the
    // UID-1000 specifics are misleading, so print generic permission guidance instead.
    const knownNonRootUid =
      typeof process.getuid === "function" && process.getuid() !== 0;
    const showUid1000Guidance = Boolean(HOST_WORKSPACE_PATH) && knownNonRootUid;
    console.error(
      `[Terminal Server] FATAL: cannot create the Claude auth directory at ${localPath}.`,
      error,
    );
    if (showUid1000Guidance) {
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

// ---------------------------------------------------------------------------
// Per-user credential stores (multi-tenancy — dx#119)
// ---------------------------------------------------------------------------
//
// One shared `.daax/claude` mounted read-write into every user's agent
// container let any user read (and refresh) everyone else's Claude/OpenCode
// login. Each owner now gets `.daax/users/<owner>/{claude,opencode}`.
//
// Migration (non-destructive, reversible): nothing is moved or deleted. The
// existing shared store is simply mapped to the admin who owned it — the local
// operator, plus `DAAX_LEGACY_CREDENTIALS_OWNER` if set, else the first subject
// in `DAAX_ADMIN_USERS`. Every other user starts with an empty store and logs
// in once inside their own container. Unset both and remove the legacy dir to
// retire it.
//
// The substrate backend uses no sandbox credentials at all (provider keys stay
// in the agentgateway LLM gateway); this applies to the docker backend only.

export interface UserAuthPaths {
  claudeHostPath: string;
  openCodeHostPath: string;
  /** True when this owner is mapped onto the pre-#119 shared store. */
  legacy: boolean;
}

/** The admin subject the pre-#119 shared credential store belongs to. */
export function legacyCredentialsOwner(
  env: Record<string, string | undefined> = process.env,
): string | null {
  const explicit = env.DAAX_LEGACY_CREDENTIALS_OWNER?.trim();
  if (explicit) return canonicalizeSubject(explicit).toLowerCase();
  const firstSubject = parseAdminAllowlist(env.DAAX_ADMIN_USERS).find(
    (e) => e.kind === "subject",
  );
  return firstSubject ? firstSubject.value : null;
}

function usersRoot(): { local: string; host: string } {
  if (HOST_WORKSPACE_PATH) {
    return {
      local: `${CONTAINER_WORKSPACE_PATH}/.daax/users`,
      host: `${HOST_WORKSPACE_PATH}/.daax/users`,
    };
  }
  const dir = join(homedir(), ".daax", "users");
  return { local: dir, host: dir };
}

function ensureOwnedDir(localPath: string): void {
  mkdirSync(localPath, { recursive: true, mode: 0o700 });
  if (process.getuid && process.getuid() === 0) {
    try {
      chownSync(localPath, 1000, 1000);
    } catch {
      /* best effort, as for the shared store */
    }
  }
}

/**
 * Credential host paths to mount into `owner`'s agent container, creating the
 * per-user directories on first use.
 */
export function getUserAuthPaths(
  owner: string,
  legacy: { claudeHostPath: string; openCodeHostPath: string },
  env: Record<string, string | undefined> = process.env,
): UserAuthPaths {
  const key = owner.trim().toLowerCase();
  if (key === OPERATOR_OWNER || key === legacyCredentialsOwner(env)) {
    return { ...legacy, legacy: true };
  }
  const root = usersRoot();
  const dir = ownerDirName(key);
  const local = {
    claude: join(root.local, dir, "claude"),
    oc: join(root.local, dir, "opencode"),
  };
  ensureOwnedDir(local.claude);
  ensureOwnedDir(local.oc);
  return {
    claudeHostPath: join(root.host, dir, "claude"),
    openCodeHostPath: join(root.host, dir, "opencode"),
    legacy: false,
  };
}
