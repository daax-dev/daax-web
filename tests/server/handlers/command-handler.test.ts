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

    it("transforms bare claude command with flowspec check", () => {
      const result = buildFullCommand("claude");

      expect(result).toContain("bash -c");
      expect(result).toContain(".flowspec");
      expect(result).toContain("flowspec init");
      expect(result).toContain(`exec ${claudePath}`);
      // Should end with bare claude command (no trailing args)
      expect(result.endsWith(`exec ${claudePath}`)).toBe(true);
    });

    it("transforms claude with arguments", () => {
      const result = buildFullCommand("claude --model opus");

      expect(result).toContain(`exec ${claudePath} --model opus`);
    });

    it("transforms claude with complex arguments", () => {
      const result = buildFullCommand("claude chat --continue --verbose");

      expect(result).toContain(`exec ${claudePath} chat --continue --verbose`);
    });

    it("preserves quoted arguments", () => {
      const result = buildFullCommand('claude "hello world"');

      expect(result).toContain(`exec ${claudePath} "hello world"`);
    });

    it("includes flowspec check for directory detection", () => {
      const result = buildFullCommand("claude");

      // Checks if .flowspec exists (skip prompt if it does)
      expect(result).toContain("[ -d .flowspec ]");
      expect(result).toContain("command -v flowspec >/dev/null 2>&1");
    });

    it("includes TTY check in flowspec wrapper", () => {
      const result = buildFullCommand("claude");

      // Checks if NOT a TTY (skip prompt if not interactive)
      expect(result).toContain("[ ! -t 0 ]");
    });

    it("includes timeout for flowspec prompt", () => {
      const result = buildFullCommand("claude");

      expect(result).toContain("read -t 5");
    });

    it("uses bash -c for flowspec check and exec for claude", () => {
      const result = buildFullCommand("claude");

      expect(result).toMatch(/^bash -c/);
      expect(result).toContain("; exec");
    });
  });

  describe("opencode command", () => {
    it("sets PATH with /usr/local/bin first for bare command", () => {
      const result = buildFullCommand("opencode");

      expect(result).toBe(
        "export PATH=/usr/local/bin:/home/vscode/.local/share/pnpm:/home/vscode/.local/bin:$PATH && opencode"
      );
    });

    it("sets PATH for opencode with arguments", () => {
      const result = buildFullCommand("opencode --help");

      expect(result).toBe(
        "export PATH=/usr/local/bin:/home/vscode/.local/share/pnpm:/home/vscode/.local/bin:$PATH && opencode --help"
      );
    });

    it("preserves full command with all arguments", () => {
      const result = buildFullCommand("opencode chat --model gpt-4");

      expect(result).toContain("&& opencode chat --model gpt-4");
    });
  });

  describe("copilot command", () => {
    const copilotPath =
      "/home/vscode/.local/share/pnpm/global/5/node_modules/@github/copilot/index.js";

    it("transforms bare copilot command to node execution", () => {
      const result = buildFullCommand("copilot");

      expect(result).toBe(`node ${copilotPath}`);
    });

    it("transforms copilot with arguments", () => {
      const result = buildFullCommand("copilot --help");

      expect(result).toBe(`node ${copilotPath} --help`);
    });

    it("transforms copilot with complex arguments", () => {
      const result = buildFullCommand("copilot chat --continue");

      expect(result).toBe(`node ${copilotPath} chat --continue`);
    });

    it("does not match copilot-test (word boundary)", () => {
      const result = buildFullCommand("copilot-test");

      expect(result).toBe("copilot-test");
    });

    it("does not match mycopilot (word boundary)", () => {
      const result = buildFullCommand("mycopilot");

      expect(result).toBe("mycopilot");
    });
  });

  describe("gemini command", () => {
    const geminiPath = "/home/vscode/.local/share/pnpm/gemini";

    it("transforms bare gemini command to full path", () => {
      const result = buildFullCommand("gemini");

      expect(result).toBe(geminiPath);
    });

    it("transforms gemini with arguments", () => {
      const result = buildFullCommand("gemini --help");

      expect(result).toBe(`${geminiPath} --help`);
    });

    it("transforms gemini with complex arguments", () => {
      const result = buildFullCommand("gemini chat --model pro");

      expect(result).toBe(`${geminiPath} chat --model pro`);
    });

    it("does not match gemini-test (word boundary)", () => {
      const result = buildFullCommand("gemini-test");

      expect(result).toBe("gemini-test");
    });

    it("does not match mygemini (word boundary)", () => {
      const result = buildFullCommand("mygemini");

      expect(result).toBe("mygemini");
    });
  });

  describe("codex command", () => {
    const codexPath = "/home/vscode/.local/share/pnpm/codex";

    it("transforms bare codex command to full path", () => {
      const result = buildFullCommand("codex");

      expect(result).toBe(codexPath);
    });

    it("transforms codex with arguments", () => {
      const result = buildFullCommand("codex --help");

      expect(result).toBe(`${codexPath} --help`);
    });

    it("transforms codex with complex arguments", () => {
      const result = buildFullCommand("codex chat --continue");

      expect(result).toBe(`${codexPath} chat --continue`);
    });

    it("does not match codex-test (word boundary)", () => {
      const result = buildFullCommand("codex-test");

      expect(result).toBe("codex-test");
    });

    it("does not match mycodex (word boundary)", () => {
      const result = buildFullCommand("mycodex");

      expect(result).toBe("mycodex");
    });
  });

  describe("passthrough commands", () => {
    it("returns ls unchanged", () => {
      expect(buildFullCommand("ls")).toBe("ls");
    });

    it("returns ls with arguments unchanged", () => {
      expect(buildFullCommand("ls -la")).toBe("ls -la");
    });

    it("returns git commands unchanged", () => {
      expect(buildFullCommand("git status")).toBe("git status");
    });

    it("returns npm commands unchanged", () => {
      expect(buildFullCommand("npm install")).toBe("npm install");
    });

    it("returns cd commands unchanged", () => {
      expect(buildFullCommand("cd /home")).toBe("cd /home");
    });

    it("returns empty string unchanged", () => {
      expect(buildFullCommand("")).toBe("");
    });

    it("returns whitespace-only commands unchanged", () => {
      expect(buildFullCommand("   ")).toBe("   ");
    });

    it("returns complex shell commands unchanged", () => {
      const cmd = "cat file.txt | grep pattern | sort";
      expect(buildFullCommand(cmd)).toBe(cmd);
    });

    it("returns commands with environment variables unchanged", () => {
      const cmd = "NODE_ENV=production npm start";
      expect(buildFullCommand(cmd)).toBe(cmd);
    });
  });

  describe("edge cases", () => {
    it("handles command with leading spaces", () => {
      // Leading spaces are preserved
      expect(buildFullCommand("  ls")).toBe("  ls");
    });

    it("handles command with trailing spaces", () => {
      expect(buildFullCommand("ls  ")).toBe("ls  ");
    });

    it("handles claudes (not claude)", () => {
      expect(buildFullCommand("claudes")).toBe("claudes");
    });

    it("handles opencodes (not opencode)", () => {
      expect(buildFullCommand("opencodes")).toBe("opencodes");
    });

    it("handles claude as substring in path", () => {
      expect(buildFullCommand("/usr/bin/claude-wrapper")).toBe(
        "/usr/bin/claude-wrapper"
      );
    });
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
    const timeout = scheduleCommand("ls", "session-1", mockPty, mockWs);

    expect(timeout).toBeDefined();
    expect(typeof timeout[Symbol.toPrimitive]).toBe("function");
  });

  it("writes command to PTY after 1 second delay", () => {
    scheduleCommand("ls", "session-1", mockPty, mockWs);

    expect(mockPty.write).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1000);

    expect(mockPty.write).toHaveBeenCalledWith("ls\r");
  });

  it("transforms command before writing", () => {
    scheduleCommand("gemini", "session-1", mockPty, mockWs);

    vi.advanceTimersByTime(1000);

    expect(mockPty.write).toHaveBeenCalledWith(
      "/home/vscode/.local/share/pnpm/gemini\r"
    );
  });

  it("logs command execution", () => {
    scheduleCommand("ls", "session-1", mockPty, mockWs);

    vi.advanceTimersByTime(1000);

    expect(consoleLogSpy).toHaveBeenCalledWith(
      "[terminal] Session session-1: Running command: ls"
    );
  });

  it("skips execution if session no longer exists", () => {
    mockHasSession.mockReturnValue(false);

    scheduleCommand("ls", "session-1", mockPty, mockWs);

    vi.advanceTimersByTime(1000);

    expect(mockPty.write).not.toHaveBeenCalled();
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "[terminal] Session session-1: session no longer exists, skipping command"
    );
  });

  it("skips execution if WebSocket is not open", () => {
    const closingWs = { readyState: WebSocket.CLOSING } as unknown as WebSocket;

    scheduleCommand("ls", "session-1", mockPty, closingWs);

    vi.advanceTimersByTime(1000);

    expect(mockPty.write).not.toHaveBeenCalled();
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "[terminal] Session session-1: WebSocket not open (state=2), skipping command"
    );
  });

  it("skips execution if WebSocket is closed", () => {
    const closedWs = { readyState: WebSocket.CLOSED } as unknown as WebSocket;

    scheduleCommand("ls", "session-1", mockPty, closedWs);

    vi.advanceTimersByTime(1000);

    expect(mockPty.write).not.toHaveBeenCalled();
  });

  it("prevents duplicate execution on multiple timer fires", () => {
    scheduleCommand("ls", "session-1", mockPty, mockWs);

    vi.advanceTimersByTime(1000);
    expect(mockPty.write).toHaveBeenCalledTimes(1);

    // Simulate edge case where callback fires again (shouldn't happen normally)
    // The commandSent guard should prevent duplicate execution
    vi.advanceTimersByTime(1000);
    expect(mockPty.write).toHaveBeenCalledTimes(1);
  });

  it("can be cleared before execution", () => {
    const timeout = scheduleCommand("ls", "session-1", mockPty, mockWs);

    clearTimeout(timeout);

    vi.advanceTimersByTime(1000);

    expect(mockPty.write).not.toHaveBeenCalled();
  });

  it("handles complex commands with arguments", () => {
    scheduleCommand("claude --model opus", "session-1", mockPty, mockWs);

    vi.advanceTimersByTime(1000);

    expect(mockPty.write).toHaveBeenCalledTimes(1);
    const writtenCommand = (mockPty.write as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as string;
    expect(writtenCommand).toContain("--model opus");
    expect(writtenCommand.endsWith("\r")).toBe(true);
  });

  it("handles empty command", () => {
    scheduleCommand("", "session-1", mockPty, mockWs);

    vi.advanceTimersByTime(1000);

    expect(mockPty.write).toHaveBeenCalledWith("\r");
  });

  describe("WebSocket state checks", () => {
    it("skips when WebSocket is CONNECTING", () => {
      const connectingWs = { readyState: WebSocket.CONNECTING } as unknown as WebSocket;

      scheduleCommand("ls", "session-1", mockPty, connectingWs);
      vi.advanceTimersByTime(1000);

      expect(mockPty.write).not.toHaveBeenCalled();
    });

    it("executes when WebSocket is OPEN", () => {
      // mockWs is already OPEN by default from beforeEach
      scheduleCommand("ls", "session-1", mockPty, mockWs);
      vi.advanceTimersByTime(1000);

      expect(mockPty.write).toHaveBeenCalled();
    });

    it("skips when WebSocket is CLOSING", () => {
      const closingWs = { readyState: WebSocket.CLOSING } as unknown as WebSocket;

      scheduleCommand("ls", "session-1", mockPty, closingWs);
      vi.advanceTimersByTime(1000);

      expect(mockPty.write).not.toHaveBeenCalled();
    });

    it("skips when WebSocket is CLOSED", () => {
      const closedWs = { readyState: WebSocket.CLOSED } as unknown as WebSocket;

      scheduleCommand("ls", "session-1", mockPty, closedWs);
      vi.advanceTimersByTime(1000);

      expect(mockPty.write).not.toHaveBeenCalled();
    });
  });

  describe("session validation", () => {
    it("checks session existence before execution", () => {
      scheduleCommand("ls", "session-1", mockPty, mockWs);

      expect(mockHasSession).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1000);

      expect(mockHasSession).toHaveBeenCalledWith("session-1");
    });

    it("uses correct session ID for validation", () => {
      scheduleCommand("ls", "my-unique-session-id", mockPty, mockWs);

      vi.advanceTimersByTime(1000);

      expect(mockHasSession).toHaveBeenCalledWith("my-unique-session-id");
    });
  });
});
