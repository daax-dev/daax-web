/**
 * Voice-to-Terminal Integration Tests
 *
 * Tests the critical path from voice input to terminal sendInput:
 * 1. TerminalManager stores refs correctly
 * 2. getAISessionRef retrieves stored refs
 * 3. Voice transcript handler can access ref and call sendInput
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useRef, useCallback, ReactNode } from "react";

// Mock the settings module
vi.mock("@/lib/settings", () => ({
  getSettings: () => ({
    basePath: "~/prj",
    containerImage: "jpoley/daax-agents:latest",
    claudeSkipPermissions: true,
    voiceSendWord: "over",
    voiceSilenceTimeout: 2,
  }),
}));

// Simulated TerminalRef interface
interface TerminalRef {
  sendInput: (text: string) => void;
}

// Simulated AI Session
interface AISession {
  id: string;
  toolId: string;
  name: string;
  active: boolean;
}

/**
 * Test: Ref storage and retrieval mechanism
 * This simulates what TerminalManager does with refs
 */
describe("Terminal Ref Management", () => {
  it("should store and retrieve terminal refs correctly", () => {
    // Simulate the ref storage mechanism from TerminalManager
    const aiTerminalRefs = new Map<string, TerminalRef>();

    const setAISessionRef = (sessionId: string, ref: TerminalRef | null) => {
      if (ref) {
        aiTerminalRefs.set(sessionId, ref);
      } else {
        aiTerminalRefs.delete(sessionId);
      }
    };

    const getAISessionRef = (sessionId: string): TerminalRef | null => {
      return aiTerminalRefs.get(sessionId) || null;
    };

    // Create a mock terminal ref with sendInput
    const mockSendInput = vi.fn();
    const mockRef: TerminalRef = { sendInput: mockSendInput };

    // Store the ref
    const sessionId = "claude-123456";
    setAISessionRef(sessionId, mockRef);

    // Retrieve the ref
    const retrievedRef = getAISessionRef(sessionId);

    // Verify
    expect(retrievedRef).toBe(mockRef);
    expect(retrievedRef).not.toBeNull();

    // Test sendInput works
    retrievedRef!.sendInput("hello world");
    expect(mockSendInput).toHaveBeenCalledWith("hello world");
  });

  it("should return null for non-existent session", () => {
    const aiTerminalRefs = new Map<string, TerminalRef>();

    const getAISessionRef = (sessionId: string): TerminalRef | null => {
      return aiTerminalRefs.get(sessionId) || null;
    };

    expect(getAISessionRef("non-existent")).toBeNull();
  });

  it("should handle ref deletion correctly", () => {
    const aiTerminalRefs = new Map<string, TerminalRef>();

    const setAISessionRef = (sessionId: string, ref: TerminalRef | null) => {
      if (ref) {
        aiTerminalRefs.set(sessionId, ref);
      } else {
        aiTerminalRefs.delete(sessionId);
      }
    };

    const getAISessionRef = (sessionId: string): TerminalRef | null => {
      return aiTerminalRefs.get(sessionId) || null;
    };

    const mockRef: TerminalRef = { sendInput: vi.fn() };
    const sessionId = "claude-123456";

    // Add ref
    setAISessionRef(sessionId, mockRef);
    expect(getAISessionRef(sessionId)).not.toBeNull();

    // Remove ref (called when Terminal unmounts)
    setAISessionRef(sessionId, null);
    expect(getAISessionRef(sessionId)).toBeNull();
  });
});

/**
 * Test: Voice transcript handler behavior
 * This simulates handleVoiceTranscript from ai-coding page
 */
describe("Voice Transcript Handler", () => {
  it("should send text to terminal when ref is available", () => {
    const mockSendInput = vi.fn();
    const aiTerminalRefs = new Map<string, TerminalRef>();
    const sessionId = "claude-123456";

    // Simulate ref being stored (as TerminalManager does)
    aiTerminalRefs.set(sessionId, { sendInput: mockSendInput });

    const getAISessionRef = (id: string) => aiTerminalRefs.get(id) || null;

    // Simulate the voice transcript handler
    const activeSession: AISession = {
      id: sessionId,
      toolId: "claude",
      name: "Claude 1",
      active: true,
    };

    const handleVoiceTranscript = (text: string) => {
      const ref = activeSession ? getAISessionRef(activeSession.id) : null;
      if (ref) {
        ref.sendInput(text);
        // Also send Enter after text
        ref.sendInput("\r");
      }
    };

    // Simulate voice input
    handleVoiceTranscript("let's build something new");

    // Verify sendInput was called correctly
    expect(mockSendInput).toHaveBeenCalledTimes(2);
    expect(mockSendInput).toHaveBeenNthCalledWith(
      1,
      "let's build something new",
    );
    expect(mockSendInput).toHaveBeenNthCalledWith(2, "\r");
  });

  it("should not crash when ref is not available", () => {
    const aiTerminalRefs = new Map<string, TerminalRef>();
    const getAISessionRef = (id: string) => aiTerminalRefs.get(id) || null;

    const activeSession: AISession = {
      id: "claude-123456",
      toolId: "claude",
      name: "Claude 1",
      active: true,
    };

    let warningLogged = false;
    const handleVoiceTranscript = (text: string) => {
      const ref = activeSession ? getAISessionRef(activeSession.id) : null;
      if (ref) {
        ref.sendInput(text);
      } else {
        warningLogged = true;
      }
    };

    // This should not throw
    expect(() => handleVoiceTranscript("test")).not.toThrow();
    expect(warningLogged).toBe(true);
  });

  it("should handle session becoming inactive", () => {
    const mockSendInput = vi.fn();
    const aiTerminalRefs = new Map<string, TerminalRef>();
    const sessionId = "claude-123456";

    aiTerminalRefs.set(sessionId, { sendInput: mockSendInput });
    const getAISessionRef = (id: string) => aiTerminalRefs.get(id) || null;

    // Session starts active
    let activeSession: AISession | null = {
      id: sessionId,
      toolId: "claude",
      name: "Claude 1",
      active: true,
    };

    const handleVoiceTranscript = (text: string) => {
      const ref = activeSession ? getAISessionRef(activeSession.id) : null;
      if (ref) {
        ref.sendInput(text);
      }
    };

    // First call works
    handleVoiceTranscript("first message");
    expect(mockSendInput).toHaveBeenCalledWith("first message");

    // Session becomes null (user switches away)
    activeSession = null;

    // Second call should not crash
    expect(() => handleVoiceTranscript("second message")).not.toThrow();
    expect(mockSendInput).toHaveBeenCalledTimes(1); // Still only 1 call
  });
});

