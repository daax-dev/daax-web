import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getSession,
  setSession,
  deleteSession,
  hasSession,
  getAllSessions,
  getSessionCount,
} from "../../../server/sessions/session-manager";
import type { TerminalSession, IPty } from "../../../server/sessions/types";
import type { WebSocket } from "ws";

/**
 * Creates a mock IPty instance for testing
 */
function createMockPty(overrides: Partial<IPty> = {}): IPty {
  return {
    pid: Math.floor(Math.random() * 10000) + 1000,
    process: "/bin/bash",
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    onData: vi.fn(),
    onExit: vi.fn(),
    ...overrides,
  };
}

/**
 * Creates a mock WebSocket instance for testing
 */
function createMockWebSocket(overrides: Partial<WebSocket> = {}): WebSocket {
  return {
    readyState: 1, // OPEN
    send: vi.fn(),
    close: vi.fn(),
    on: vi.fn(),
    once: vi.fn(),
    off: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    ping: vi.fn(),
    pong: vi.fn(),
    terminate: vi.fn(),
    ...overrides,
  } as unknown as WebSocket;
}

/**
 * Creates a mock TerminalSession for testing
 */
function createMockSession(
  overrides: Partial<TerminalSession> = {},
): TerminalSession {
  return {
    pty: createMockPty(),
    ws: createMockWebSocket(),
    ...overrides,
  };
}

