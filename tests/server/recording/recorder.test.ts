/**
 * Tests for Terminal Session Recorder
 *
 * Tests the recording module which handles terminal session recording
 * in asciinema v2 format with buffering for performance.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Use vi.hoisted to create mocks that are available during vi.mock hoisting
const {
  mockMkdirSync,
  mockWriteFileSync,
  mockAppendFileSync,
  mockAppendFileAsync,
  mockReaddirSync,
  mockReadFileSync,
  mockUnlinkSync,
  mockExistsSync,
} = vi.hoisted(() => ({
  mockMkdirSync: vi.fn(),
  mockWriteFileSync: vi.fn(),
  mockAppendFileSync: vi.fn(),
  mockAppendFileAsync: vi.fn((_path: string, _data: string) => Promise.resolve()),
  mockReaddirSync: vi.fn(() => [] as string[]),
  mockReadFileSync: vi.fn((_path: string) => ""),
  mockUnlinkSync: vi.fn(),
  mockExistsSync: vi.fn((_path: string) => false),
}));

// Mock the fs module
vi.mock("fs", () => ({
  mkdirSync: mockMkdirSync,
  writeFileSync: mockWriteFileSync,
  appendFileSync: mockAppendFileSync,
  readdirSync: mockReaddirSync,
  readFileSync: mockReadFileSync,
  unlinkSync: mockUnlinkSync,
  existsSync: mockExistsSync,
  // Provide default export to satisfy ESM
  default: {
    mkdirSync: mockMkdirSync,
    writeFileSync: mockWriteFileSync,
    appendFileSync: mockAppendFileSync,
    readdirSync: mockReaddirSync,
    readFileSync: mockReadFileSync,
    unlinkSync: mockUnlinkSync,
    existsSync: mockExistsSync,
  },
}));

// Mock fs/promises for async appendFile used in hot-path flush
vi.mock("fs/promises", () => ({
  appendFile: mockAppendFileAsync,
  default: {
    appendFile: mockAppendFileAsync,
  },
}));

// Mock the constants module
vi.mock("@/server/config/constants", () => ({
  RECORDINGS_DIR: "/mock/recordings",
  BUFFER_FLUSH_INTERVAL_MS: 100,
  BUFFER_MAX_SIZE: 50,
}));

// Import the module under test after mocks are set up
import {
  initializeRecordingsDir,
  startRecording,
  recordOutput,
  recordInput,
  flushRecordingBuffer,
  stopRecording,
  listRecordings,
  getRecording,
  deleteRecording,
} from "@/server/recording/recorder";

// Helper to drain microtask queue so chained .then() callbacks in
// flushRecordingBuffer's write serialization can complete
const flushMicrotasks = () => new Promise<void>((r) => queueMicrotask(r));

describe("Terminal Session Recorder", () => {
  beforeEach(() => {
    // Reset all mocks to their initial state
    mockMkdirSync.mockReset();
    mockWriteFileSync.mockReset();
    mockAppendFileSync.mockReset();
    mockAppendFileAsync.mockReset().mockReturnValue(Promise.resolve());
    mockReaddirSync.mockReset().mockReturnValue([]);
    mockReadFileSync.mockReset().mockReturnValue("");
    mockUnlinkSync.mockReset();
    mockExistsSync.mockReset().mockReturnValue(false);

    // Reset Date.now mock
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-15T10:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("initializeRecordingsDir", () => {
    it("should create the recordings directory with recursive option", async () => {
      initializeRecordingsDir();

      expect(mockMkdirSync).toHaveBeenCalledWith("/mock/recordings", {
        recursive: true,
      });
    });

    it("should handle errors gracefully when directory creation fails", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      mockMkdirSync.mockImplementation(() => {
        throw new Error("Permission denied");
      });

      // Should not throw
      expect(() => initializeRecordingsDir()).not.toThrow();
      expect(consoleSpy).toHaveBeenCalledWith(
        "[Terminal Recorder] Failed to create recordings directory:",
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe("startRecording", () => {
    it("should create a new recording with correct metadata", async () => {
      const result = startRecording(
        "session-123",
        "shell",
        "/bin/bash",
        120,
        30
      );

      // Recording ID format: ${sessionType}-${Date.now()}-${sessionId.slice(0, 8)}
      expect(result).toMatch(/^shell-\d+-session-$/);
      expect(mockWriteFileSync).toHaveBeenCalledTimes(2); // header + metadata

      // Check the header file was written
      const headerCall = mockWriteFileSync.mock.calls[0];
      expect(headerCall[0]).toMatch(/\.cast$/);
      const header = JSON.parse(headerCall[1] as string);
      expect(header).toEqual({
        version: 2,
        width: 120,
        height: 30,
        timestamp: expect.any(Number),
        env: { SHELL: "/bin/zsh", TERM: "xterm-256color" },
        title: expect.stringContaining("shell session"),
      });

      // Check metadata file was written
      const metaCall = mockWriteFileSync.mock.calls[1];
      expect(metaCall[0]).toMatch(/\.json$/);
      const metadata = JSON.parse(metaCall[1] as string);
      expect(metadata).toMatchObject({
        sessionId: "session-123",
        sessionType: "shell",
        command: "/bin/bash",
        cols: 120,
        rows: 30,
      });

      // Cleanup
      await stopRecording("session-123");
    });

    it("should return unique recording IDs for different sessions", async () => {
      const id1 = startRecording("session-a", "shell", "/bin/bash", 80, 24);
      vi.advanceTimersByTime(10); // Ensure different timestamp
      const id2 = startRecording("session-b", "shell", "/bin/bash", 80, 24);

      expect(id1).not.toEqual(id2);

      // Cleanup
      await stopRecording("session-a");
      await stopRecording("session-b");
    });

    it("should include session type in recording ID", async () => {
      const id = startRecording("session-123", "claude", "claude code", 100, 40);
      expect(id).toMatch(/^claude-/);

      // Cleanup
      await stopRecording("session-123");
    });
  });

  describe("startRecording - deduplication", () => {
    it("should prevent duplicate recordings for same clientSessionId", async () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      const id1 = startRecording(
        "session-1",
        "shell",
        "/bin/bash",
        80,
        24,
        "client-session-abc"
      );
      const id2 = startRecording(
        "session-2",
        "shell",
        "/bin/bash",
        80,
        24,
        "client-session-abc"
      );

      expect(id1).not.toBeNull();
      expect(id2).toBeNull(); // Should be deduplicated

      // Verify log message
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Skipping duplicate for clientSessionId")
      );

      consoleSpy.mockRestore();

      // Cleanup
      await stopRecording("session-1");
    });

    it("should allow recordings with different clientSessionIds", async () => {
      const id1 = startRecording(
        "sessionA1",
        "shell",
        "/bin/bash",
        80,
        24,
        "client-session-abc"
      );
      // Advance time so timestamp differs
      vi.advanceTimersByTime(10);
      const id2 = startRecording(
        "sessionB2",
        "shell",
        "/bin/bash",
        80,
        24,
        "client-session-def"
      );

      expect(id1).not.toBeNull();
      expect(id2).not.toBeNull();
      expect(id1).not.toEqual(id2);

      // Cleanup
      await stopRecording("sessionA1");
      await stopRecording("sessionB2");
    });

    it("should allow recordings without clientSessionId", async () => {
      const id1 = startRecording("session-1", "shell", "/bin/bash", 80, 24);
      const id2 = startRecording("session-2", "shell", "/bin/bash", 80, 24);

      expect(id1).not.toBeNull();
      expect(id2).not.toBeNull();

      // Cleanup
      await stopRecording("session-1");
      await stopRecording("session-2");
    });

    it("should allow new recording after stopping previous with same clientSessionId", async () => {
      const id1 = startRecording(
        "session-1",
        "shell",
        "/bin/bash",
        80,
        24,
        "client-session-reuse"
      );
      expect(id1).not.toBeNull();

      await stopRecording("session-1");

      vi.advanceTimersByTime(10);

      const id2 = startRecording(
        "session-2",
        "shell",
        "/bin/bash",
        80,
        24,
        "client-session-reuse"
      );
      expect(id2).not.toBeNull();
      expect(id2).not.toEqual(id1);

      // Cleanup
      await stopRecording("session-2");
    });
  });

  describe("recordOutput", () => {
    it("should buffer output data", async () => {
      startRecording("session-out", "shell", "/bin/bash", 80, 24);

      recordOutput("session-out", "Hello, World!");

      // Should not have flushed yet (buffer not full)
      expect(mockAppendFileAsync).not.toHaveBeenCalled();

      // Cleanup
      await stopRecording("session-out");
    });

    it("should not record output for non-existent session", async () => {
      recordOutput("non-existent", "data");

      expect(mockAppendFileAsync).not.toHaveBeenCalled();
    });

    it("should flush buffer when max size is reached", async () => {
      startRecording("session-flush", "shell", "/bin/bash", 80, 24);

      // Record BUFFER_MAX_SIZE (50) items to trigger flush
      for (let i = 0; i < 50; i++) {
        recordOutput("session-flush", `output-${i}`);
      }

      await flushMicrotasks();
      expect(mockAppendFileAsync).toHaveBeenCalled();

      // Cleanup
      await stopRecording("session-flush");
    });

    it("should flush buffer when time interval passes", async () => {
      startRecording("session-time", "shell", "/bin/bash", 80, 24);

      recordOutput("session-time", "first");
      await flushMicrotasks();
      expect(mockAppendFileAsync).not.toHaveBeenCalled();

      // Advance time past BUFFER_FLUSH_INTERVAL_MS (100ms)
      vi.advanceTimersByTime(150);

      recordOutput("session-time", "second");
      await flushMicrotasks();
      expect(mockAppendFileAsync).toHaveBeenCalled();

      // Cleanup
      await stopRecording("session-time");
    });

    it("should format output in asciinema v2 format", async () => {
      startRecording("session-format", "shell", "/bin/bash", 80, 24);

      recordOutput("session-format", "test data");

      // Advance time to trigger flush
      vi.advanceTimersByTime(150);
      recordOutput("session-format", "more data");
      await flushMicrotasks();

      // Check the format of flushed data (async appendFile)
      const appendCall = mockAppendFileAsync.mock.calls[0];
      const content = appendCall[1] as string;

      // Parse the first entry (skip the newline at the end)
      const entry = JSON.parse(content.split("\n")[0]);
      expect(entry).toHaveLength(3);
      expect(typeof entry[0]).toBe("number"); // timestamp
      expect(entry[1]).toBe("o"); // output type
      expect(entry[2]).toBe("test data"); // data

      // Cleanup
      await stopRecording("session-format");
    });
  });

  describe("recordInput", () => {
    it("should buffer input data", async () => {
      startRecording("session-in", "shell", "/bin/bash", 80, 24);

      recordInput("session-in", "user input");

      expect(mockAppendFileAsync).not.toHaveBeenCalled();

      // Cleanup
      await stopRecording("session-in");
    });

    it("should format input with 'i' type marker", async () => {
      startRecording("session-input-fmt", "shell", "/bin/bash", 80, 24);

      recordInput("session-input-fmt", "keypress");

      // Advance time to trigger flush
      vi.advanceTimersByTime(150);
      recordInput("session-input-fmt", "another");
      await flushMicrotasks();

      const appendCall = mockAppendFileAsync.mock.calls[0];
      const content = appendCall[1] as string;
      const entry = JSON.parse(content.split("\n")[0]);

      expect(entry[1]).toBe("i"); // input type

      // Cleanup
      await stopRecording("session-input-fmt");
    });

    it("should not record input for non-existent session", async () => {
      recordInput("non-existent", "data");

      expect(mockAppendFileAsync).not.toHaveBeenCalled();
    });
  });

  describe("flushRecordingBuffer", () => {
    it("should do nothing if session does not exist", async () => {
      flushRecordingBuffer("non-existent");

      expect(mockAppendFileAsync).not.toHaveBeenCalled();
    });

    it("should do nothing if buffer is empty", async () => {
      startRecording("session-empty", "shell", "/bin/bash", 80, 24);

      flushRecordingBuffer("session-empty");

      expect(mockAppendFileAsync).not.toHaveBeenCalled();

      // Cleanup
      await stopRecording("session-empty");
    });

    it("should write all buffered entries at once", async () => {
      startRecording("session-multi", "shell", "/bin/bash", 80, 24);

      recordOutput("session-multi", "line1");
      recordOutput("session-multi", "line2");
      recordOutput("session-multi", "line3");

      flushRecordingBuffer("session-multi");
      await flushMicrotasks();

      expect(mockAppendFileAsync).toHaveBeenCalledTimes(1);
      const content = mockAppendFileAsync.mock.calls[0][1] as string;

      // Should contain 3 lines (plus trailing newline)
      const lines = content.trim().split("\n");
      expect(lines).toHaveLength(3);

      // Cleanup
      await stopRecording("session-multi");
    });

    it("should clear buffer after flushing", async () => {
      startRecording("session-clear", "shell", "/bin/bash", 80, 24);

      recordOutput("session-clear", "data");
      flushRecordingBuffer("session-clear");

      mockAppendFileAsync.mockClear();

      // Second flush should do nothing (buffer empty)
      flushRecordingBuffer("session-clear");
      expect(mockAppendFileAsync).not.toHaveBeenCalled();

      // Cleanup
      await stopRecording("session-clear");
    });
  });

  describe("stopRecording", () => {
    it("should return null for non-existent session", async () => {
      const result = await stopRecording("non-existent");
      expect(result).toBeNull();
    });

    it("should flush remaining buffer before stopping (sync for data integrity)", async () => {
      startRecording("session-stop", "shell", "/bin/bash", 80, 24);
      recordOutput("session-stop", "final data");

      mockAppendFileSync.mockClear();

      await stopRecording("session-stop");

      // Final flush uses sync appendFileSync for data integrity
      expect(mockAppendFileSync).toHaveBeenCalled();
    });

    it("should return completed metadata with endTime", async () => {
      startRecording("session-meta", "shell", "/bin/bash", 80, 24);

      vi.advanceTimersByTime(5000); // 5 seconds later

      const metadata = await stopRecording("session-meta");

      expect(metadata).not.toBeNull();
      expect(metadata?.endTime).toBeDefined();
      expect(metadata?.sessionId).toBe("session-meta");
    });

    it("should write final metadata file", async () => {
      startRecording("session-final", "shell", "/bin/bash", 80, 24);

      mockWriteFileSync.mockClear();

      await stopRecording("session-final");

      // Should write metadata file
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        expect.stringMatching(/\.json$/),
        expect.any(String)
      );

      const metaContent = mockWriteFileSync.mock.calls[0][1] as string;
      const metadata = JSON.parse(metaContent);
      expect(metadata.endTime).toBeDefined();
    });

    it("should clean up deduplication tracking for clientSessionId", async () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      startRecording(
        "session-cleanup",
        "shell",
        "/bin/bash",
        80,
        24,
        "client-cleanup-test"
      );
      await stopRecording("session-cleanup");

      // Should now be able to start a new recording with same clientSessionId
      vi.advanceTimersByTime(10);
      const newId = startRecording(
        "session-new",
        "shell",
        "/bin/bash",
        80,
        24,
        "client-cleanup-test"
      );

      expect(newId).not.toBeNull();

      consoleSpy.mockRestore();
      await stopRecording("session-new");
    });

    it("should prevent recording after stop", async () => {
      startRecording("session-after-stop", "shell", "/bin/bash", 80, 24);
      await stopRecording("session-after-stop");

      mockAppendFileAsync.mockClear();

      // These should do nothing
      recordOutput("session-after-stop", "late data");
      recordInput("session-after-stop", "late input");

      expect(mockAppendFileAsync).not.toHaveBeenCalled();
    });

    it("should await pending async flush before final sync write", async () => {
      startRecording("session-pending", "shell", "/bin/bash", 80, 24);

      // Record output and trigger an async flush
      recordOutput("session-pending", "async data");
      flushRecordingBuffer("session-pending");

      // stopRecording should await the pending async flush before its sync write
      const metadata = await stopRecording("session-pending");

      // Verify both async and sync writes completed
      await flushMicrotasks();
      expect(mockAppendFileAsync).toHaveBeenCalled();
      expect(metadata).not.toBeNull();
      expect(metadata?.endTime).toBeDefined();
    });
  });

  describe("listRecordings", () => {
    it("should return empty array when no recordings exist", async () => {
      mockReaddirSync.mockReturnValue([]);

      const recordings = listRecordings();
      expect(recordings).toEqual([]);
    });

    it("should filter for only .json metadata files", async () => {
      mockReaddirSync.mockReturnValue([
        "rec1.json",
        "rec1.cast",
        "rec2.json",
        "rec2.cast",
        "random.txt",
      ]);

      mockReadFileSync.mockImplementation((path: string) => {
        const filename = String(path);
        if (filename.includes("rec1")) {
          return JSON.stringify({
            id: "rec1",
            startTime: 1000,
            sessionId: "s1",
          });
        }
        if (filename.includes("rec2")) {
          return JSON.stringify({
            id: "rec2",
            startTime: 2000,
            sessionId: "s2",
          });
        }
        return "";
      });

      const recordings = listRecordings();

      expect(mockReadFileSync).toHaveBeenCalledTimes(2);
      expect(recordings).toHaveLength(2);
    });

    it("should sort recordings by startTime descending (newest first)", async () => {
      mockReaddirSync.mockReturnValue(["old.json", "new.json"]);

      mockReadFileSync.mockImplementation((path: string) => {
        const filename = String(path);
        if (filename.includes("old")) {
          return JSON.stringify({ id: "old", startTime: 1000 });
        }
        if (filename.includes("new")) {
          return JSON.stringify({ id: "new", startTime: 2000 });
        }
        return "";
      });

      const recordings = listRecordings();

      expect(recordings[0].id).toBe("new");
      expect(recordings[1].id).toBe("old");
    });

    it("should handle parse errors gracefully", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      mockReaddirSync.mockReturnValue(["good.json", "bad.json"]);

      mockReadFileSync.mockImplementation((path: string) => {
        const filename = String(path);
        if (filename.includes("good")) {
          return JSON.stringify({ id: "good", startTime: 1000 });
        }
        if (filename.includes("bad")) {
          return "invalid json {{{";
        }
        return "";
      });

      const recordings = listRecordings();

      expect(recordings).toHaveLength(1);
      expect(recordings[0].id).toBe("good");
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Failed to parse recording metadata"),
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });

    it("should handle directory read errors gracefully", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      mockReaddirSync.mockImplementation(() => {
        throw new Error("Directory not found");
      });

      const recordings = listRecordings();

      expect(recordings).toEqual([]);
      expect(consoleSpy).toHaveBeenCalledWith(
        "[Terminal Recorder] Failed to list recordings:",
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe("getRecording", () => {
    it("should return null when recording does not exist", async () => {
      mockExistsSync.mockReturnValue(false);

      const result = getRecording("non-existent");
      expect(result).toBeNull();
    });

    it("should return null when metadata file is missing", async () => {
      mockExistsSync.mockImplementation((path: string) => {
        return String(path).endsWith(".cast");
      });

      const result = getRecording("partial");
      expect(result).toBeNull();
    });

    it("should return null when cast file is missing", async () => {
      mockExistsSync.mockImplementation((path: string) => {
        return String(path).endsWith(".json");
      });

      const result = getRecording("partial");
      expect(result).toBeNull();
    });

    it("should return both metadata and content when recording exists", async () => {
      mockExistsSync.mockReturnValue(true);

      const mockMetadata = {
        id: "test-recording",
        sessionId: "session-1",
        sessionType: "shell",
        command: "/bin/bash",
        startTime: 1000,
        endTime: 2000,
        cols: 80,
        rows: 24,
      };

      const mockContent =
        '{"version":2,"width":80,"height":24}\n[0.1,"o","hello"]';

      mockReadFileSync.mockImplementation((path: string) => {
        const filename = String(path);
        if (filename.endsWith(".json")) {
          return JSON.stringify(mockMetadata);
        }
        if (filename.endsWith(".cast")) {
          return mockContent;
        }
        return "";
      });

      const result = getRecording("test-recording");

      expect(result).not.toBeNull();
      expect(result?.metadata).toEqual(mockMetadata);
      expect(result?.content).toBe(mockContent);
    });

    it("should handle read errors gracefully", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockImplementation(() => {
        throw new Error("Read error");
      });

      const result = getRecording("error-recording");

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Failed to get recording"),
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe("deleteRecording", () => {
    it("should delete both metadata and cast files", async () => {
      mockExistsSync.mockReturnValue(true);

      const result = deleteRecording("to-delete");

      expect(result).toBe(true);
      expect(mockUnlinkSync).toHaveBeenCalledWith(
        expect.stringMatching(/to-delete\.json$/)
      );
      expect(mockUnlinkSync).toHaveBeenCalledWith(
        expect.stringMatching(/to-delete\.cast$/)
      );
    });

    it("should handle missing metadata file gracefully", async () => {
      mockExistsSync.mockImplementation((path: string) => {
        return String(path).endsWith(".cast");
      });

      const result = deleteRecording("partial");

      expect(result).toBe(true);
      expect(mockUnlinkSync).toHaveBeenCalledTimes(1);
    });

    it("should handle missing cast file gracefully", async () => {
      mockExistsSync.mockImplementation((path: string) => {
        return String(path).endsWith(".json");
      });

      const result = deleteRecording("partial");

      expect(result).toBe(true);
      expect(mockUnlinkSync).toHaveBeenCalledTimes(1);
    });

    it("should return false on deletion error", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      mockExistsSync.mockReturnValue(true);
      mockUnlinkSync.mockImplementation(() => {
        throw new Error("Delete failed");
      });

      const result = deleteRecording("error-delete");

      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Failed to delete recording"),
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });

    it("should succeed when both files are missing", async () => {
      mockExistsSync.mockReturnValue(false);

      const result = deleteRecording("non-existent");

      expect(result).toBe(true);
      expect(mockUnlinkSync).not.toHaveBeenCalled();
    });
  });

  describe("recording lifecycle integration", () => {
    it("should handle a complete recording lifecycle", async () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      // Start recording
      const recordingId = startRecording(
        "lifecycle-session",
        "shell",
        "/bin/bash",
        80,
        24,
        "lifecycle-client"
      );
      expect(recordingId).not.toBeNull();

      // Record some output
      recordOutput("lifecycle-session", "$ ls\n");
      vi.advanceTimersByTime(50);
      recordOutput("lifecycle-session", "file1.txt file2.txt\n");

      // Record some input
      recordInput("lifecycle-session", "ls");

      // Advance time to trigger flush
      vi.advanceTimersByTime(100);
      recordOutput("lifecycle-session", "$ ");
      await flushMicrotasks();

      // Verify buffer was flushed (async on hot path)
      expect(mockAppendFileAsync).toHaveBeenCalled();

      // Stop recording
      const metadata = await stopRecording("lifecycle-session");

      expect(metadata).not.toBeNull();
      expect(metadata?.id).toBe(recordingId);
      expect(metadata?.endTime).toBeDefined();

      consoleSpy.mockRestore();
    });

    it("should track elapsed time correctly in entries", async () => {
      startRecording("timing-session", "shell", "/bin/bash", 80, 24);

      // Record all outputs quickly (within flush interval) to keep them in same buffer
      recordOutput("timing-session", "start");
      vi.advanceTimersByTime(10); // 10ms - still within flush interval
      recordOutput("timing-session", "middle");
      vi.advanceTimersByTime(10); // 20ms total - still within flush interval
      recordOutput("timing-session", "end");

      // Manually flush to see the timing
      flushRecordingBuffer("timing-session");
      await flushMicrotasks();

      const appendCall = mockAppendFileAsync.mock.calls[0];
      const lines = (appendCall[1] as string).trim().split("\n");

      // All three entries should be in the same flush
      expect(lines).toHaveLength(3);

      const entry1 = JSON.parse(lines[0]);
      const entry2 = JSON.parse(lines[1]);
      const entry3 = JSON.parse(lines[2]);

      // Timestamps should be in order and reflect elapsed time
      expect(entry1[0]).toBeLessThan(entry2[0]);
      expect(entry2[0]).toBeLessThan(entry3[0]);
      // First entry should be near 0
      expect(entry1[0]).toBeLessThan(0.1);

      await stopRecording("timing-session");
    });
  });

  describe("asciinema v2 format compliance", () => {
    it("should write valid asciinema v2 header", async () => {
      startRecording("format-test", "shell", "/bin/bash", 100, 40);

      const headerCall = mockWriteFileSync.mock.calls[0];
      const headerStr = headerCall[1] as string;

      // Should end with newline
      expect(headerStr.endsWith("\n")).toBe(true);

      const header = JSON.parse(headerStr.trim());
      expect(header.version).toBe(2);
      expect(header.width).toBe(100);
      expect(header.height).toBe(40);
      expect(typeof header.timestamp).toBe("number");
      expect(header.env).toBeDefined();

      await stopRecording("format-test");
    });

    it("should format output entries as [time, 'o', data]", async () => {
      startRecording("output-format", "shell", "/bin/bash", 80, 24);

      recordOutput("output-format", "test output");
      flushRecordingBuffer("output-format");
      await flushMicrotasks();

      const appendCall = mockAppendFileAsync.mock.calls[0];
      const entry = JSON.parse((appendCall[1] as string).trim());

      expect(Array.isArray(entry)).toBe(true);
      expect(entry).toHaveLength(3);
      expect(typeof entry[0]).toBe("number");
      expect(entry[1]).toBe("o");
      expect(entry[2]).toBe("test output");

      await stopRecording("output-format");
    });

    it("should format input entries as [time, 'i', data]", async () => {
      startRecording("input-format", "shell", "/bin/bash", 80, 24);

      recordInput("input-format", "user keystroke");
      flushRecordingBuffer("input-format");
      await flushMicrotasks();

      const appendCall = mockAppendFileAsync.mock.calls[0];
      const entry = JSON.parse((appendCall[1] as string).trim());

      expect(Array.isArray(entry)).toBe(true);
      expect(entry).toHaveLength(3);
      expect(typeof entry[0]).toBe("number");
      expect(entry[1]).toBe("i");
      expect(entry[2]).toBe("user keystroke");

      await stopRecording("input-format");
    });
  });

  describe("edge cases", () => {
    it("should handle empty string output", async () => {
      startRecording("empty-output", "shell", "/bin/bash", 80, 24);

      recordOutput("empty-output", "");
      flushRecordingBuffer("empty-output");
      await flushMicrotasks();

      expect(mockAppendFileAsync).toHaveBeenCalled();

      await stopRecording("empty-output");
    });

    it("should handle special characters in output", async () => {
      startRecording("special-chars", "shell", "/bin/bash", 80, 24);

      recordOutput("special-chars", '\x1b[32mgreen text\x1b[0m\n\t"quotes"');
      flushRecordingBuffer("special-chars");
      await flushMicrotasks();

      const appendCall = mockAppendFileAsync.mock.calls[0];
      const entry = JSON.parse((appendCall[1] as string).trim());

      expect(entry[2]).toBe('\x1b[32mgreen text\x1b[0m\n\t"quotes"');

      await stopRecording("special-chars");
    });

    it("should handle unicode in output", async () => {
      startRecording("unicode", "shell", "/bin/bash", 80, 24);

      recordOutput("unicode", "Hello, World!");
      flushRecordingBuffer("unicode");
      await flushMicrotasks();

      const appendCall = mockAppendFileAsync.mock.calls[0];
      const entry = JSON.parse((appendCall[1] as string).trim());

      expect(entry[2]).toBe("Hello, World!");

      await stopRecording("unicode");
    });

    it("should handle rapid consecutive recordings", async () => {
      const ids: (string | null)[] = [];

      for (let i = 0; i < 5; i++) {
        const id = startRecording(`rapid-${i}`, "shell", "/bin/bash", 80, 24);
        ids.push(id);
        await stopRecording(`rapid-${i}`);
        vi.advanceTimersByTime(1);
      }

      // All should have unique IDs
      const nonNullIds = ids.filter((id) => id !== null);
      const uniqueIds = new Set(nonNullIds);
      expect(uniqueIds.size).toBe(nonNullIds.length);
    });
  });
});
