/**
 * WebSocket Connection Handler
 *
 * Handles new WebSocket connections and terminal session setup.
 */

import { WebSocket } from "ws";
import { IncomingMessage } from "http";
import { getProjectInfo } from "../../lib/project-utils";
import {
  PORT,
  HOST_WORKSPACE_PATH,
  DOCKER_NETWORK,
  DEFAULT_TERMINAL_COLS,
  DEFAULT_TERMINAL_ROWS,
  expandPath,
} from "../config/constants";
import { authenticateConnection } from "./ws-auth";
import {
  resolveContainerImage,
  DEFAULT_CONTAINER_IMAGE,
} from "../docker/image-manager";
import { getPty } from "../sessions/pty-loader";
import {
  TerminalSession,
  TerminalSessionWithTimeouts,
} from "../sessions/types";
import {
  setSession,
  deleteSession,
  getSession,
} from "../sessions/session-manager";
import {
  startRecording,
  stopRecording,
  recordOutput,
} from "../recording/recorder";
import { handleMessage, MessageHandlerContext } from "./message-handler";
import { scheduleCommand } from "./command-handler";
import { resolveWorkspaceRoot, isValidPath } from "../../lib/worktree-manager";

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

/**
 * Handle a new WebSocket connection
 */
export function handleConnection(ws: WebSocket, req: IncomingMessage): void {
  // Authenticate the upgrade BEFORE any session id / PTY / container spawn
  // (F1b, issue #95). Covers origin, the Traefik forwarded-identity path, the
  // single-use bearer-ticket path, and the loopback LOCAL_OPERATOR bypass.
  //
  // Deliberate design: reject by accepting the socket then immediately closing
  // with code 1008 (policy violation), rather than rejecting pre-101 via
  // verifyClient. Nothing is allocated before this check (no randomUUID, PTY,
  // container, or session registration), so there is no resource/auth hole. The
  // explicit 1008 lets the browser client distinguish a non-recoverable auth
  // failure from a transient network drop and stop reconnecting; a pre-101 HTTP
  // 401 collapses to opaque close code 1006 in the browser (indistinguishable
  // from a network drop), which would defeat that client-side guard.
  const auth = authenticateConnection(req);
  if (!auth.ok) {
    // Log the specific reason server-side; send only a generic reason to the
    // client so it cannot probe expired-vs-bad-signature-vs-reused distinctions.
    console.log(
      `Rejected terminal WS upgrade (${auth.reason}) from ${req.socket?.remoteAddress ?? "unknown"}`,
    );
    ws.close(auth.code, "unauthorized");
    return;
  }

  const sessionId = crypto.randomUUID();
  console.log(`New terminal session: ${sessionId}`);

  // Parse query params
  const url = new URL(req.url || "/", `http://localhost:${PORT}`);
  const mode = url.searchParams.get("mode") || "container"; // "local" | "container"
  const command = url.searchParams.get("command") || "";
  const cwd = url.searchParams.get("cwd") || process.cwd();
  const requestedImage =
    url.searchParams.get("image") || DEFAULT_CONTAINER_IMAGE;
  const containerName = url.searchParams.get("containerName") || "";
  // Resolve the container image with fallback logic only when starting a new container
  // Skip for local mode, docker exec mode (containerName set), or other non-container scenarios
  const containerImage =
    mode === "container" && !containerName
      ? resolveContainerImage(requestedImage)
      : requestedImage;
  const projectName = url.searchParams.get("project") || "";
  const projectType = url.searchParams.get("projectType") as
    | "git"
    | "planning"
    | null;
  const basePathParam = url.searchParams.get("basePath") || "~/prj";

  // OpenCode model/provider params (for opencode sessions)
  // Model format is "provider:model" (e.g., "copilot:gpt-4o", "openai:o1")
  const opencodeModelParam =
    url.searchParams.get("opencodeModel") || "copilot:gpt-4o";
  const colonIndex = opencodeModelParam.indexOf(":");
  const [opencodeProvider, opencodeModel] =
    colonIndex >= 0
      ? [
          opencodeModelParam.slice(0, colonIndex),
          opencodeModelParam.slice(colonIndex + 1),
        ]
      : ["copilot", opencodeModelParam]; // Fallback for legacy format
  const isOpenCodeSession =
    command === "opencode" || command.startsWith("opencode ");

  // Calculate mount path - prefer HOST_WORKSPACE_PATH when running in container
  const requestedMount = url.searchParams.get("mount") || cwd;

  // Translate the mount path for Docker volume mounting
  // The basePath comes from user settings (e.g., ~/prj, ~/projects, etc.)
  // When running in container mode with HOST_WORKSPACE_PATH set, translate paths
  // When running locally, just expand ~ to home dir

  // Expand the user's basePath to get the canonical form
  const expandedBasePath = expandPath(basePathParam);

  // Security: Reject path traversal attempts
  if (requestedMount.includes("..") || requestedMount.includes("//")) {
    console.log(`Rejected path traversal attempt: ${requestedMount}`);
    ws.close(1008, "Invalid path");
    return;
  }

  const { mountPath, containerPath } = resolveMountPaths(
    projectName,
    basePathParam,
    projectType,
    requestedMount,
    cwd,
    expandedBasePath,
  );

  // Security (#186): Ensure the final mount path is within the operator's
  // configured workspace root. The base MUST be a server-side constant — never
  // the client-supplied `basePath` query param (the old `HOST_WORKSPACE_PATH ||
  // expandedBasePath` let `?basePath=/` widen the base to the filesystem root in
  // host mode). resolveWorkspaceRoot() returns "/workspace" in container mode and
  // the operator's settings basePath in host mode; it ignores request input.
  //
  // The confinement itself is canonicalized (realpath) with a trailing-separator
  // boundary via isValidPath() — the shared helper (lib/worktree-manager.ts, from
  // #189). This replaces the raw lexical `startsWith`, which allowed a
  // sibling-prefix bypass (base "/home/u/prj", mount "/home/u/prj-secrets") and
  // followed symlinks planted under the workspace pointing outside it.
  // isValidPath is the same helper the code-server route (#183) can reuse.
  const securityBasePath = resolveWorkspaceRoot();
  if (!isValidPath(mountPath, securityBasePath)) {
    console.log(
      `Rejected mount outside base path: ${mountPath} (base: ${securityBasePath})`,
    );
    ws.close(1008, "Path not allowed");
    return;
  }

  const sessionType = url.searchParams.get("sessionType") || "shell";
  const enableRecording = url.searchParams.get("record") === "true";
  // Client-provided session ID for recording deduplication (prevents duplicates from React remounts)
  const clientSessionId = url.searchParams.get("clientSessionId") || undefined;

  console.log(
    `Session ${sessionId}: requestedMount=${requestedMount}, HOST_WORKSPACE_PATH=${HOST_WORKSPACE_PATH}, mountPath=${mountPath}`,
  );
  console.log(
    `Session ${sessionId}: recording=${enableRecording}${clientSessionId ? `, clientSessionId=${clientSessionId}` : ""}`,
  );

  const { shell, shellArgs } = buildShellCommand(
    mode,
    containerName,
    containerImage,
    mountPath,
    containerPath,
    projectName,
    basePathParam,
    sessionId,
    command,
    isOpenCodeSession,
    opencodeProvider,
    opencodeModel,
  );

  // Check if node-pty is available
  const pty = getPty();
  if (!pty) {
    ws.send(
      JSON.stringify({
        type: "error",
        error:
          "Terminal functionality is unavailable. node-pty optional dependency is not installed.",
      }),
    );
    ws.close();
    return;
  }

  // Spawn PTY
  const ptyProcess = pty.spawn(shell, shellArgs, {
    name: "xterm-256color",
    cols: DEFAULT_TERMINAL_COLS,
    rows: DEFAULT_TERMINAL_ROWS,
    cwd: mode === "local" ? cwd : undefined,
    env: {
      ...process.env,
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
    } as Record<string, string>,
  });

  // Store recording config but don't start until first output
  // This avoids junk recordings from React Strict Mode double-mounts
  // The clientSessionId enables server-side deduplication across multiple connections
  const recordingConfig = enableRecording
    ? {
        sessionType,
        command: command || shell,
        cols: DEFAULT_TERMINAL_COLS,
        rows: DEFAULT_TERMINAL_ROWS,
        clientSessionId,
      }
    : null;

  const session: TerminalSession = {
    pty: ptyProcess,
    ws,
    containerId:
      mode === "container" && !containerName
        ? `daax-${sessionId.slice(0, 8)}`
        : undefined,
    recordingId: undefined,
  };
  setSession(sessionId, session);

  // Send session info to client
  ws.send(
    JSON.stringify({
      type: "session",
      id: sessionId,
      mode,
      containerImage: mode === "container" ? containerImage : undefined,
      containerName: session.containerId || containerName,
    }),
  );

  // Track whether we've already attempted to start recording (to avoid repeated calls)
  let recordingAttempted = false;

  // PTY output -> WebSocket
  ptyProcess.onData((data: string) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "output", data }));
    }
    // Start recording on first output (lazy start to avoid junk recordings)
    // clientSessionId enables server-side deduplication for React remounts
    // Only attempt once - if startRecording returns null (duplicate), don't retry
    if (recordingConfig && !session.recordingId && !recordingAttempted) {
      recordingAttempted = true;
      try {
        const recordingId = startRecording(
          sessionId,
          recordingConfig.sessionType,
          recordingConfig.command,
          recordingConfig.cols,
          recordingConfig.rows,
          recordingConfig.clientSessionId,
        );
        // startRecording returns null if duplicate (same clientSessionId already recording)
        if (recordingId) {
          session.recordingId = recordingId;
          // Notify client that recording has started
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                type: "recordingStarted",
                recordingId: session.recordingId,
              }),
            );
          }
        }
      } catch (error) {
        console.error(
          `Failed to start recording for session ${sessionId}:`,
          error,
        );
        // Continue without recording if it fails
      }
    }
    // Record output if recording is active
    if (session.recordingId) {
      recordOutput(sessionId, data);
    }
  });

  ptyProcess.onExit(async ({ exitCode, signal }) => {
    console.log(
      `PTY exited: session=${sessionId}, code=${exitCode}, signal=${signal}`,
    );

    // Clear any pending kill timeout from ws.on("close") handler
    const sessionWithTimeout = session as TerminalSessionWithTimeouts;
    if (sessionWithTimeout._killTimeout) {
      clearTimeout(sessionWithTimeout._killTimeout);
      delete sessionWithTimeout._killTimeout;
    }

    // Stop recording if active - wrap in try-catch to ensure cleanup continues
    if (session.recordingId) {
      try {
        await stopRecording(sessionId);
      } catch (recordingErr) {
        console.error(
          `[Terminal Server] Error stopping recording for ${sessionId}:`,
          recordingErr,
        );
      }
    }

    // Notify client and close WebSocket - wrap in try-catch for resilience
    try {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "exit", code: exitCode, signal }));
        ws.close();
      }
    } catch (wsErr) {
      console.error(
        `[Terminal Server] Error closing WebSocket for ${sessionId}:`,
        wsErr,
      );
    }

    // Always delete session - this is critical and should not fail
    deleteSession(sessionId);
  });

  // Create message handler context
  const msgContext: MessageHandlerContext = {
    sessionId,
    sessionType,
    command,
    shell,
    ptyProcess,
    ws,
    getRecordingId: () => session.recordingId,
    setRecordingId: (id) => {
      session.recordingId = id;
    },
  };

  // WebSocket input -> PTY
  ws.on("message", (message: Buffer | string) => {
    handleMessage(message, msgContext);
  });

  ws.on("close", async () => {
    console.log(`WebSocket closed: ${sessionId}`);
    const closingSession = getSession(sessionId);
    if (!closingSession) {
      return; // Session already cleaned up by onExit handler
    }

    // Clear command timeout if it was set (prevents race conditions)
    const sessionWithTimeout = closingSession as TerminalSessionWithTimeouts;
    if (sessionWithTimeout._commandTimeout) {
      clearTimeout(sessionWithTimeout._commandTimeout);
      delete sessionWithTimeout._commandTimeout;
    }

    // Stop recording if active - wrap in try-catch for resilience
    if (closingSession.recordingId) {
      try {
        await stopRecording(sessionId);
      } catch (recordingErr) {
        console.error(
          `[Terminal Server] Error stopping recording on close for ${sessionId}:`,
          recordingErr,
        );
      }
    }

    // Schedule a fallback SIGTERM in case the PTY does not exit after EOF
    // Note: We do NOT register another onExit handler here to avoid overriding
    // the primary onExit handler which handles cleanup properly.
    // The primary handler will delete the session when PTY actually exits.
    const killTimeout = setTimeout(() => {
      try {
        // Only kill if still running; if it has already exited, kill() will throw
        closingSession.pty.kill("SIGTERM");
      } catch {
        // Process already exited or cannot be killed - ignore
      }
    }, 500);

    // Store timeout reference so the primary onExit handler can clear it
    (closingSession as TerminalSessionWithTimeouts)._killTimeout = killTimeout;

    // Gracefully close the PTY - write EOF (Ctrl+D) first to allow clean exit
    // This is gentler than SIGTERM and less likely to cause signal propagation issues
    // The primary onExit handler will delete the session when PTY exits
    try {
      // Send EOF (Ctrl+D) which tells the shell to exit
      closingSession.pty.write("\x04");
    } catch (writeErr) {
      console.error(
        `[Terminal Server] Error sending EOF to PTY ${sessionId}:`,
        writeErr,
      );
    }
  });

  ws.on("error", (err) => {
    console.error(`[Terminal Server] WebSocket error for ${sessionId}:`, err);
    // Don't propagate - just log
  });

  // If a command was specified, run it after shell initialization
  if (command) {
    const commandTimeout = scheduleCommand(command, sessionId, ptyProcess, ws);
    // Store timeout on session so the main close handler can clear it
    // This avoids race conditions from having multiple close handlers
    (session as TerminalSessionWithTimeouts)._commandTimeout = commandTimeout;
  }
}

