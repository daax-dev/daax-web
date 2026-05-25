/**
 * Message Handler Tests
 *
 * Tests for WebSocket message handling in terminal sessions.
 */

import { describe, it, expect, vi, beforeEach, afterEach, Mock } from "vitest";
import {
  handleMessage,
  MessageHandlerContext,
} from "@/server/handlers/message-handler";

// Mock the recording module
vi.mock("@/server/recording/recorder", () => ({
  startRecording: vi.fn(),
  stopRecording: vi.fn(),
  listRecordings: vi.fn(),
  getRecording: vi.fn(),
  deleteRecording: vi.fn(),
  recordInput: vi.fn(),
}));

// Import mocked functions for assertions
import {
  startRecording,
  stopRecording,
  listRecordings,
  getRecording,
  deleteRecording,
  recordInput,
} from "@/server/recording/recorder";

// Type the mocked functions
const mockStartRecording = startRecording as Mock;
const mockStopRecording = stopRecording as Mock;
const mockListRecordings = listRecordings as Mock;
const mockGetRecording = getRecording as Mock;
const mockDeleteRecording = deleteRecording as Mock;
const mockRecordInput = recordInput as Mock;

/**
 * Create a mock PTY process
 */
function createMockPty() {
  return {
    pid: 12345,
    process: "/bin/zsh",
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    onData: vi.fn(),
    onExit: vi.fn(),
  };
}

/**
 * Create a mock WebSocket
 */
function createMockWebSocket() {
  return {
    send: vi.fn(),
    close: vi.fn(),
    readyState: 1, // WebSocket.OPEN
  };
}

/**
 * Create a test message handler context
 */
function createTestContext(
  overrides?: Partial<MessageHandlerContext>,
): MessageHandlerContext {
  let recordingId: string | undefined;

  return {
    sessionId: "test-session-123",
    sessionType: "shell",
    command: "/bin/zsh",
    shell: "/bin/zsh",
    ptyProcess: createMockPty(),
    ws: createMockWebSocket() as unknown as MessageHandlerContext["ws"],
    getRecordingId: () => recordingId,
    setRecordingId: (id: string | undefined) => {
      recordingId = id;
    },
    ...overrides,
  };
}

