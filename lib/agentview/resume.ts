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
 * workspace, and every such session records cwd /workspace. So no container
 * session can be resumed yet, and each case says why without any I/O.
 */
const CONTAINER_WORKSPACE = "/workspace";

/** Resuming with no project would put the conversation in the wrong tree. */
export const NO_PROJECT_RECORD =
  "daax does not record which project this container session mounted at /workspace, so a resume could not put it back in the same tree";

/** Why container mode refuses this session, first reason first. */
export function containerResumeReason(
  agentType: string,
  cwd: string | undefined,
): string {
  if (agentType === "codex")
    return "daax agent containers do not persist CODEX_HOME, so no codex session can be resumed in one";
  if (agentType !== "claude") return resumeUnavailableReason(agentType);
  if (!cwd) return "the daemon has not reported this session's cwd";
  if (cwd.startsWith(`${CONTAINER_WORKSPACE}/`))
    return `this session ran at ${cwd} in a daax agent container, and nothing records what was mounted at /workspace then, so daax cannot tell which directory that is`;
  if (cwd === CONTAINER_WORKSPACE) return NO_PROJECT_RECORD;
  return "this session's cwd is a host path; its transcript is in the host's ~/.claude, which daax agent containers do not mount";
}