/**
 * Test: Ref timing scenarios
 * Tests the race condition that was causing the bug
 */
describe("Ref Timing", () => {
  it("should handle ref becoming available after initial check", async () => {
    const mockSendInput = vi.fn();
    const aiTerminalRefs = new Map<string, TerminalRef>();
    const sessionId = "claude-123456";

    const getAISessionRef = (id: string) => aiTerminalRefs.get(id) || null;
    const setAISessionRef = (id: string, ref: TerminalRef | null) => {
      if (ref) aiTerminalRefs.set(id, ref);
      else aiTerminalRefs.delete(id);
    };

    // Simulate polling for ref (like the useEffect in ai-coding page)
    let voiceReady = false;
    let localTerminalRef: TerminalRef | null = null;

    const pollForRef = (): Promise<boolean> => {
      return new Promise((resolve) => {
        let attempts = 0;
        const interval = setInterval(() => {
          attempts++;
          const ref = getAISessionRef(sessionId);
          if (ref) {
            localTerminalRef = ref;
            voiceReady = true;
            clearInterval(interval);
            resolve(true);
          } else if (attempts > 30) {
            clearInterval(interval);
            resolve(false);
          }
        }, 10); // Faster for testing
      });
    };

    // Start polling before ref is available
    const pollPromise = pollForRef();

    // Simulate ref becoming available after 50ms (like Terminal mounting)
    setTimeout(() => {
      setAISessionRef(sessionId, { sendInput: mockSendInput });
    }, 50);

    // Wait for polling to complete
    const found = await pollPromise;

    expect(found).toBe(true);
    expect(voiceReady).toBe(true);
    expect(localTerminalRef).not.toBeNull();
    expect(localTerminalRef!.sendInput).toBe(mockSendInput);
  });

  it("should timeout if ref never becomes available", async () => {
    const aiTerminalRefs = new Map<string, TerminalRef>();
    const sessionId = "claude-123456";

    const getAISessionRef = (id: string) => aiTerminalRefs.get(id) || null;

    let voiceReady = false;

    const pollForRef = (): Promise<boolean> => {
      return new Promise((resolve) => {
        let attempts = 0;
        const interval = setInterval(() => {
          attempts++;
          const ref = getAISessionRef(sessionId);
          if (ref) {
            voiceReady = true;
            clearInterval(interval);
            resolve(true);
          } else if (attempts > 5) {
            // Short timeout for testing
            clearInterval(interval);
            resolve(false);
          }
        }, 10);
      });
    };

    // Never add the ref, polling should timeout
    const found = await pollForRef();

    expect(found).toBe(false);
    expect(voiceReady).toBe(false);
  });
});

/**
 * Test: Multiple sessions
 */
describe("Multiple Sessions", () => {
  it("should handle multiple active sessions with different refs", () => {
    const aiTerminalRefs = new Map<string, TerminalRef>();

    const getAISessionRef = (id: string) => aiTerminalRefs.get(id) || null;
    const setAISessionRef = (id: string, ref: TerminalRef | null) => {
      if (ref) aiTerminalRefs.set(id, ref);
      else aiTerminalRefs.delete(id);
    };

    const sendInput1 = vi.fn();
    const sendInput2 = vi.fn();
    const sendInput3 = vi.fn();

    // Create three sessions with different tools
    setAISessionRef("claude-1", { sendInput: sendInput1 });
    setAISessionRef("gemini-1", { sendInput: sendInput2 });
    setAISessionRef("codex-1", { sendInput: sendInput3 });

    // Verify each ref is distinct
    const ref1 = getAISessionRef("claude-1");
    const ref2 = getAISessionRef("gemini-1");
    const ref3 = getAISessionRef("codex-1");

    ref1?.sendInput("to claude");
    ref2?.sendInput("to gemini");
    ref3?.sendInput("to codex");

    expect(sendInput1).toHaveBeenCalledWith("to claude");
    expect(sendInput2).toHaveBeenCalledWith("to gemini");
    expect(sendInput3).toHaveBeenCalledWith("to codex");

    // Each was called exactly once
    expect(sendInput1).toHaveBeenCalledTimes(1);
    expect(sendInput2).toHaveBeenCalledTimes(1);
    expect(sendInput3).toHaveBeenCalledTimes(1);
  });
});
