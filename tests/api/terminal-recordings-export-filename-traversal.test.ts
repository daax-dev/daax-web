/**
 * Write-side path-traversal regression tests for the export FILENAME (#193).
 *
 * The recording-id traversal class was fixed earlier on this branch by
 * validating the client-controlled `[id]` segment. This is the 6th finding in
 * the same class: `generateExportFilename` interpolated the RAW
 * `metadata.sessionType` (a client-controlled value persisted verbatim in the
 * recording `.json`) into the generated filename, which the publish route then
 * writes via `writeFileSync(join(outputDir, htmlFilename), ...)`. A recording
 * created with `sessionType="../../etc/x"` therefore produced a traversing
 * filename and wrote HTML OUTSIDE `outputDir`.
 *
 * `generateExportFilename` now slugs every client-controlled component to
 * `[A-Za-z0-9_-]`, so the filename can never contain `/`, `\`, or `..`. These
 * tests assert that at the unit level (the pure function) and at the route
 * level (the publish handler, with fs/child_process mocked so the suite is
 * deterministic and touches no real filesystem or git).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { join, sep } from "path";
import { generateExportFilename } from "@/plugins/terminal-recorder/lib/html-export";
import type { TerminalRecording } from "@/plugins/terminal-recorder/types";

const START_TIME = Date.UTC(2025, 0, 15, 12, 34, 56); // deterministic, no machine paths
const LEGIT_ID = "shell-1736935200000-1a2b3c4d";

function makeMeta(sessionType: string): TerminalRecording {
  return {
    id: LEGIT_ID,
    sessionId: "sess-1",
    sessionType,
    command: "bash",
    startTime: START_TIME,
    cols: 80,
    rows: 24,
  };
}

describe("generateExportFilename sanitization (#193 write-side traversal)", () => {
  it.each([
    ["../../etc/x", "dot-dot traversal"],
    ["a/b", "bare slash"],
    ["..\\..\\win", "backslash traversal"],
    ["..", "bare dot-dot"],
  ])(
    "slugs malicious sessionType %j (%s) to a separator-free filename",
    (sessionType) => {
      const name = generateExportFilename(makeMeta(sessionType));
      expect(name).not.toContain("/");
      expect(name).not.toContain("\\");
      expect(name).not.toContain("..");
      expect(name.endsWith(".html")).toBe(true);
    },
  );

  it("preserves a legit sessionType as a readable slug", () => {
    const name = generateExportFilename(makeMeta("shell"));
    // YYYY-MM-DD-HHMMSS-<sessionType>-<id suffix>.html. The date comes from
    // toISOString() (UTC, stable); the HHMMSS digits come from local time, so
    // match them by shape to stay deterministic on any runner timezone while
    // still asserting the readable sessionType/id slug survives unmangled.
    expect(name).toMatch(/^2025-01-15-\d{6}-shell-1a2b3c4d\.html$/);
  });

  it("slugs an id suffix that would otherwise carry a separator", () => {
    const meta = makeMeta("shell");
    meta.id = "abc/def12"; // slice(-8) = "bc/def12"
    const name = generateExportFilename(meta);
    expect(name).not.toContain("/");
    expect(name).not.toContain("\\");
  });
});

// --- Route-level assertion: publish cannot write outside outputDir ----------

const {
  mockExistsSync,
  mockReadFileSync,
  mockWriteFileSync,
  mockMkdirSync,
  mockCopyFileSync,
  mockReaddirSync,
  mockExecFileSync,
  mockRequireAuth,
} = vi.hoisted(() => ({
  mockExistsSync: vi.fn(() => true),
  mockReadFileSync: vi.fn((_p: string) => ""),
  mockWriteFileSync: vi.fn(),
  mockMkdirSync: vi.fn(),
  mockCopyFileSync: vi.fn(),
  mockReaddirSync: vi.fn(() => [] as string[]),
  mockExecFileSync: vi.fn((..._args: unknown[]) => ""),
  mockRequireAuth: vi.fn(),
}));

vi.mock("fs", () => ({
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
  writeFileSync: mockWriteFileSync,
  mkdirSync: mockMkdirSync,
  copyFileSync: mockCopyFileSync,
  readdirSync: mockReaddirSync,
  default: {
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync,
    writeFileSync: mockWriteFileSync,
    mkdirSync: mockMkdirSync,
    copyFileSync: mockCopyFileSync,
    readdirSync: mockReaddirSync,
  },
}));

vi.mock("child_process", () => ({
  execFileSync: mockExecFileSync,
  default: { execFileSync: mockExecFileSync },
}));

vi.mock("@/lib/auth", () => ({
  requireAuth: mockRequireAuth,
}));

// NOTE: html-export is intentionally NOT mocked here, so the real
// generateExportFilename runs inside the publish handler.

import { POST as PUBLISH_POST } from "@/app/api/terminal-recordings/[id]/publish/route";

const GIT_ROOT = join(sep, "repo");
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (body?: unknown) =>
  new NextRequest("http://localhost/api/terminal-recordings/x", {
    method: "POST",
    body: body ? JSON.stringify(body) : undefined,
  });

describe("publish route write-side traversal via sessionType (#193)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue({ authenticated: true, user: {} });
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue([]);
    // getGitInfo() resolves the repo root from `git rev-parse --show-toplevel`.
    mockExecFileSync.mockImplementation((..._args: unknown[]) => {
      const args = _args[1] as string[];
      return args?.includes("--show-toplevel") ? `${GIT_ROOT}\n` : "value\n";
    });
    mockReadFileSync.mockImplementation((p: string) =>
      String(p).endsWith(".json")
        ? JSON.stringify(makeMeta("../../etc/x"))
        : "cast-content",
    );
  });
  afterEach(() => vi.restoreAllMocks());

  it("keeps every written path inside outputDir for a malicious sessionType", async () => {
    const res = await PUBLISH_POST(req({}) as NextRequest, ctx(LEGIT_ID));
    expect(res.status).toBe(200);

    const outputDir = join(GIT_ROOT, "docs/recordings");
    const writtenPaths = mockWriteFileSync.mock.calls.map((c) => String(c[0]));
    const copiedTargets = mockCopyFileSync.mock.calls.map((c) => String(c[1]));
    const allTargets = [...writtenPaths, ...copiedTargets];

    expect(allTargets.length).toBeGreaterThan(0);
    for (const target of allTargets) {
      expect(target).not.toContain("..");
      expect(target.startsWith(outputDir + sep)).toBe(true);
    }
  });
});
