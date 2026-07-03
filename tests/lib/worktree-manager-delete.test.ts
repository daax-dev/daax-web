/**
 * Tests for deleteWorktree() projectPath confinement (issue #189, Copilot
 * review follow-up).
 *
 * deleteWorktree() already confined `worktreePath` to the workspace root
 * before running git with it. `projectPath` is used as the git command's
 * `cwd` but was NOT confined the same way — if a future caller forgot to
 * pre-validate it, an arbitrary host path could be used as `cwd` for a git
 * invocation. These tests assert the confinement now runs BEFORE any git
 * command executes with that cwd (git exec is mocked and asserted not
 * called for the malicious case), and that a legitimate in-root projectPath
 * still proceeds unaffected.
 */
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  afterAll,
  type Mock,
} from "vitest";
import { mkdtempSync, mkdirSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

// Mock child_process so no real git command ever runs, and so we can assert
// whether the "worktree remove" invocation happened at all. Keep everything
// else from the real module (partial mock) so unrelated consumers of
// child_process in the module graph keep working.
//
// NOTE: the mock must replace `execFile` on BOTH the named export and the
// synthesized `default` export. lib/worktree-manager.ts is reached from this
// test through a CJS-interop path that reads `child_process_1.default.execFile`
// rather than the top-level named export; patching only the named export
// leaves that path pointing at the real (unmocked) execFile, which spawns a
// real `git` process against a non-repo temp dir and fails.
vi.mock("child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("child_process")>();
  const mockExecFile = vi.fn(
    (
      _file: string,
      _args: string[],
      _options: unknown,
      callback: (error: Error | null, stdout: string, stderr: string) => void,
    ) => {
      callback(null, "", "");
    },
  );
  return {
    ...actual,
    execFile: mockExecFile,
    default: {
      ...(actual as { default?: object }).default,
      execFile: mockExecFile,
    },
  };
});

// Control the workspace root independent of the operator's real settings.
vi.mock("@/lib/settings", () => ({
  getSettings: vi.fn(),
}));

import { execFile } from "child_process";
import { getSettings } from "@/lib/settings";
import { deleteWorktree } from "@/lib/worktree-manager";

const mockExecFile = execFile as unknown as Mock;
const mockGetSettings = getSettings as unknown as Mock;

// Real temp directories so realpath-based confinement resolves cleanly.
const workspaceRoot = mkdtempSync(join(tmpdir(), "wt-delete-root-"));
const legitProject = join(workspaceRoot, "project");
const legitWorktree = join(legitProject, ".worktrees", "feature-x");
mkdirSync(legitWorktree, { recursive: true });

// A project path OUTSIDE the workspace root entirely (simulates a caller
// that forgot to pre-validate projectPath).
const evilProjectRoot = mkdtempSync(join(tmpdir(), "wt-delete-evil-"));
const evilProject = join(evilProjectRoot, "not-in-workspace");
mkdirSync(evilProject, { recursive: true });

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

afterEach(() => {
  vi.unstubAllEnvs();
  mockExecFile.mockClear();
  consoleErrorSpy.mockRestore();
});

afterAll(() => {
  rmSync(workspaceRoot, { recursive: true, force: true });
  rmSync(evilProjectRoot, { recursive: true, force: true });
});

beforeEach(() => {
  // Host-mode namespace: no container translation of temp paths.
  vi.stubEnv("HOST_WORKSPACE_PATH", "");
  mockGetSettings.mockReturnValue({ basePath: workspaceRoot });
  // Silence expected console.error noise from the rejected-path case.
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("deleteWorktree projectPath confinement (#189)", () => {
  it("rejects a projectPath outside the workspace root WITHOUT running git", async () => {
    const result = await deleteWorktree(evilProject, legitWorktree);

    expect(result).toBe(false);
    expect(mockExecFile).not.toHaveBeenCalled();
  });

  it("proceeds for a legitimate in-root projectPath (happy path unaffected)", async () => {
    const result = await deleteWorktree(legitProject, legitWorktree);

    expect(result).toBe(true);
    expect(mockExecFile).toHaveBeenCalledTimes(1);
    const [cmd, args, options] = mockExecFile.mock.calls[0];
    expect(cmd).toBe("git");
    expect(args).toEqual(["worktree", "remove", legitWorktree]);
    expect(options).toMatchObject({ cwd: legitProject });
  });
});
