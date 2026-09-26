/** Vendor commands confirmed in dist-agent docs/research/vendor-resume-commands.md. */
export function resumeCommand(
  agentType: string,
  sessionId: string,
): string | null {
  // Commands run through a shell. Only accept a single non-option identifier;
  // never interpolate shell syntax from a daemon row.
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(sessionId)) return null;
  switch (agentType) {
    case "claude":
      return `claude --resume ${sessionId}`;
    case "codex":
      return `codex resume ${sessionId}`;
    default:
      return null;
  }
}

export function resumeUnavailableReason(agentType: string): string {
  return agentType === "gemini"
    ? "Gemini --resume takes latest or a picker index, not a session id; --session-file needs a path the daemon does not report"
    : `no safe resume command for this ${agentType} session id`;
}

export function resumeParams(cwd: string, command: string): URLSearchParams {
  return new URLSearchParams({
    mode: "local",
    cwd,
    command,
    sessionType: "resume",
  });
}

/**
 * Container mode (HOST_WORKSPACE_PATH set). daax's agent containers mount a
 * directory at /workspace and `.daax/claude` as CLAUDE_CONFIG_DIR. Which
 * directory is not recorded: a project launch mounts that one project there
 * (getProjectInfo's containerPath) and a no-project launch mounts the whole
 * workspace, and every such session records cwd /workspace under the one
 * transcript key `-workspace`. So no container session can be resumed yet;
 * each case is refused with the precise reason.
 */
export const CONTAINER_WORKSPACE = "/workspace";

const SESSION_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The only session ids a transcript path is ever built from. */
export function isSessionUuid(sessionId: string): boolean {
  return SESSION_UUID.test(sessionId);
}

/**
 * The first reason a container-mode resume is refused before daax's
 * transcript check, or undefined when that check decides the reason.
 */
export function containerResumeReason(
  agentType: string,
  sessionId: string,
  cwd: string | undefined,
): string | undefined {
  if (agentType === "codex")
    return "daax agent containers do not persist CODEX_HOME, so no codex session can be resumed in one";
  if (agentType !== "claude") return resumeUnavailableReason(agentType);
  if (!cwd) return "the daemon has not reported this session's cwd";
  if (cwd.startsWith(`${CONTAINER_WORKSPACE}/`))
    return `this session ran at ${cwd} in a daax agent container, and nothing records what was mounted at /workspace then, so daax cannot tell which directory that is`;
  if (cwd !== CONTAINER_WORKSPACE)
    return "this session's cwd is a host path; its transcript is in the host's ~/.claude, which daax agent containers do not mount";
  if (!isSessionUuid(sessionId))
    return "this session id is not a UUID; daax builds no transcript path from it";
  return undefined;
}

/**
 * Given after the transcript is found. Resuming with no project would mount
 * the whole workspace where the session may have had one project, and every
 * path in the conversation would land in the wrong tree.
 */
export const NO_PROJECT_RECORD =
  "daax does not record which project this container session mounted at /workspace, so a resume could not put it back in the same tree";
