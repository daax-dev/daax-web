/**
 * Container execution backend (dx#113): today's node-pty path, moved here
 * unchanged from server/handlers/connection-handler.ts.
 *
 * It serves every pre-existing `mode`: `container` (`docker run -it --rm` of a
 * new agent container, or `docker exec` into `containerName`) and the host
 * `local` / `shell-tmux` shells, because all of them are a node-pty spawn of a
 * local command. Sessions are ephemeral: the connection handler still sends
 * EOF then SIGTERM on WS close. `buildShellCommand` below is the original
 * function, byte for byte apart from the `export`.
 */
import { DOCKER_NETWORK } from "../config/constants";
import { getPty } from "../sessions/pty-loader";
import type { IPty } from "../sessions/types";
import { buildPtyEnv } from "../sessions/pty-env";
import { isAiSessionName } from "../../lib/ai-session-name";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  UnsupportedOperationError,
  type AttachOptions,
  type BackendSessionInfo,
  type ExecutionBackend,
} from "./types";

// Auth paths are initialized in terminal-server.ts and passed here
let claudeAuthHostPath: string;
let openCodeAuthHostPath: string;

/**
 * Set the auth paths (called from terminal-server.ts after initialization)
 */
export function setAuthPaths(claudePath: string, openCodePath: string): void {
  claudeAuthHostPath = claudePath;
  openCodeAuthHostPath = openCodePath;
}

export interface ContainerSpawnSpec {
  mode: string;
  containerName: string;
  containerImage: string;
  mountPath: string;
  containerPath: string;
  projectName: string;
  basePathParam: string;
  sessionId: string;
  command: string;
  isOpenCodeSession: boolean;
  opencodeProvider: string;
  opencodeModel: string;
  cwd: string;
  cols: number;
  rows: number;
}

export interface ContainerSpawnResult {
  /** Docker container name for a new container, else the session id. */
  id: string;
  pty: IPty;
  shell: string;
  shellArgs: string[];
}

/** Thrown by spawn/attach when the optional node-pty is not installed. */
export class PtyUnavailableError extends Error {
  constructor() {
    super(
      "Terminal functionality is unavailable. node-pty optional dependency is not installed.",
    );
  }
}

function spawnPty(
  shell: string,
  shellArgs: string[],
  cols: number,
  rows: number,
  cwd: string | undefined,
): IPty {
  const pty = getPty();
  if (!pty) throw new PtyUnavailableError();
  return pty.spawn(shell, shellArgs, {
    name: "xterm-256color",
    cols,
    rows,
    cwd,
    // buildPtyEnv strips the compose-set HOST posture var and daax's own
    // server config and credentials, so neither leaks into workbench
    // terminals or the agents they start (#184 review).
    env: {
      ...buildPtyEnv(),
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
    },
  });
}

/** `docker <args>`; injectable for tests. (lib/docker-exec pulls in next/server.) */
export type DockerRun = (args: string[]) => Promise<{ stdout: string }>;

const execFileAsync = promisify(execFile);
const defaultDockerRun: DockerRun = async (args) => {
  const { stdout } = await execFileAsync("docker", args, {
    maxBuffer: 4 * 1024 * 1024,
  });
  return { stdout: stdout.toString() };
};

export class ContainerBackend implements ExecutionBackend<
  ContainerSpawnSpec,
  ContainerSpawnResult,
  BackendSessionInfo
