/**
 * Path-traversal regression tests for the Terminal Session Recorder (#193).
 *
 * `getRecording` / `deleteRecording` receive a client-supplied `id` over the WS
 * message channel and interpolate it into a filesystem path. Before the fix an
 * `id` such as "../../../../etc/passwd" traversed out of RECORDINGS_DIR and
 * could read/delete arbitrary `.json`/`.cast` files (the terminal server runs
 * as root in container mode). These tests assert the shared `isValidRecordingId`
 * allowlist rejects traversal payloads BEFORE any fs access, while legitimate
 * generated-style ids still read/delete correctly.
 *
 * Mocking mirrors tests/server/recording/recorder.test.ts: fs / fs/promises are
 * fully mocked and RECORDINGS_DIR is a static path, so the suite is
 * deterministic and never touches the real filesystem or machine-specific paths.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

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
  mockAppendFileAsync: vi.fn((_path: string, _data: string) =>
    Promise.resolve(),
  ),
  mockReaddirSync: vi.fn(() => [] as string[]),
  mockReadFileSync: vi.fn((_path: string) => ""),
  mockUnlinkSync: vi.fn(),
  mockExistsSync: vi.fn((_path: string) => false),
}));

vi.mock("fs", () => ({
  mkdirSync: mockMkdirSync,
  writeFileSync: mockWriteFileSync,
  appendFileSync: mockAppendFileSync,
  readdirSync: mockReaddirSync,
  readFileSync: mockReadFileSync,
  unlinkSync: mockUnlinkSync,
  existsSync: mockExistsSync,
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

vi.mock("fs/promises", () => ({
  appendFile: mockAppendFileAsync,
  default: {
    appendFile: mockAppendFileAsync,
  },
}));

// Static, machine-independent recordings dir keeps the suite deterministic.
// Inlined in the vi.mock factory (hoisted) and mirrored here for assertions.
const MOCK_RECORDINGS_DIR = "/mock/recordings";

vi.mock("@/server/config/constants", () => ({
  RECORDINGS_DIR: "/mock/recordings",
  BUFFER_FLUSH_INTERVAL_MS: 100,
  BUFFER_MAX_SIZE: 50,
}));

import {
  isValidRecordingId,
  getRecording,
  deleteRecording,
  startRecording,
  stopRecording,
} from "@/server/recording/recorder";

// Payloads that MUST be rejected: traversal, separators, NUL, "..", whitespace,
// and dotted ids (which would allow "..").
const MALICIOUS_IDS: Array<[string, string]> = [
  ["deep traversal", "../../../../etc/passwd"],
  ["parent ref", ".."],
  ["single dot segment via slash", "../secret"],
  ["forward slash", "a/b"],
  ["backslash", "a\\b"],
  ["null byte", "a\0b"],
  ["dot in name", "foo.json"],
  ["leading dot-dot", "..foo"],
  ["space", "a b"],
  ["tab", "a\tb"],
  ["newline", "a\nb"],
  ["empty string", ""],
];

// Representative id in the exact shape startRecording emits:
// `${sessionType}-${Date.now()}-${sessionId.slice(0,8)}` (uuid hex slice).
const LEGIT_ID = "shell-1736935200000-1a2b3c4d";

describe("recorder path traversal (#193)", () => {
  beforeEach(() => {
    mockMkdirSync.mockReset();
    mockWriteFileSync.mockReset();
    mockAppendFileSync.mockReset();
    mockAppendFileAsync.mockReset().mockReturnValue(Promise.resolve());
    mockReaddirSync.mockReset().mockReturnValue([]);
    mockReadFileSync.mockReset().mockReturnValue("");
    mockUnlinkSync.mockReset();
    mockExistsSync.mockReset().mockReturnValue(false);
  });

  describe("isValidRecordingId", () => {
    it.each(MALICIOUS_IDS)("rejects %s", (_label, id) => {
      expect(isValidRecordingId(id)).toBe(false);
    });

    it("rejects non-string inputs", () => {
      expect(isValidRecordingId(undefined)).toBe(false);
      expect(isValidRecordingId(null)).toBe(false);
      expect(isValidRecordingId(42)).toBe(false);
      expect(isValidRecordingId({})).toBe(false);
    });

    it("accepts legitimate generated-style ids", () => {
      expect(isValidRecordingId(LEGIT_ID)).toBe(true);
      expect(isValidRecordingId("claude-1736935200000-deadbeef")).toBe(true);
      expect(isValidRecordingId("A_b-9")).toBe(true);
    });
  });

  describe("getRecording", () => {
    it.each(MALICIOUS_IDS)(
      "rejects %s with NO filesystem access",
      (_label, id) => {
        const consoleSpy = vi
          .spyOn(console, "error")
          .mockImplementation(() => {});

        const result = getRecording(id);

        expect(result).toBeNull();
        // No existence check, no read: the id never reaches the fs layer.
        expect(mockExistsSync).not.toHaveBeenCalled();
        expect(mockReadFileSync).not.toHaveBeenCalled();

        consoleSpy.mockRestore();
      },
    );

    it("reads a legitimate recording fixture", () => {
      const metadata = {
        id: LEGIT_ID,
        sessionId: "1a2b3c4d",
        sessionType: "shell",
        command: "/bin/bash",
        startTime: 1000,
        endTime: 2000,
        cols: 80,
        rows: 24,
      };
      const castContent =
        '{"version":2,"width":80,"height":24}\n[0.1,"o","hello"]';

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockImplementation((path: string) => {
        const p = String(path);
        if (p.endsWith(".json")) return JSON.stringify(metadata);
        if (p.endsWith(".cast")) return castContent;
        return "";
      });

      const result = getRecording(LEGIT_ID);

      expect(result).not.toBeNull();
      expect(result?.metadata).toEqual(metadata);
      expect(result?.content).toBe(castContent);
      // Only paths inside RECORDINGS_DIR are touched.
      for (const call of mockReadFileSync.mock.calls) {
        expect(String(call[0]).startsWith(`${MOCK_RECORDINGS_DIR}/`)).toBe(
          true,
        );
      }
    });
  });

  describe("deleteRecording", () => {
    it.each(MALICIOUS_IDS)("rejects %s and deletes nothing", (_label, id) => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      // Pretend everything exists to prove rejection happens BEFORE any fs op.
      mockExistsSync.mockReturnValue(true);

      const result = deleteRecording(id);

      expect(result).toBe(false);
      expect(mockExistsSync).not.toHaveBeenCalled();
      expect(mockUnlinkSync).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it("deletes a legitimate recording fixture", () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      mockExistsSync.mockReturnValue(true);

      const result = deleteRecording(LEGIT_ID);

      expect(result).toBe(true);
      expect(mockUnlinkSync).toHaveBeenCalledWith(
        `${MOCK_RECORDINGS_DIR}/${LEGIT_ID}.json`,
      );
      expect(mockUnlinkSync).toHaveBeenCalledWith(
        `${MOCK_RECORDINGS_DIR}/${LEGIT_ID}.cast`,
      );
      // Every unlink target stays inside RECORDINGS_DIR.
      for (const call of mockUnlinkSync.mock.calls) {
        expect(String(call[0]).startsWith(`${MOCK_RECORDINGS_DIR}/`)).toBe(
          true,
        );
      }

      consoleSpy.mockRestore();
    });
  });

  // Write-side traversal: `sessionType` is client-controlled (URL query param)
  // and is interpolated into the recording id, which becomes the `.cast`/`.json`
  // write path. startRecording must slug it so the minted id can never escape
  // RECORDINGS_DIR (the read/delete guards above do NOT cover this write path).
  describe("startRecording sanitizes client sessionType (write-side)", () => {
    // crypto.randomUUID => hex + `-`; slice(0,8) is always allowlist-safe.
    const SESSION_ID = "1a2b3c4d-0000-4000-8000-000000000000";

    // Malicious client-supplied sessionType values that, unsanitized, would
    // traverse out of / escape RECORDINGS_DIR when interpolated into the id.
    const MALICIOUS_SESSION_TYPES: Array<[string, string]> = [
      ["deep traversal", "../../etc/x"],
      ["single slash subdir", "a/b"],
      ["backslash", "a\\b"],
      ["dotted", "..foo"],
      ["null byte", "a\0b"],
      ["whitespace", "a b"],
    ];

    it.each(MALICIOUS_SESSION_TYPES)(
      "yields a valid, confined id for %s",
      async (_label, sessionType) => {
        // Unique sessionId per case so module-level state does not collide.
        const sid = `${SESSION_ID}-${_label.replace(/\s+/g, "")}`;
        const id = startRecording(sid, sessionType, "/bin/bash", 80, 24);

        // Primary invariant: the minted id passes the same allowlist the read
        // path enforces, so it can never traverse.
        expect(id).not.toBeNull();
        expect(isValidRecordingId(id)).toBe(true);

        // Secondary: every file actually written stays directly inside
        // RECORDINGS_DIR (weaker than the id check, but proves no escape).
        for (const call of mockWriteFileSync.mock.calls) {
          const path = String(call[0]);
          expect(path.startsWith(`${MOCK_RECORDINGS_DIR}/`)).toBe(true);
          // Directly in RECORDINGS_DIR: no extra separator after the base.
          expect(path.slice(`${MOCK_RECORDINGS_DIR}/`.length)).not.toContain(
            "/",
          );
        }

        await stopRecording(sid); // release module-level state
      },
    );

    it("preserves the expected id shape for a legit sessionType", async () => {
      const id = startRecording(SESSION_ID, "shell", "/bin/bash", 80, 24);

      expect(id).not.toBeNull();
      expect(isValidRecordingId(id)).toBe(true);
      // `${sessionType}-${Date.now()}-${sessionId.slice(0,8)}`
      expect(id).toMatch(/^shell-\d+-1a2b3c4d$/);

      await stopRecording(SESSION_ID); // release module-level state
    });
  });
});
