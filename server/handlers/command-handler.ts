/**
 * Command Handler
 *
 * Handles execution of commands in terminal sessions,
 * including special handling for AI tools like Claude and OpenCode.
 */

import { WebSocket } from "ws";
import { IPty } from "../sessions/types";
import { hasSession } from "../sessions/session-manager";

/**
 * Build the full command string, handling special cases for AI tools.
 */
export function buildFullCommand(command: string): string {
  if (command === "herdr-claude" || command.startsWith("herdr-claude ")) {
    const claudePath = "/home/vscode/.local/share/pnpm/claude";
    const claudeArgs = command.replace(/^herdr-claude\s*/, "");
    const claudeCommand = `${claudePath}${claudeArgs ? " " + claudeArgs : ""}`;

    return [
      "export PATH=/usr/local/bin:/home/vscode/.local/share/pnpm:/home/vscode/.local/bin:$PATH",
      'command -v herdr >/dev/null 2>&1 || { echo "Herdr is not installed in this container image. Pull or rebuild the configured Daax agent image."; exec /bin/zsh -l; }',
      // `herdr server & <poll loop>` must stay a single array element: a
      // backgrounded command (`&`) cannot be directly followed by this
      // array's `&&` join separator — `cmd & && next` is a shell syntax
      // error in both bash and zsh, which broke this command entirely.
      // The loop below always exits 0 (its last statement is either `break`
      // or `sleep`), so a timeout looks identical to success. The explicit
      // re-check afterwards bails into an interactive shell (printing the
      // server log) instead of proceeding to a workspace/agent that has
      // nothing to attach to.
      `herdr server >/tmp/daax-herdr-server.log 2>&1 & for i in $(seq 1 100); do herdr status server --json 2>/dev/null | grep -q '"running":true' && break; sleep 0.1; done`,
      'herdr status server --json 2>/dev/null | grep -q \'"running":true\' || { echo "Herdr server failed to start:"; cat /tmp/daax-herdr-server.log 2>/dev/null; exec /bin/zsh -l; }',
      'herdr workspace create --cwd "$PWD" --label "Daax" --no-focus >/tmp/daax-herdr-workspace.log 2>&1 || true',
      // On failure, print the Claude/agent log and drop to a shell rather than
      // swallowing the error and attaching to a session with no Claude agent.
      `herdr agent start claude --cwd "$PWD" --focus -- ${claudeCommand} >/tmp/daax-herdr-claude.log 2>&1 || { echo "Failed to start Claude via Herdr:"; cat /tmp/daax-herdr-claude.log 2>/dev/null; exec /bin/zsh -l; }`,
      "exec herdr --session daax",
    ].join(" && ");
  }

  // For claude command, use full path to avoid PATH issues during shell init
  if (command === "claude" || command.startsWith("claude ")) {
    const claudePath = "/home/vscode/.local/share/pnpm/claude";
    const claudeArgs = command.replace(/^claude\s*/, "");

    return `exec ${claudePath}${claudeArgs ? " " + claudeArgs : ""}`;
  }

  // For opencode command, set PATH with /usr/local/bin FIRST (musl fix on Alpine)
  // then run opencode from that path
  if (command === "opencode" || command.startsWith("opencode ")) {
    // PATH must have /usr/local/bin first for the musl wrapper fix, but preserve existing PATH
    return `export PATH=/usr/local/bin:/home/vscode/.local/share/pnpm:/home/vscode/.local/bin:$PATH && ${command}`;
  }

  // For copilot command, run JS version directly (native binary requires glibc, Alpine uses musl)
  // The shell script /home/vscode/.local/share/pnpm/copilot tries native first and fails silently on Alpine
  // Uses start-of-string anchor followed by whitespace or end-of-string to avoid matching "copilot" as part of longer words like "copilot-test"
  if (/^copilot(?:\s|$)/.test(command)) {
    const copilotArgs = command.replace(/^copilot\s*/, "");
    return `node /home/vscode/.local/share/pnpm/global/5/node_modules/@github/copilot/index.js${copilotArgs ? " " + copilotArgs : ""}`;
  }

  // For gemini command, use full path (pnpm-installed)
  // Uses start-of-string anchor followed by whitespace or end-of-string to avoid matching "gemini" as part of longer words like "gemini-test"
  if (/^gemini(?:\s|$)/.test(command)) {
    return command.replace(
      /^gemini(?=\s|$)/,
      "/home/vscode/.local/share/pnpm/gemini",
    );
  }

  // For codex command, use full path (pnpm-installed)
  // Uses start-of-string anchor followed by whitespace or end-of-string to avoid matching "codex" as part of longer words like "codex-test"
  if (/^codex(?:\s|$)/.test(command)) {
    return command.replace(
      /^codex(?=\s|$)/,
      "/home/vscode/.local/share/pnpm/codex",
    );
  }

  return command;
}

/**
 * Schedule command execution after shell initialization.
 * Returns the timeout handle so it can be cleared if needed.
 */
export function scheduleCommand(
  command: string,
  sessionId: string,
  ptyProcess: IPty,
  ws: WebSocket,
): NodeJS.Timeout {
  // Track command execution to prevent duplicates (e.g., from React Strict Mode double-mount).
  // The commandSent guard protects against a specific edge case: if we later add reconnection
  // logic that re-registers the timeout, or if clearTimeout fails silently and the callback
  // fires anyway. While currently single-fire, this pattern costs nothing and prevents
  // hard-to-debug duplicate command execution if the code evolves.
  let commandSent = false;

  const commandTimeout = setTimeout(() => {
    // Guard against duplicate execution and check session/WebSocket still valid
    if (commandSent) {
      console.log(
        `[terminal] Session ${sessionId}: command already sent, skipping duplicate`,
      );
      return;
    }
    if (!hasSession(sessionId)) {
      console.log(
        `[terminal] Session ${sessionId}: session no longer exists, skipping command`,
      );
      return;
    }
    if (ws.readyState !== WebSocket.OPEN) {
      console.log(
        `[terminal] Session ${sessionId}: WebSocket not open (state=${ws.readyState}), skipping command`,
      );
      return;
    }

    commandSent = true;
    console.log(`[terminal] Session ${sessionId}: Running command: ${command}`);

    const fullCommand = buildFullCommand(command);
    ptyProcess.write(fullCommand + "\r");
  }, 1000); // Increased delay for shell initialization

  return commandTimeout;
}
