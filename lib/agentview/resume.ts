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
 * Container mode (HOST_WORKSPACE_PATH set). daax's agent containers mount the
 * workspace at /workspace and `.daax/claude` as CLAUDE_CONFIG_DIR, so the only
 * session one of them can resume is a Claude session that ran at exactly
 * /workspace and left its transcript in that store.
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
 * transcript check, or undefined when only that check remains.
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

/** No project: the terminal server mounts the whole HOST_WORKSPACE_PATH. */
export function containerResumeParams(command: string): URLSearchParams {
  return new URLSearchParams({
    mode: "container",
    cwd: CONTAINER_WORKSPACE,
    command,
    sessionType: "resume",
  });
}
