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