> {
  readonly kind = "container" as const;
  readonly capabilities = { persistent: false, suspendResume: false };

  constructor(private readonly docker: DockerRun = defaultDockerRun) {}

  /** The shell + argv a spec runs (no side effects beyond logging). */
  command(spec: ContainerSpawnSpec): { shell: string; shellArgs: string[] } {
    return buildShellCommand(
      spec.mode,
      spec.containerName,
      spec.containerImage,
      spec.mountPath,
      spec.containerPath,
      spec.projectName,
      spec.basePathParam,
      spec.sessionId,
      spec.command,
      spec.isOpenCodeSession,
      spec.opencodeProvider,
      spec.opencodeModel,
    );
  }

  /** Synchronous: the PTY exists before the caller wires the WS handlers. */
  spawn(spec: ContainerSpawnSpec): ContainerSpawnResult {
    const { shell, shellArgs } = this.command(spec);
    const pty = spawnPty(
      shell,
      shellArgs,
      spec.cols,
      spec.rows,
      spec.mode === "local" ? spec.cwd : undefined,
    );
    const id =
      spec.mode === "container" && !spec.containerName
        ? `daax-${spec.sessionId.slice(0, 8)}`
        : spec.sessionId;
    return { id, pty, shell, shellArgs };
  }

  /** `docker exec` into an existing container (the `containerName` path). */
  attach(id: string, opts: AttachOptions): IPty {
    return spawnPty(
      "docker",
      ["exec", "-it", "--", id, "/bin/bash", "-l"],
      opts.cols,
      opts.rows,
      undefined,
    );
  }

  async list(): Promise<BackendSessionInfo[]> {
    const { stdout } = await this.docker([
      "ps",
      "-a",
      "--filter",
      "name=daax-",
      "--format",
      "{{.Names}}\t{{.State}}",
    ]);
    return stdout
      .split("\n")
      .map((l) => l.trim().split("\t"))
      .filter(([name]) => isAiSessionName(name))
      .map(([name, state]) => ({ id: name, state: state ?? "unknown" }));
  }

  async stop(id: string): Promise<void> {
    if (!isAiSessionName(id)) throw new Error(`not a daax session: ${id}`);
    await this.docker(["rm", "-f", id]);
  }

  async suspend(): Promise<void> {
    throw new UnsupportedOperationError(this.kind, "suspend");
  }

  async resume(): Promise<void> {
    throw new UnsupportedOperationError(this.kind, "resume");
  }
}

export const containerBackend = new ContainerBackend();

/**
 * Build the shell command and arguments for the terminal session
 */