/**
 * Resolve mount and container paths based on project settings
 */
function resolveMountPaths(
  projectName: string,
  basePathParam: string,
  projectType: "git" | "planning" | null,
  requestedMount: string,
  cwd: string,
  expandedBasePath: string,
): { mountPath: string; containerPath: string } {
  let mountPath: string;
  let containerPath: string;

  // If project name is provided, use project utilities to determine paths
  if (projectName) {
    // Pass HOST_WORKSPACE_PATH so mount paths use host paths in container mode
    const projectInfo = getProjectInfo(
      projectName,
      basePathParam,
      projectType || undefined,
      HOST_WORKSPACE_PATH || undefined,
    );

    // Check if an explicit mount path was provided (e.g., for worktrees)
    // This allows overriding the calculated project path
    if (
      requestedMount &&
      requestedMount !== cwd &&
      requestedMount !== basePathParam
    ) {
      // Translate the mount path for Docker volume mounting
      if (HOST_WORKSPACE_PATH) {
        // Container mode - translate paths using HOST_WORKSPACE_PATH
        // Normalize paths to handle trailing slashes consistently
        const basePathNormalized = basePathParam.replace(/\/+$/, "");
        const requestedMountNormalized = requestedMount.replace(/\/+$/, "");

        // Worktree paths come in with basePathParam as a prefix, e.g.:
        //   basePathParam = "~/prj"
        //   HOST_WORKSPACE_PATH = "/Users/user/prj"
        //   requestedMount = "~/prj/project/.worktrees/branch"
        // We replace the basePathParam prefix with HOST_WORKSPACE_PATH:
        //   -> "/Users/user/prj/project/.worktrees/branch"
        if (requestedMountNormalized.startsWith(basePathNormalized + "/")) {
          mountPath =
            HOST_WORKSPACE_PATH +
            requestedMountNormalized.slice(basePathNormalized.length);
        } else if (requestedMountNormalized === basePathNormalized) {
          mountPath = HOST_WORKSPACE_PATH;
        } else {
          // Absolute path or other format - use as-is
          mountPath = requestedMount;
        }
      } else {
        // Host mode - just expand ~
        mountPath = expandPath(requestedMount);
      }
    } else {
      mountPath = projectInfo.mountPath;
    }
    containerPath = projectInfo.containerPath;
  } else {
    // Path handling - use the user's configured basePath, not hardcoded paths
    if (HOST_WORKSPACE_PATH) {
      // Container mode - translate paths to host paths
      // The HOST_WORKSPACE_PATH should correspond to the user's basePath on the host
      if (requestedMount.startsWith("/workspace/")) {
        mountPath = requestedMount.replace("/workspace", HOST_WORKSPACE_PATH);
      } else if (requestedMount.startsWith("/workspace")) {
        mountPath = HOST_WORKSPACE_PATH;
      } else if (
        requestedMount === "/app" ||
        requestedMount.startsWith("/app/")
      ) {
        // Handle container's internal /app path (process.cwd() when running in container)
        // Translate to HOST_WORKSPACE_PATH for proper volume mounting
        mountPath = HOST_WORKSPACE_PATH;
      } else if (requestedMount.startsWith(basePathParam + "/")) {
        // User's basePath/project -> HOST_WORKSPACE_PATH/project
        mountPath = requestedMount.replace(basePathParam, HOST_WORKSPACE_PATH);
      } else if (requestedMount === basePathParam) {
        mountPath = HOST_WORKSPACE_PATH;
      } else if (requestedMount.startsWith("~/")) {
        // Expand ~ and check if it's under the base path
        const expandedMount = expandPath(requestedMount);
        if (expandedMount.startsWith(expandedBasePath)) {
          // Path is under basePath, translate to HOST_WORKSPACE_PATH
          mountPath = expandedMount.replace(
            expandedBasePath,
            HOST_WORKSPACE_PATH,
          );
        } else {
          // Use as-is (will be rejected by security check if outside allowed path)
          mountPath = expandedMount;
        }
      } else {
        // Use as-is but expand ~
        mountPath = expandPath(requestedMount);
      }
    } else {
      // Host mode - just expand ~
      mountPath = expandPath(requestedMount);
    }
    containerPath = "/workspace";
  }

  return { mountPath, containerPath };
}

/**
 * Build the shell command and arguments for the terminal session
 */
function buildShellCommand(
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
      // Exec into existing container
      console.log(`Exec into container: ${containerName}`);
      shellArgs = ["exec", "-it", containerName, "/bin/bash", "-l"];
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
        //   - OpenCode, HOST mode: NOT daax-scoped. auth-paths.ts resolves this
        //     to the operator's REAL global `~/.local/share/opencode` (or
        //     $XDG_DATA_HOME/opencode) and mounts it read-WRITE into agent
        //     containers. So the residual risk for OpenCode host mode is
        //     exfiltration of the operator's REAL OpenCode credential (their
        //     actual OpenCode identity), not a daax-scoped copy.
        // Residual risk: untrusted agent code can read/exfiltrate the long-lived
        // token in whichever store is mounted, and the store is shared across
        // daax agent sessions — with OpenCode host mode being the operator's real
        // global credential (see above). Follow-up (tracked in the #195 decision
        // log): a daax-scoped OpenCode store for host mode, plus per-session,
        // short-lived scoped tokens so a compromised session cannot exfiltrate a
        // durable credential or read another session's token.
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
