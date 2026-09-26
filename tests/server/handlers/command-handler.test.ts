/**
 * Tests for Command Handler
 *
 * Tests command transformation and scheduled execution
 * for terminal sessions with AI tool support.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WebSocket } from "ws";
import {
  buildFullCommand,
  commandTarget,
  hostBinaryFor,
  scheduleCommand,
} from "../../../server/handlers/command-handler";
import type { IPty } from "../../../server/sessions/types";

// Mock the session manager
vi.mock("../../../server/sessions/session-manager", () => ({
  hasSession: vi.fn(() => true),
}));

import { hasSession } from "../../../server/sessions/session-manager";
const mockHasSession = vi.mocked(hasSession);

describe("buildFullCommand", () => {
  describe("claude command", () => {
    const claudePath = "/home/vscode/.local/share/pnpm/claude";

    it("transforms bare claude command to a full-path exec (no flowspec prompt)", () => {
      const result = buildFullCommand("claude", "agent-container");

      expect(result).toBe(`exec ${claudePath}`);
      expect(result).not.toContain("flowspec");
    });

    it("transforms claude with arguments", () => {
      const result = buildFullCommand("claude --model opus", "agent-container");

      expect(result).toBe(`exec ${claudePath} --model opus`);
      expect(result).not.toContain("flowspec");
    });

    it("transforms claude with complex arguments", () => {
      const result = buildFullCommand(
        "claude chat --continue --verbose",
        "agent-container",
      );

      expect(result).toBe(`exec ${claudePath} chat --continue --verbose`);
      expect(result).not.toContain("flowspec");
    });

    it("preserves quoted arguments", () => {
      const result = buildFullCommand(
        'claude "hello world"',
        "agent-container",
      );

      expect(result).toBe(`exec ${claudePath} "hello world"`);
      expect(result).not.toContain("flowspec");
    });
  });

  describe("herdr-claude command", () => {
    const claudePath = "/home/vscode/.local/share/pnpm/claude";

    it("starts Herdr, launches Claude as a Herdr agent, then attaches to the Herdr session", () => {
      const result = buildFullCommand("herdr-claude", "agent-container");

      expect(result).toContain("command -v herdr");
      expect(result).toContain("herdr server");
      expect(result).toContain('herdr workspace create --cwd "$PWD"');
      expect(result).toContain(
        `herdr agent start claude --cwd "$PWD" --focus -- ${claudePath}`,
      );
      expect(result).toContain("exec herdr --session daax");
      expect(result).not.toContain("docker run");
    });

    it("never places a backgrounded command directly before the && join separator (regression: invalid shell syntax)", () => {
      // A bare `&` (backgrounding `herdr server`) immediately followed by
      // `&&` is a syntax error in both bash and zsh (`cmd & && next`) and
      // previously broke this command end-to-end. `herdr server &` must be
      // followed by the poll loop directly, not by another `&&`-joined
      // array element.
      const result = buildFullCommand("herdr-claude", "agent-container");

      expect(result).not.toMatch(/&\s*&&/);
      expect(result).toContain(
        `herdr server >/tmp/daax-herdr-server.log 2>&1 & for i in $(seq 1 100);`,
      );
    });

    it("matches any whitespace separator, not just a literal space (consistent with the arg-stripping regex)", () => {
      const result = buildFullCommand(
        "herdr-claude\t--dangerously-skip-permissions",
        "agent-container",
      );

      expect(result).toContain(
        `herdr agent start claude --cwd "$PWD" --focus -- ${claudePath} --dangerously-skip-permissions`,
      );
    });

    it("does not match herdr-claude-test (word boundary)", () => {
      expect(buildFullCommand("herdr-claude-test", "agent-container")).toBe(
        "herdr-claude-test",
      );
    });

    it("passes Claude arguments through to the Herdr-started Claude agent", () => {
      const result = buildFullCommand(
        "herdr-claude --dangerously-skip-permissions",
        "agent-container",
      );

      expect(result).toContain(
        `herdr agent start claude --cwd "$PWD" --focus -- ${claudePath} --dangerously-skip-permissions`,
      );
    });
  });

  describe("opencode command", () => {
    it("sets PATH with /usr/local/bin first for bare command", () => {
      const result = buildFullCommand("opencode", "agent-container");

      expect(result).toBe(
        "export PATH=/usr/local/bin:/home/vscode/.local/share/pnpm:/home/vscode/.local/bin:$PATH && opencode",
      );
    });

    it("sets PATH for opencode with arguments", () => {
      const result = buildFullCommand("opencode --help", "agent-container");

      expect(result).toBe(
        "export PATH=/usr/local/bin:/home/vscode/.local/share/pnpm:/home/vscode/.local/bin:$PATH && opencode --help",
      );
    });

    it("preserves full command with all arguments", () => {
      const result = buildFullCommand(
        "opencode chat --model gpt-4",
        "agent-container",
      );

      expect(result).toContain("&& opencode chat --model gpt-4");
    });
  });

  describe("copilot command", () => {
    const copilotPath =
      "/home/vscode/.local/share/pnpm/global/5/node_modules/@github/copilot/index.js";

    it("transforms bare copilot command to node execution", () => {
      const result = buildFullCommand("copilot", "agent-container");

      expect(result).toBe(`node ${copilotPath}`);
    });

    it("transforms copilot with arguments", () => {
      const result = buildFullCommand("copilot --help", "agent-container");

      expect(result).toBe(`node ${copilotPath} --help`);
    });

    it("transforms copilot with complex arguments", () => {
      const result = buildFullCommand(
        "copilot chat --continue",
        "agent-container",
      );

      expect(result).toBe(`node ${copilotPath} chat --continue`);
    });

    it("does not match copilot-test (word boundary)", () => {
      const result = buildFullCommand("copilot-test", "agent-container");

      expect(result).toBe("copilot-test");
    });

    it("does not match mycopilot (word boundary)", () => {
      const result = buildFullCommand("mycopilot", "agent-container");

      expect(result).toBe("mycopilot");
    });
  });

  describe("gemini command", () => {
    const geminiPath = "/home/vscode/.local/share/pnpm/gemini";

    it("transforms bare gemini command to full path", () => {
      const result = buildFullCommand("gemini", "agent-container");

      expect(result).toBe(geminiPath);
    });

    it("transforms gemini with arguments", () => {
      const result = buildFullCommand("gemini --help", "agent-container");

      expect(result).toBe(`${geminiPath} --help`);
    });

    it("transforms gemini with complex arguments", () => {
      const result = buildFullCommand(
        "gemini chat --model pro",
        "agent-container",
      );

      expect(result).toBe(`${geminiPath} chat --model pro`);
    });

    it("does not match gemini-test (word boundary)", () => {
      const result = buildFullCommand("gemini-test", "agent-container");

      expect(result).toBe("gemini-test");
    });

    it("does not match mygemini (word boundary)", () => {
      const result = buildFullCommand("mygemini", "agent-container");

      expect(result).toBe("mygemini");
    });
  });

  describe("codex command", () => {
    const codexPath = "/home/vscode/.local/share/pnpm/codex";

    it("transforms bare codex command to full path", () => {
      const result = buildFullCommand("codex", "agent-container");

      expect(result).toBe(codexPath);
    });

    it("transforms codex with arguments", () => {
      const result = buildFullCommand("codex --help", "agent-container");

      expect(result).toBe(`${codexPath} --help`);
    });

    it("transforms codex with complex arguments", () => {
      const result = buildFullCommand(
        "codex chat --continue",
        "agent-container",
      );

      expect(result).toBe(`${codexPath} chat --continue`);
    });

    it("does not match codex-test (word boundary)", () => {
      const result = buildFullCommand("codex-test", "agent-container");

      expect(result).toBe("codex-test");
    });

    it("does not match mycodex (word boundary)", () => {
      const result = buildFullCommand("mycodex", "agent-container");

      expect(result).toBe("mycodex");
    });
  });

  describe("passthrough commands", () => {
    it("returns ls unchanged", () => {
      expect(buildFullCommand("ls", "agent-container")).toBe("ls");
    });

    it("returns ls with arguments unchanged", () => {
      expect(buildFullCommand("ls -la", "agent-container")).toBe("ls -la");
    });

    it("returns git commands unchanged", () => {
      expect(buildFullCommand("git status", "agent-container")).toBe(
        "git status",
      );
    });

    it("returns npm commands unchanged", () => {
      expect(buildFullCommand("npm install", "agent-container")).toBe(
        "npm install",
      );
    });

    it("returns cd commands unchanged", () => {
      expect(buildFullCommand("cd /home", "agent-container")).toBe("cd /home");
    });

    it("returns empty string unchanged", () => {
      expect(buildFullCommand("", "agent-container")).toBe("");
    });

    it("returns whitespace-only commands unchanged", () => {
      expect(buildFullCommand("   ", "agent-container")).toBe("   ");
    });

    it("returns complex shell commands unchanged", () => {
      const cmd = "cat file.txt | grep pattern | sort";
      expect(buildFullCommand(cmd, "agent-container")).toBe(cmd);
    });

    it("returns commands with environment variables unchanged", () => {
      const cmd = "NODE_ENV=production npm start";
      expect(buildFullCommand(cmd, "agent-container")).toBe(cmd);
    });
  });

  describe("edge cases", () => {
    it("handles command with leading spaces", () => {
      // Leading spaces are preserved
      expect(buildFullCommand("  ls", "agent-container")).toBe("  ls");
    });

    it("handles command with trailing spaces", () => {
      expect(buildFullCommand("ls  ", "agent-container")).toBe("ls  ");
    });

    it("handles claudes (not claude)", () => {
      expect(buildFullCommand("claudes", "agent-container")).toBe("claudes");
    });

    it("handles opencodes (not opencode)", () => {
      expect(buildFullCommand("opencodes", "agent-container")).toBe(
        "opencodes",
      );
    });

    it("handles claude as substring in path", () => {
      expect(
        buildFullCommand("/usr/bin/claude-wrapper", "agent-container"),
      ).toBe("/usr/bin/claude-wrapper");
    });
  });
});

describe("buildFullCommand for a local pty", () => {
  // A local pty is the operator's host (or the daax-web image, which has no
  // /home/vscode): the login shell's PATH resolves the tool.
  it.each([
    "claude --resume 13acf692-c5b0-443b-9a60-a7e40e83799a",
    "claude",
    "codex resume 01a0dbdb-0344-70c3-b9ce-b5f1a542f2d4",
    "gemini --help",
    "copilot chat",
    "opencode",
    "herdr-claude",
  ])("types %j verbatim", (cmd) => {
    expect(buildFullCommand(cmd, "local", {})).toBe(cmd);
  });

  it("the host resume that failed live is not rewritten to a container path", () => {
    expect(
      buildFullCommand(
        "claude --resume 13acf692-c5b0-443b-9a60-a7e40e83799a",
        "local",
        {},
      ),
    ).toBe("claude --resume 13acf692-c5b0-443b-9a60-a7e40e83799a");
    expect(
      buildFullCommand(
        "claude --resume 13acf692-c5b0-443b-9a60-a7e40e83799a",
        "agent-container",
      ),
    ).toBe(
      "exec /home/vscode/.local/share/pnpm/claude --resume 13acf692-c5b0-443b-9a60-a7e40e83799a",
    );
  });
});

describe("a local pty types the launcher's absolute claude and codex", () => {
  // kinsale 2026-09-26: the login shell resolved `claude` to a pnpm global
  // Claude Code 2.0.50 that hides its argv, so the resume ran stale and agentd
  // could not see it. The launcher names the binary its own PATH resolves.
  const env = {
    DAAX_HOST_CLAUDE_BIN: "/home/jpoley/.local/bin/claude",
    DAAX_HOST_CODEX_BIN: "/home/linuxbrew/.linuxbrew/bin/codex",
  };

  it("pins claude --resume to the named binary", () => {
    expect(
      buildFullCommand(
        "claude --resume efe55701-a82c-4308-a0fd-f2138f87d69d",
        "local",
        env,
      ),
    ).toBe(
      "/home/jpoley/.local/bin/claude --resume efe55701-a82c-4308-a0fd-f2138f87d69d",
    );
  });

  it("pins codex resume to the named binary", () => {
    expect(
      buildFullCommand(
        "codex resume 01a0dbdb-0344-70c3-b9ce-b5f1a542f2d4",
        "local",
        env,
      ),
    ).toBe(
      "/home/linuxbrew/.linuxbrew/bin/codex resume 01a0dbdb-0344-70c3-b9ce-b5f1a542f2d4",
    );
  });

  it("leaves a look-alike command alone", () => {
    expect(buildFullCommand("claudex --help", "local", env)).toBe(
      "claudex --help",
    );
    expect(buildFullCommand("gemini --help", "local", env)).toBe(
      "gemini --help",
    );
  });

  it("does not change a container pty", () => {
    expect(
      buildFullCommand(
        "claude --resume efe55701-a82c-4308-a0fd-f2138f87d69d",
        "agent-container",
        env,
      ),
    ).toBe(
      "exec /home/vscode/.local/share/pnpm/claude --resume efe55701-a82c-4308-a0fd-f2138f87d69d",
    );
  });

  it.each([
    "claude",
    "relative/claude",
    "/home/j poley/claude",
    "/bin/claude;rm -rf ~",
    "/bin/$(id)",
    "",
  ])("ignores %j rather than interpolating it", (value) => {
    expect(hostBinaryFor("claude", { DAAX_HOST_CLAUDE_BIN: value })).toBe(
      undefined,
    );
    expect(
      buildFullCommand("claude --resume x", "local", {
        DAAX_HOST_CLAUDE_BIN: value,
      }),
    ).toBe("claude --resume x");
  });
});

describe("commandTarget", () => {
  it.each([
    ["container", "agent-container"],
    ["local", "local"],
    ["shell-tmux", "local"],
  ])("mode %s runs its command in %s", (mode, target) => {
    expect(commandTarget(mode)).toBe(target);
  });
});

describe("scheduleCommand", () => {
  let mockPty: IPty;
  let mockWs: WebSocket;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();

    mockPty = {
      pid: 12345,
      process: "bash",
      write: vi.fn(),
      resize: vi.fn(),
      kill: vi.fn(),
      onData: vi.fn(),
      onExit: vi.fn(),
    };

    mockWs = {
      readyState: WebSocket.OPEN,
    } as unknown as WebSocket;

    mockHasSession.mockReturnValue(true);
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("returns a timeout handle", () => {
    const timeout = scheduleCommand(
      "ls",
      "session-1",
      mockPty,
      mockWs,
      "agent-container",
    );

    expect(timeout).toBeDefined();
    expect(typeof timeout[Symbol.toPrimitive]).toBe("function");
  });

  it("writes command to PTY after 1 second delay", () => {
    scheduleCommand("ls", "session-1", mockPty, mockWs, "agent-container");

    expect(mockPty.write).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1000);

    expect(mockPty.write).toHaveBeenCalledWith("ls\r");
  });

  it("transforms command before writing", () => {
    scheduleCommand("gemini", "session-1", mockPty, mockWs, "agent-container");

    vi.advanceTimersByTime(1000);

    expect(mockPty.write).toHaveBeenCalledWith(
      "/home/vscode/.local/share/pnpm/gemini\r",
    );
  });

  it("logs command execution", () => {
    scheduleCommand("ls", "session-1", mockPty, mockWs, "agent-container");

    vi.advanceTimersByTime(1000);

    expect(consoleLogSpy).toHaveBeenCalledWith(
      "[terminal] Session session-1: Running command: ls",
    );
  });

  it("skips execution if session no longer exists", () => {
    mockHasSession.mockReturnValue(false);

    scheduleCommand("ls", "session-1", mockPty, mockWs, "agent-container");

    vi.advanceTimersByTime(1000);

    expect(mockPty.write).not.toHaveBeenCalled();
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "[terminal] Session session-1: session no longer exists, skipping command",
    );
  });

  it("skips execution if WebSocket is not open", () => {
    const closingWs = { readyState: WebSocket.CLOSING } as unknown as WebSocket;

    scheduleCommand("ls", "session-1", mockPty, closingWs, "agent-container");

    vi.advanceTimersByTime(1000);

    expect(mockPty.write).not.toHaveBeenCalled();
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "[terminal] Session session-1: WebSocket not open (state=2), skipping command",
    );
  });

  it("skips execution if WebSocket is closed", () => {
    const closedWs = { readyState: WebSocket.CLOSED } as unknown as WebSocket;

    scheduleCommand("ls", "session-1", mockPty, closedWs, "agent-container");

    vi.advanceTimersByTime(1000);

    expect(mockPty.write).not.toHaveBeenCalled();
  });

  it("prevents duplicate execution on multiple timer fires", () => {
    scheduleCommand("ls", "session-1", mockPty, mockWs, "agent-container");

    vi.advanceTimersByTime(1000);
    expect(mockPty.write).toHaveBeenCalledTimes(1);

    // Simulate edge case where callback fires again (shouldn't happen normally)
    // The commandSent guard should prevent duplicate execution
    vi.advanceTimersByTime(1000);
    expect(mockPty.write).toHaveBeenCalledTimes(1);
  });

  it("can be cleared before execution", () => {
    const timeout = scheduleCommand(
      "ls",
      "session-1",
      mockPty,
      mockWs,
      "agent-container",
    );

    clearTimeout(timeout);

    vi.advanceTimersByTime(1000);

    expect(mockPty.write).not.toHaveBeenCalled();
  });

  it("handles complex commands with arguments", () => {
    scheduleCommand(
      "claude --model opus",
      "session-1",
      mockPty,
      mockWs,
      "agent-container",
    );

    vi.advanceTimersByTime(1000);

    expect(mockPty.write).toHaveBeenCalledTimes(1);
    const writtenCommand = (mockPty.write as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as string;
    expect(writtenCommand).toContain("--model opus");
    expect(writtenCommand.endsWith("\r")).toBe(true);
  });

  it("handles empty command", () => {
    scheduleCommand("", "session-1", mockPty, mockWs, "agent-container");

    vi.advanceTimersByTime(1000);

    expect(mockPty.write).toHaveBeenCalledWith("\r");
  });

  describe("WebSocket state checks", () => {
    it("skips when WebSocket is CONNECTING", () => {
      const connectingWs = {
        readyState: WebSocket.CONNECTING,
      } as unknown as WebSocket;

      scheduleCommand(
        "ls",
        "session-1",
        mockPty,
        connectingWs,
        "agent-container",
      );
      vi.advanceTimersByTime(1000);

      expect(mockPty.write).not.toHaveBeenCalled();
    });

    it("executes when WebSocket is OPEN", () => {
      // mockWs is already OPEN by default from beforeEach
      scheduleCommand("ls", "session-1", mockPty, mockWs, "agent-container");
      vi.advanceTimersByTime(1000);

      expect(mockPty.write).toHaveBeenCalled();
    });

    it("skips when WebSocket is CLOSING", () => {
      const closingWs = {
        readyState: WebSocket.CLOSING,
      } as unknown as WebSocket;

      scheduleCommand("ls", "session-1", mockPty, closingWs, "agent-container");
      vi.advanceTimersByTime(1000);

      expect(mockPty.write).not.toHaveBeenCalled();
    });

    it("skips when WebSocket is CLOSED", () => {
      const closedWs = { readyState: WebSocket.CLOSED } as unknown as WebSocket;

      scheduleCommand("ls", "session-1", mockPty, closedWs, "agent-container");
      vi.advanceTimersByTime(1000);

      expect(mockPty.write).not.toHaveBeenCalled();
    });
  });

  describe("session validation", () => {
    it("checks session existence before execution", () => {
      scheduleCommand("ls", "session-1", mockPty, mockWs, "agent-container");

      expect(mockHasSession).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1000);

      expect(mockHasSession).toHaveBeenCalledWith("session-1");
    });

    it("uses correct session ID for validation", () => {
      scheduleCommand(
        "ls",
        "my-unique-session-id",
        mockPty,
        mockWs,
        "agent-container",
      );

      vi.advanceTimersByTime(1000);

      expect(mockHasSession).toHaveBeenCalledWith("my-unique-session-id");
    });
  });
});