describe("Session Manager", () => {
  // Clear sessions before each test to ensure isolation
  beforeEach(() => {
    const sessions = getAllSessions();
    sessions.clear();
  });

  describe("getSession", () => {
    it("should return undefined for non-existent session", () => {
      const result = getSession("non-existent-id");
      expect(result).toBeUndefined();
    });

    it("should return the session when it exists", () => {
      const session = createMockSession();
      setSession("test-session-1", session);

      const result = getSession("test-session-1");
      expect(result).toBe(session);
    });

    it("should return the correct session among multiple sessions", () => {
      const session1 = createMockSession();
      const session2 = createMockSession();
      const session3 = createMockSession();

      setSession("session-1", session1);
      setSession("session-2", session2);
      setSession("session-3", session3);

      expect(getSession("session-1")).toBe(session1);
      expect(getSession("session-2")).toBe(session2);
      expect(getSession("session-3")).toBe(session3);
    });
  });

  describe("setSession", () => {
    it("should add a new session", () => {
      const session = createMockSession();
      setSession("new-session", session);

      expect(hasSession("new-session")).toBe(true);
      expect(getSession("new-session")).toBe(session);
    });

    it("should overwrite an existing session with the same ID", () => {
      const session1 = createMockSession({ containerId: "container-1" });
      const session2 = createMockSession({ containerId: "container-2" });

      setSession("same-id", session1);
      expect(getSession("same-id")?.containerId).toBe("container-1");

      setSession("same-id", session2);
      expect(getSession("same-id")?.containerId).toBe("container-2");
      expect(getSessionCount()).toBe(1);
    });

    it("should handle sessions with optional properties", () => {
      const sessionWithContainer = createMockSession({
        containerId: "my-container",
      });
      const sessionWithRecording = createMockSession({
        recordingId: "recording-123",
      });
      const sessionWithBoth = createMockSession({
        containerId: "container-xyz",
        recordingId: "recording-xyz",
      });

      setSession("with-container", sessionWithContainer);
      setSession("with-recording", sessionWithRecording);
      setSession("with-both", sessionWithBoth);

      expect(getSession("with-container")?.containerId).toBe("my-container");
      expect(getSession("with-container")?.recordingId).toBeUndefined();

      expect(getSession("with-recording")?.recordingId).toBe("recording-123");
      expect(getSession("with-recording")?.containerId).toBeUndefined();

      expect(getSession("with-both")?.containerId).toBe("container-xyz");
      expect(getSession("with-both")?.recordingId).toBe("recording-xyz");
    });
  });

  describe("deleteSession", () => {
    it("should return false when deleting non-existent session", () => {
      const result = deleteSession("non-existent");
      expect(result).toBe(false);
    });

    it("should return true when deleting existing session", () => {
      const session = createMockSession();
      setSession("to-delete", session);

      const result = deleteSession("to-delete");
      expect(result).toBe(true);
    });

    it("should remove the session from storage", () => {
      const session = createMockSession();
      setSession("to-delete", session);
      expect(hasSession("to-delete")).toBe(true);

      deleteSession("to-delete");
      expect(hasSession("to-delete")).toBe(false);
      expect(getSession("to-delete")).toBeUndefined();
    });

    it("should not affect other sessions when deleting", () => {
      const session1 = createMockSession();
      const session2 = createMockSession();
      const session3 = createMockSession();

      setSession("keep-1", session1);
      setSession("delete-me", session2);
      setSession("keep-2", session3);

      deleteSession("delete-me");

      expect(hasSession("keep-1")).toBe(true);
      expect(hasSession("keep-2")).toBe(true);
      expect(hasSession("delete-me")).toBe(false);
      expect(getSessionCount()).toBe(2);
    });

    it("should return false on second delete of same session", () => {
      const session = createMockSession();
      setSession("delete-twice", session);

      expect(deleteSession("delete-twice")).toBe(true);
      expect(deleteSession("delete-twice")).toBe(false);
    });
  });

  describe("hasSession", () => {
    it("should return false for non-existent session", () => {
      expect(hasSession("non-existent")).toBe(false);
    });

    it("should return true for existing session", () => {
      const session = createMockSession();
      setSession("exists", session);

      expect(hasSession("exists")).toBe(true);
    });

    it("should return false after session is deleted", () => {
      const session = createMockSession();
      setSession("temp", session);
      expect(hasSession("temp")).toBe(true);

      deleteSession("temp");
      expect(hasSession("temp")).toBe(false);
    });
  });

  describe("getAllSessions", () => {
    it("should return empty map when no sessions exist", () => {
      const sessions = getAllSessions();
      expect(sessions.size).toBe(0);
    });

    it("should return map with all sessions", () => {
      const session1 = createMockSession();
      const session2 = createMockSession();

      setSession("s1", session1);
      setSession("s2", session2);

      const sessions = getAllSessions();
      expect(sessions.size).toBe(2);
      expect(sessions.get("s1")).toBe(session1);
      expect(sessions.get("s2")).toBe(session2);
    });

    it("should return the same map reference (for direct manipulation)", () => {
      const sessions1 = getAllSessions();
      const sessions2 = getAllSessions();
      expect(sessions1).toBe(sessions2);
    });

    it("should reflect changes made through setSession and deleteSession", () => {
      const sessions = getAllSessions();
      expect(sessions.size).toBe(0);

      const session = createMockSession();
      setSession("dynamic", session);
      expect(sessions.size).toBe(1);

      deleteSession("dynamic");
      expect(sessions.size).toBe(0);
    });
  });

  describe("getSessionCount", () => {
    it("should return 0 when no sessions exist", () => {
      expect(getSessionCount()).toBe(0);
    });

    it("should return correct count after adding sessions", () => {
      setSession("s1", createMockSession());
      expect(getSessionCount()).toBe(1);

      setSession("s2", createMockSession());
      expect(getSessionCount()).toBe(2);

      setSession("s3", createMockSession());
      expect(getSessionCount()).toBe(3);
    });

    it("should return correct count after deleting sessions", () => {
      setSession("s1", createMockSession());
      setSession("s2", createMockSession());
      setSession("s3", createMockSession());
      expect(getSessionCount()).toBe(3);

      deleteSession("s2");
      expect(getSessionCount()).toBe(2);

      deleteSession("s1");
      expect(getSessionCount()).toBe(1);

      deleteSession("s3");
      expect(getSessionCount()).toBe(0);
    });

    it("should not increase when overwriting existing session", () => {
      setSession("same", createMockSession());
      expect(getSessionCount()).toBe(1);

      setSession("same", createMockSession());
      expect(getSessionCount()).toBe(1);
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty string as session ID", () => {
      const session = createMockSession();
      setSession("", session);

      expect(hasSession("")).toBe(true);
      expect(getSession("")).toBe(session);
      expect(deleteSession("")).toBe(true);
      expect(hasSession("")).toBe(false);
    });

    it("should handle special characters in session ID", () => {
      const specialIds = [
        "session-with-dash",
        "session_with_underscore",
        "session.with.dots",
        "session:with:colons",
        "session/with/slashes",
        "session with spaces",
        "session\twith\ttabs",
        "unicode-\u00e9\u00e8\u00ea",
      ];

      specialIds.forEach((id, index) => {
        const session = createMockSession({
          containerId: `container-${index}`,
        });
        setSession(id, session);
        expect(hasSession(id)).toBe(true);
        expect(getSession(id)?.containerId).toBe(`container-${index}`);
      });

      expect(getSessionCount()).toBe(specialIds.length);
    });

    it("should handle very long session IDs", () => {
      const longId = "a".repeat(10000);
      const session = createMockSession();

      setSession(longId, session);
      expect(hasSession(longId)).toBe(true);
      expect(getSession(longId)).toBe(session);
    });

    it("should handle rapid set/delete operations", () => {
      for (let i = 0; i < 100; i++) {
        setSession(`rapid-${i}`, createMockSession());
      }
      expect(getSessionCount()).toBe(100);

      for (let i = 0; i < 100; i++) {
        deleteSession(`rapid-${i}`);
      }
      expect(getSessionCount()).toBe(0);
    });

    it("should maintain session data integrity", () => {
      const pty = createMockPty({ pid: 12345, process: "/usr/bin/zsh" });
      const ws = createMockWebSocket();
      const session: TerminalSession = {
        pty,
        ws,
        containerId: "my-container-id",
        recordingId: "my-recording-id",
      };

      setSession("integrity-test", session);

      const retrieved = getSession("integrity-test");
      expect(retrieved).toBe(session);
      expect(retrieved?.pty.pid).toBe(12345);
      expect(retrieved?.pty.process).toBe("/usr/bin/zsh");
      expect(retrieved?.containerId).toBe("my-container-id");
      expect(retrieved?.recordingId).toBe("my-recording-id");
    });
  });

  describe("Clearing Sessions", () => {
    it("should be able to clear all sessions via getAllSessions().clear()", () => {
      setSession("s1", createMockSession());
      setSession("s2", createMockSession());
      setSession("s3", createMockSession());
      expect(getSessionCount()).toBe(3);

      getAllSessions().clear();
      expect(getSessionCount()).toBe(0);
      expect(hasSession("s1")).toBe(false);
      expect(hasSession("s2")).toBe(false);
      expect(hasSession("s3")).toBe(false);
    });
  });
});