describe("handleMessage", () => {
  let ctx: MessageHandlerContext;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    ctx = createTestContext();
    vi.clearAllMocks();
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe("input message type", () => {
    it("should write data to PTY process", () => {
      const message = JSON.stringify({ type: "input", data: "ls -la\r" });

      handleMessage(message, ctx);

      expect(ctx.ptyProcess.write).toHaveBeenCalledWith("ls -la\r");
    });

    it("should handle Buffer input", () => {
      const message = Buffer.from(
        JSON.stringify({ type: "input", data: "pwd\r" }),
      );

      handleMessage(message, ctx);

      expect(ctx.ptyProcess.write).toHaveBeenCalledWith("pwd\r");
    });

    it("should record input when recording is active", () => {
      ctx.setRecordingId("recording-123");
      const message = JSON.stringify({ type: "input", data: "echo hello" });

      handleMessage(message, ctx);

      expect(ctx.ptyProcess.write).toHaveBeenCalledWith("echo hello");
      expect(mockRecordInput).toHaveBeenCalledWith(
        "test-session-123",
        "echo hello",
      );
    });

    it("should not record input when recording is not active", () => {
      const message = JSON.stringify({ type: "input", data: "echo hello" });

      handleMessage(message, ctx);

      expect(ctx.ptyProcess.write).toHaveBeenCalledWith("echo hello");
      expect(mockRecordInput).not.toHaveBeenCalled();
    });

    it("should handle empty input data", () => {
      const message = JSON.stringify({ type: "input", data: "" });

      handleMessage(message, ctx);

      expect(ctx.ptyProcess.write).toHaveBeenCalledWith("");
    });

    it("should handle special characters in input", () => {
      const specialData = "\x1b[A\x03"; // Arrow up + Ctrl+C
      const message = JSON.stringify({ type: "input", data: specialData });

      handleMessage(message, ctx);

      expect(ctx.ptyProcess.write).toHaveBeenCalledWith(specialData);
    });
  });

  describe("resize message type", () => {
    it("should resize PTY with valid cols and rows", () => {
      const message = JSON.stringify({ type: "resize", cols: 120, rows: 40 });

      handleMessage(message, ctx);

      expect(ctx.ptyProcess.resize).toHaveBeenCalledWith(120, 40);
    });

    it("should not resize when cols is missing", () => {
      const message = JSON.stringify({ type: "resize", rows: 40 });

      handleMessage(message, ctx);

      expect(ctx.ptyProcess.resize).not.toHaveBeenCalled();
    });

    it("should not resize when rows is missing", () => {
      const message = JSON.stringify({ type: "resize", cols: 120 });

      handleMessage(message, ctx);

      expect(ctx.ptyProcess.resize).not.toHaveBeenCalled();
    });

    it("should not resize when both cols and rows are missing", () => {
      const message = JSON.stringify({ type: "resize" });

      handleMessage(message, ctx);

      expect(ctx.ptyProcess.resize).not.toHaveBeenCalled();
    });

    it("should handle small terminal dimensions", () => {
      const message = JSON.stringify({ type: "resize", cols: 20, rows: 5 });

      handleMessage(message, ctx);

      expect(ctx.ptyProcess.resize).toHaveBeenCalledWith(20, 5);
    });

    it("should handle large terminal dimensions", () => {
      const message = JSON.stringify({ type: "resize", cols: 500, rows: 200 });

      handleMessage(message, ctx);

      expect(ctx.ptyProcess.resize).toHaveBeenCalledWith(500, 200);
    });

    it("should not resize when cols is zero", () => {
      const message = JSON.stringify({ type: "resize", cols: 0, rows: 40 });

      handleMessage(message, ctx);

      expect(ctx.ptyProcess.resize).not.toHaveBeenCalled();
    });

    it("should not resize when rows is zero", () => {
      const message = JSON.stringify({ type: "resize", cols: 120, rows: 0 });

      handleMessage(message, ctx);

      expect(ctx.ptyProcess.resize).not.toHaveBeenCalled();
    });

    it("should not resize when cols is negative", () => {
      const message = JSON.stringify({ type: "resize", cols: -1, rows: 40 });

      handleMessage(message, ctx);

      expect(ctx.ptyProcess.resize).not.toHaveBeenCalled();
    });

    it("should not resize when values are strings", () => {
      const message = JSON.stringify({
        type: "resize",
        cols: "120",
        rows: "40",
      });

      handleMessage(message, ctx);

      expect(ctx.ptyProcess.resize).not.toHaveBeenCalled();
    });

    it("should not resize when values are floats", () => {
      const message = JSON.stringify({
        type: "resize",
        cols: 120.5,
        rows: 40.5,
      });

      handleMessage(message, ctx);

      expect(ctx.ptyProcess.resize).not.toHaveBeenCalled();
    });
  });

  describe("command message type", () => {
    it("should write command with carriage return", () => {
      const message = JSON.stringify({
        type: "command",
        data: "npm run build",
      });

      handleMessage(message, ctx);

      expect(ctx.ptyProcess.write).toHaveBeenCalledWith("npm run build\r");
    });

    it("should not write when data is missing", () => {
      const message = JSON.stringify({ type: "command" });

      handleMessage(message, ctx);

      expect(ctx.ptyProcess.write).not.toHaveBeenCalled();
    });

    it("should not write when data is empty string", () => {
      const message = JSON.stringify({ type: "command", data: "" });

      handleMessage(message, ctx);

      expect(ctx.ptyProcess.write).not.toHaveBeenCalled();
    });

    it("should handle complex command with arguments", () => {
      const message = JSON.stringify({
        type: "command",
        data: "docker run -it --rm -v $(pwd):/app node:18",
      });

      handleMessage(message, ctx);

      expect(ctx.ptyProcess.write).toHaveBeenCalledWith(
        "docker run -it --rm -v $(pwd):/app node:18\r",
      );
    });

    it("should handle claude-code launch command", () => {
      const message = JSON.stringify({ type: "command", data: "claude" });

      handleMessage(message, ctx);

      expect(ctx.ptyProcess.write).toHaveBeenCalledWith("claude\r");
    });
  });

  describe("startRecording message type", () => {
    it("should start recording and send confirmation", () => {
      mockStartRecording.mockReturnValue("recording-456");
      const message = JSON.stringify({
        type: "startRecording",
        cols: 100,
        rows: 30,
        clientSessionId: "client-abc",
      });

      handleMessage(message, ctx);

      expect(mockStartRecording).toHaveBeenCalledWith(
        "test-session-123",
        "shell",
        "/bin/zsh",
        100,
        30,
        "client-abc",
      );
      expect(ctx.getRecordingId()).toBe("recording-456");
      expect(ctx.ws.send).toHaveBeenCalledWith(
        JSON.stringify({
          type: "recordingStarted",
          recordingId: "recording-456",
        }),
      );
    });

    it("should use default cols and rows when not provided", () => {
      mockStartRecording.mockReturnValue("recording-789");
      const message = JSON.stringify({ type: "startRecording" });

      handleMessage(message, ctx);

      expect(mockStartRecording).toHaveBeenCalledWith(
        "test-session-123",
        "shell",
        "/bin/zsh",
        120, // default cols
        30, // default rows
        undefined,
      );
    });

    it("should use command over shell when available", () => {
      mockStartRecording.mockReturnValue("recording-cmd");
      ctx = createTestContext({ command: "claude", shell: "/bin/zsh" });
      const message = JSON.stringify({ type: "startRecording" });

      handleMessage(message, ctx);

      expect(mockStartRecording).toHaveBeenCalledWith(
        "test-session-123",
        "shell",
        "claude",
        120,
        30,
        undefined,
      );
    });

    it("should not start duplicate recording when already recording", () => {
      ctx.setRecordingId("existing-recording");
      const message = JSON.stringify({ type: "startRecording" });

      handleMessage(message, ctx);

      expect(mockStartRecording).not.toHaveBeenCalled();
      expect(ctx.ws.send).not.toHaveBeenCalled();
    });

    it("should not send confirmation when startRecording returns null (duplicate clientSessionId)", () => {
      mockStartRecording.mockReturnValue(null);
      const message = JSON.stringify({
        type: "startRecording",
        clientSessionId: "duplicate-client",
      });

      handleMessage(message, ctx);

      expect(mockStartRecording).toHaveBeenCalled();
      expect(ctx.getRecordingId()).toBeUndefined();
      expect(ctx.ws.send).not.toHaveBeenCalled();
    });

    it("should use shell when command is empty", () => {
      mockStartRecording.mockReturnValue("recording-shell");
      ctx = createTestContext({ command: "", shell: "/bin/bash" });
      const message = JSON.stringify({ type: "startRecording" });

      handleMessage(message, ctx);

      expect(mockStartRecording).toHaveBeenCalledWith(
        "test-session-123",
        "shell",
        "/bin/bash",
        120,
        30,
        undefined,
      );
    });
  });

  describe("stopRecording message type", () => {
    it("should stop recording and send confirmation with metadata", async () => {
      ctx.setRecordingId("recording-to-stop");
      const mockMetadata = {
        id: "recording-to-stop",
        sessionId: "test-session-123",
        startTime: 1000,
        endTime: 2000,
      };
      mockStopRecording.mockResolvedValue(mockMetadata);

      const message = JSON.stringify({ type: "stopRecording" });

      handleMessage(message, ctx);
      await new Promise<void>((r) => queueMicrotask(r));

      expect(mockStopRecording).toHaveBeenCalledWith("test-session-123");
      expect(ctx.getRecordingId()).toBeUndefined();
      expect(ctx.ws.send).toHaveBeenCalledWith(
        JSON.stringify({ type: "recordingStopped", metadata: mockMetadata }),
      );
    });

    it("should not stop when no recording is active", () => {
      const message = JSON.stringify({ type: "stopRecording" });

      handleMessage(message, ctx);

      expect(mockStopRecording).not.toHaveBeenCalled();
      expect(ctx.ws.send).not.toHaveBeenCalled();
    });

    it("should clear recording ID after stopping", async () => {
      ctx.setRecordingId("recording-active");
      mockStopRecording.mockResolvedValue({ id: "recording-active" });

      const message = JSON.stringify({ type: "stopRecording" });

      handleMessage(message, ctx);
      await new Promise<void>((r) => queueMicrotask(r));

      expect(ctx.getRecordingId()).toBeUndefined();
    });
  });

  describe("listRecordings message type", () => {
    it("should send list of recordings", () => {
      const mockRecordingsList = [
        { id: "rec-1", sessionType: "shell", startTime: 1000 },
        { id: "rec-2", sessionType: "claude", startTime: 2000 },
      ];
      mockListRecordings.mockReturnValue(mockRecordingsList);

      const message = JSON.stringify({ type: "listRecordings" });

      handleMessage(message, ctx);

      expect(mockListRecordings).toHaveBeenCalled();
      expect(ctx.ws.send).toHaveBeenCalledWith(
        JSON.stringify({
          type: "recordingsList",
          recordings: mockRecordingsList,
        }),
      );
    });

    it("should send empty list when no recordings exist", () => {
      mockListRecordings.mockReturnValue([]);

      const message = JSON.stringify({ type: "listRecordings" });

      handleMessage(message, ctx);

      expect(ctx.ws.send).toHaveBeenCalledWith(
        JSON.stringify({ type: "recordingsList", recordings: [] }),
      );
    });
  });

  describe("getRecording message type", () => {
    it("should send recording data for valid id", () => {
      const mockRecordingData = {
        metadata: { id: "rec-1", sessionType: "shell" },
        content: '[header]\n[0.1,"o","test"]',
      };
      mockGetRecording.mockReturnValue(mockRecordingData);

      const message = JSON.stringify({ type: "getRecording", id: "rec-1" });

      handleMessage(message, ctx);

      expect(mockGetRecording).toHaveBeenCalledWith("rec-1");
      expect(ctx.ws.send).toHaveBeenCalledWith(
        JSON.stringify({ type: "recordingData", recording: mockRecordingData }),
      );
    });

    it("should send null recording when id not found", () => {
      mockGetRecording.mockReturnValue(null);

      const message = JSON.stringify({
        type: "getRecording",
        id: "nonexistent",
      });

      handleMessage(message, ctx);

      expect(mockGetRecording).toHaveBeenCalledWith("nonexistent");
      expect(ctx.ws.send).toHaveBeenCalledWith(
        JSON.stringify({ type: "recordingData", recording: null }),
      );
    });

    it("should not fetch when id is missing", () => {
      const message = JSON.stringify({ type: "getRecording" });

      handleMessage(message, ctx);

      expect(mockGetRecording).not.toHaveBeenCalled();
      expect(ctx.ws.send).not.toHaveBeenCalled();
    });
  });

  describe("deleteRecording message type", () => {
    it("should delete recording and send success confirmation", () => {
      mockDeleteRecording.mockReturnValue(true);

      const message = JSON.stringify({
        type: "deleteRecording",
        id: "rec-to-delete",
      });

      handleMessage(message, ctx);

      expect(mockDeleteRecording).toHaveBeenCalledWith("rec-to-delete");
      expect(ctx.ws.send).toHaveBeenCalledWith(
        JSON.stringify({
          type: "recordingDeleted",
          id: "rec-to-delete",
          success: true,
        }),
      );
    });

    it("should send failure confirmation when delete fails", () => {
      mockDeleteRecording.mockReturnValue(false);

      const message = JSON.stringify({
        type: "deleteRecording",
        id: "rec-fail",
      });

      handleMessage(message, ctx);

      expect(mockDeleteRecording).toHaveBeenCalledWith("rec-fail");
      expect(ctx.ws.send).toHaveBeenCalledWith(
        JSON.stringify({
          type: "recordingDeleted",
          id: "rec-fail",
          success: false,
        }),
      );
    });

    it("should not delete when id is missing", () => {
      const message = JSON.stringify({ type: "deleteRecording" });

      handleMessage(message, ctx);

      expect(mockDeleteRecording).not.toHaveBeenCalled();
      expect(ctx.ws.send).not.toHaveBeenCalled();
    });
  });

  describe("unknown message type", () => {
    it("should log unknown message type", () => {
      const message = JSON.stringify({ type: "unknownType", data: "test" });

      handleMessage(message, ctx);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        "Unknown message type: unknownType",
      );
    });

    it("should not throw for unknown types", () => {
      const message = JSON.stringify({ type: "someWeirdType" });

      expect(() => handleMessage(message, ctx)).not.toThrow();
    });
  });

  describe("error handling", () => {
    it("should handle invalid JSON gracefully", () => {
      const invalidJson = "{ invalid json }";

      expect(() => handleMessage(invalidJson, ctx)).not.toThrow();
      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(consoleErrorSpy.mock.calls[0][0]).toContain(
        "[Terminal Server] Failed to parse WebSocket message:",
      );
    });

    it("should handle empty message", () => {
      expect(() => handleMessage("", ctx)).not.toThrow();
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it("should handle message without type", () => {
      const message = JSON.stringify({ data: "some data" });

      expect(() => handleMessage(message, ctx)).not.toThrow();
      expect(consoleLogSpy).toHaveBeenCalledWith(
        "Unknown message type: undefined",
      );
    });

    it("should handle null message body", () => {
      const message = JSON.stringify(null);

      expect(() => handleMessage(message, ctx)).not.toThrow();
    });

    it("should handle array message body", () => {
      const message = JSON.stringify(["not", "an", "object"]);

      expect(() => handleMessage(message, ctx)).not.toThrow();
    });

    it("should handle corrupted Buffer", () => {
      const corruptedBuffer = Buffer.from([0x80, 0x81, 0x82]); // Invalid UTF-8

      // Should not throw, but may log error
      expect(() => handleMessage(corruptedBuffer, ctx)).not.toThrow();
    });
  });

  describe("Buffer message handling", () => {
    it("should properly convert Buffer to string for all message types", () => {
      const testCases = [
        { type: "input", data: "test input" },
        { type: "resize", cols: 80, rows: 24 },
        { type: "command", data: "npm test" },
        { type: "listRecordings" },
      ];

      mockListRecordings.mockReturnValue([]);

      for (const testCase of testCases) {
        vi.clearAllMocks();
        const buffer = Buffer.from(JSON.stringify(testCase));

        expect(() => handleMessage(buffer, ctx)).not.toThrow();
      }
    });
  });

  describe("context isolation", () => {
    it("should use correct sessionId from context", () => {
      const customCtx = createTestContext({ sessionId: "custom-session-id" });
      customCtx.setRecordingId("active-rec");
      const message = JSON.stringify({ type: "input", data: "test" });

      handleMessage(message, customCtx);

      expect(mockRecordInput).toHaveBeenCalledWith("custom-session-id", "test");
    });

    it("should use correct sessionType from context", () => {
      mockStartRecording.mockReturnValue("new-rec");
      const customCtx = createTestContext({ sessionType: "claude-code" });
      const message = JSON.stringify({ type: "startRecording" });

      handleMessage(message, customCtx);

      expect(mockStartRecording).toHaveBeenCalledWith(
        expect.any(String),
        "claude-code",
        expect.any(String),
        expect.any(Number),
        expect.any(Number),
        undefined,
      );
    });

    it("should not affect other contexts", () => {
      const ctx1 = createTestContext({ sessionId: "session-1" });
      const ctx2 = createTestContext({ sessionId: "session-2" });

      ctx1.setRecordingId("rec-1");

      expect(ctx1.getRecordingId()).toBe("rec-1");
      expect(ctx2.getRecordingId()).toBeUndefined();
    });
  });
});