export function buildShellCommand(
  mode: string,
  containerName: string,
  containerImage: string,
  mountPath: string,
  containerPath: string,
  projectName: string,
  basePathParam: string,
  sessionId: string,
  command: string,
  isOpenCodeSession: boolean,
  opencodeProvider: string,
  opencodeModel: string,
): { shell: string; shellArgs: string[] } {
  let shell: string;
  let shellArgs: string[];

  if (mode === "container") {
    // Container mode; tmux is only enabled later for interactive shell sessions without an initial command
    shell = "docker";

    if (containerName) {
      // Exec into an existing container. `--` ends docker's option parsing so
      // a client-supplied name starting with `-` can never be read as a flag.
      console.log(`Exec into container: ${containerName}`);
      shellArgs = ["exec", "-it", "--", containerName, "/bin/bash", "-l"];
    } else {
      // Run new container as vscode user (for pnpm-installed tools)
      // node-pty provides a PTY, so docker -it should work
      console.log(
        `Running new container: ${containerImage} on network: ${DOCKER_NETWORK}`,
      );
      console.log(`  Mount path: ${mountPath} -> ${containerPath}`);

      // Build display path for prompt: basePath/projectName or just basePath
      const displayPath = projectName
        ? `${basePathParam}/${projectName}`
        : basePathParam;

      // Determine if we should use tmux wrapper
      // Use tmux for shell sessions (no command) to enable split/new-window
      // For AI tools (claude, opencode, etc.), run directly without tmux
      const useTmux = !command; // Shell sessions get tmux, AI tools run directly
      const tmuxSessionName = `daax-${sessionId.slice(0, 8)}`;

      shellArgs = [
        "run",
        "-it",
        "--rm",
        "--name",
        `daax-${sessionId.slice(0, 8)}`,
        // SECURITY / issue #195 (Fable M5): agent containers reach `postgres`
        // via daax-net. Evaluated for segregation and DEFERRED, not fixed here:
        // daax-net is the shared plane for daax's own services (code-server, the
        // MCP gateway, etc.) that agent sessions legitimately use, so moving
        // agents to an isolated network risks breaking those integrations. The
        // Postgres exposure is mitigated separately by requiring a real
        // DAAX_PG_PASSWORD in the deploy compose (the `daax` default is
        // local-throwaway only). A dedicated agent network with an explicit
        // allow-list to just the services agents need is the follow-up.
        "--network",
        DOCKER_NETWORK,
        "-u",
        "vscode",
        "-v",
        `${mountPath}:${containerPath}`,
        // SECURITY / issue #195 (Fable M5): credential mounts are read-WRITE by
        // necessity, documented accepted risk. Write-back is REQUIRED and `:ro`
        // would break auth persistence (AC#4):
        //   - Claude Code performs OAuth token refresh and rewrites
        //     `.claude/.credentials.json`; a read-only mount breaks auth over
        //     time as the access token expires.
        //   - Both tools persist the INITIAL login here — the dir is created
        //     empty (see server/docker/auth-paths.ts) and populated by
        //     `claude login` / `opencode auth login` INSIDE the container; a
        //     read-only mount would discard that, so no session could ever
        //     authenticate.
        // Mitigation scope differs by tool/mode — be precise:
        //   - Claude: a daax-DEDICATED store, never the operator's global
        //     `~/.claude`. Host mode uses `~/.daax-claude`; container mode uses
        //     `${workspace}/.daax/claude`. Exfiltration here leaks only the
        //     daax-scoped Claude credential.
        //   - OpenCode, CONTAINER mode: daax-scoped to
        //     `${workspace}/.daax/opencode`.
        //   - OpenCode, HOST mode: daax-scoped to `~/.daax-opencode`
        //     (auth-paths.ts), created empty and populated by `opencode auth
        //     login` inside a daax container. The operator's real global
        //     `~/.local/share/opencode` is never mounted.
        // Residual risk: untrusted agent code can read/exfiltrate the long-lived
        // token in whichever daax-scoped store is mounted, and the store is
        // shared across daax agent sessions. Follow-up (tracked in the #195
        // decision log): per-session, short-lived scoped tokens so a compromised
        // session cannot exfiltrate a durable credential or read another
        // session's token.
        "-v",
        `${claudeAuthHostPath}:/home/vscode/.claude`, // Persist Claude auth (RW required — see note above)
        "-v",
        `${openCodeAuthHostPath}:/home/vscode/.local/share/opencode`, // Persist OpenCode auth (RW required — see note above)
        "-w",
        containerPath,
        "-e",
        "TERM=xterm-256color",
        "-e",
        "COLORTERM=truecolor",
        "-e",
        `CLAUDE_CONFIG_DIR=/home/vscode/.claude`,
        "-e",
        `OPENCODE_CONFIG_DIR=/home/vscode/.local/share/opencode`,
        "-e",
        "HOME=/home/vscode",
        "-e",
        "PNPM_HOME=/home/vscode/.local/share/pnpm",
        "-e",
        `FALCON_PROJECT=${projectName || ""}`,
        "-e",
        `FALCON_BASEPATH=${basePathParam}`,
        "-e",
        `FALCON_DISPLAY_PATH=${displayPath}`,
      ];

      // Add OpenCode-specific env vars if this is an OpenCode session
      if (isOpenCodeSession) {
        shellArgs.push("-e", `OPENCODE_PROVIDER=${opencodeProvider}`);
        shellArgs.push("-e", `OPENCODE_MODEL=${opencodeModel}`);
      }

      if (useTmux) {
        // Shell mode: wrap in tmux for split/new-window capability
        // Use zsh for the wrapper shell since PS1 uses zsh-style prompt escapes (%F{blue}...%f)
        // SECURITY: Use $FALCON_DISPLAY_PATH env var instead of interpolating displayPath
        // directly to prevent command injection via projectName or basePath
        shellArgs.push(
          containerImage,
          "/bin/zsh",
          "-l",
          "-c",
          // Start tmux with custom PS1, then spawn zsh inside tmux
          `export PATH=/home/vscode/.local/share/pnpm:$PATH && ` +
            `export PS1='%F{blue}$FALCON_DISPLAY_PATH%f > ' && ` +
            `tmux new-session -s ${tmuxSessionName} /bin/zsh -l`,
        );
      } else {
        // AI tool mode - run AI tools (claude, opencode, etc.) directly without tmux
        // Use zsh with custom PS1 (zsh-style prompt escapes: %F{color}...%f)
        // SECURITY: Use $FALCON_DISPLAY_PATH env var instead of interpolating displayPath
        // directly to prevent command injection via projectName or basePath
        shellArgs.push(
          containerImage,
          "/bin/zsh",
          "-l",
          "-c",
          `export PATH=/home/vscode/.local/share/pnpm:$PATH && export PS1='%F{blue}$FALCON_DISPLAY_PATH%f > ' && exec /bin/zsh`,
        );
      }
    }
  } else if (mode === "shell-tmux") {
    // Local shell with tmux wrapper for split/new-window capability
    // Works with both xterm and ghostty terminals
    const tmuxSessionName = `daax-shell-${sessionId.slice(0, 8)}`;
    console.log(`Starting local tmux shell session: ${tmuxSessionName}`);

    shell = "tmux";
    shellArgs = ["new-session", "-s", tmuxSessionName, "/bin/zsh", "-l"];
  } else {
    // Local shell - run directly (mode === "local")
    console.log(`Starting local shell: shell`);
    shell = "/bin/zsh";
    shellArgs = ["-l"];
  }

  return { shell, shellArgs };
}
