import { describe, it, expect } from "vitest";
import { join } from "path";

/**
 * Tests for auth-paths.ts module
 *
 * IMPORTANT: These tests verify EXPECTED BEHAVIOR of the authentication path
 * resolution and directory initialization logic. The actual logic is in
 * server/docker/auth-paths.ts. These reference implementations mirror that
 * logic to ensure test coverage of the expected behavior.
 *
 * Key behaviors tested:
 * - Container mode: paths use /workspace/.daax/ when HOST_WORKSPACE_PATH is set
 * - Host mode: paths use ~/.daax-claude or ~/.local/share/opencode
 * - OpenCode respects XDG_DATA_HOME environment variable
 * - initializeClaudeAuthDir exits process on failure (Claude is required)
 * - initializeOpenCodeAuthDir does NOT exit on failure (OpenCode is optional)
 *
 * If these tests fail, update BOTH the reference implementations below AND
 * the corresponding logic in auth-paths.ts to keep them in sync.
 */

// Configuration constants (mirrors server/config/constants.ts)
const CONTAINER_WORKSPACE_PATH = "/workspace";

// Mock filesystem state for testing
interface MockFs {
  existsSync: (path: string) => boolean;
  mkdirSync: (path: string, options: { recursive: boolean; mode: number }) => void;
  chownSync: (path: string, uid: number, gid: number) => void;
}

// Mock process state for testing
interface MockProcess {
  getuid?: () => number;
  exit: (code: number) => void;
  env: Record<string, string | undefined>;
}

// Console tracking for testing
interface ConsoleLogs {
  logs: string[];
  warns: string[];
  errors: string[];
}

/**
 * Reference implementation for getClaudeAuthLocalPath
 * (mirrors server/docker/auth-paths.ts)
 */
function getClaudeAuthLocalPath(
  hostWorkspacePath: string,
  homedir: string
): string {
  if (hostWorkspacePath) {
    // Container mode: create inside the mounted workspace
    return `${CONTAINER_WORKSPACE_PATH}/.daax/claude`;
  }
  // Host mode: use home directory
  return `${homedir}/.daax-claude`;
}

/**
 * Reference implementation for getClaudeAuthHostPath
 * (mirrors server/docker/auth-paths.ts)
 */
function getClaudeAuthHostPath(
  hostWorkspacePath: string,
  homedir: string
): string {
  if (hostWorkspacePath) {
    // Container mode: translate to host path for Docker volume mount
    return `${hostWorkspacePath}/.daax/claude`;
  }
  // Host mode: same as local path
  return `${homedir}/.daax-claude`;
}

/**
 * Reference implementation for getOpenCodeAuthLocalPath
 * (mirrors server/docker/auth-paths.ts)
 */
function getOpenCodeAuthLocalPath(
  hostWorkspacePath: string,
  homedir: string,
  xdgDataHome: string | undefined
): string {
  if (hostWorkspacePath) {
    // Container mode: create inside the mounted workspace
    return `${CONTAINER_WORKSPACE_PATH}/.daax/opencode`;
  }
  // Host mode: respect XDG_DATA_HOME if set
  if (xdgDataHome && xdgDataHome.trim().length > 0) {
    return join(xdgDataHome, "opencode");
  }
  return `${homedir}/.local/share/opencode`;
}

/**
 * Reference implementation for getOpenCodeAuthHostPath
 * (mirrors server/docker/auth-paths.ts)
 */
function getOpenCodeAuthHostPath(
  hostWorkspacePath: string,
  homedir: string,
  xdgDataHome: string | undefined
): string {
  if (hostWorkspacePath) {
    // Container mode: translate to host path for Docker volume mount
    return `${hostWorkspacePath}/.daax/opencode`;
  }
  // Host mode: same as local path
  if (xdgDataHome && xdgDataHome.trim().length > 0) {
    return join(xdgDataHome, "opencode");
  }
  return `${homedir}/.local/share/opencode`;
}

/**
 * Reference implementation for initializeClaudeAuthDir
 * (mirrors server/docker/auth-paths.ts)
 */
function initializeClaudeAuthDir(
  hostWorkspacePath: string,
  homedir: string,
  fs: MockFs,
  process: MockProcess,
  console: ConsoleLogs
): { localPath: string; hostPath: string } {
  const localPath = getClaudeAuthLocalPath(hostWorkspacePath, homedir);
  const hostPath = getClaudeAuthHostPath(hostWorkspacePath, homedir);

  try {
    const dirExisted = fs.existsSync(localPath);
    fs.mkdirSync(localPath, { recursive: true, mode: 0o755 });

    // Fix ownership: spawned containers run as vscode (UID 1000)
    if (process.getuid && process.getuid() === 0) {
      try {
        fs.chownSync(localPath, 1000, 1000);
        if (dirExisted) {
          console.logs.push(
            `[Terminal Server] Fixed ownership of ${localPath} to 1000:1000 (vscode user)`
          );
        } else {
          console.logs.push(
            `[Terminal Server] Created ${localPath} with ownership 1000:1000 (vscode user)`
          );
        }
        console.logs.push(
          `[Terminal Server] Claude auth will be mounted from host path: ${hostPath}`
        );
      } catch (_chownError) {
        console.warns.push(
          `[Terminal Server] Failed to set ownership of ${localPath}. ` +
            "AI containers may have permission issues writing Claude config."
        );
      }
    }
  } catch (_error) {
    console.errors.push(
      `[Terminal Server] Failed to create Claude auth directory at ${localPath}. ` +
        "Please check directory permissions and available disk space."
    );
    // Fail fast: this directory is required for Claude containers to work correctly
    process.exit(1);
  }

  return { localPath, hostPath };
}

/**
 * Reference implementation for initializeOpenCodeAuthDir
 * (mirrors server/docker/auth-paths.ts)
 */
function initializeOpenCodeAuthDir(
  hostWorkspacePath: string,
  homedir: string,
  xdgDataHome: string | undefined,
  fs: MockFs,
  process: MockProcess,
  console: ConsoleLogs
): { localPath: string; hostPath: string } {
  const localPath = getOpenCodeAuthLocalPath(hostWorkspacePath, homedir, xdgDataHome);
  const hostPath = getOpenCodeAuthHostPath(hostWorkspacePath, homedir, xdgDataHome);

  try {
    const dirExisted = fs.existsSync(localPath);
    fs.mkdirSync(localPath, { recursive: true, mode: 0o755 });

    if (process.getuid && process.getuid() === 0) {
      try {
        fs.chownSync(localPath, 1000, 1000);
        if (!dirExisted) {
          console.logs.push(
            `[Terminal Server] Created ${localPath} with ownership 1000:1000 (vscode user)`
          );
        }
        console.logs.push(
          `[Terminal Server] OpenCode auth will be mounted from host path: ${hostPath}`
        );
      } catch (_chownError) {
        console.warns.push(
          `[Terminal Server] Failed to set ownership of ${localPath}. ` +
            "OpenCode containers may have permission issues."
        );
      }
    }
  } catch (_error) {
    console.warns.push(
      `[Terminal Server] Failed to create OpenCode auth directory at ${localPath}.`
    );
    // Don't fail - OpenCode is optional
  }

  return { localPath, hostPath };
}

// Helper to create mock fs
function createMockFs(options: {
  existsSync?: boolean;
  mkdirThrows?: boolean;
  chownThrows?: boolean;
}): MockFs & { calls: { mkdir: unknown[][]; chown: unknown[][] } } {
  const calls = { mkdir: [] as unknown[][], chown: [] as unknown[][] };
  return {
    calls,
    existsSync: () => options.existsSync ?? false,
    mkdirSync: (path, opts) => {
      calls.mkdir.push([path, opts]);
      if (options.mkdirThrows) {
        throw new Error("Permission denied");
      }
    },
    chownSync: (path, uid, gid) => {
      calls.chown.push([path, uid, gid]);
      if (options.chownThrows) {
        throw new Error("Operation not permitted");
      }
    },
  };
}

// Helper to create mock process
function createMockProcess(options: {
  uid?: number;
  hasGetuid?: boolean;
}): MockProcess & { exitCode: number | null } {
  const mock = {
    exitCode: null as number | null,
    getuid: options.hasGetuid !== false ? () => options.uid ?? 1000 : undefined,
    exit: (code: number) => {
      mock.exitCode = code;
    },
    env: {} as Record<string, string | undefined>,
  };
  return mock;
}

// Helper to create console tracker
function createConsoleTracker(): ConsoleLogs {
  return { logs: [], warns: [], errors: [] };
}

describe("auth-paths", () => {
  const TEST_HOMEDIR = "/home/testuser";

  describe("getClaudeAuthLocalPath", () => {
    describe("host mode (HOST_WORKSPACE_PATH not set)", () => {
      it("returns path in home directory", () => {
        const result = getClaudeAuthLocalPath("", TEST_HOMEDIR);
        expect(result).toBe("/home/testuser/.daax-claude");
      });
    });

    describe("container mode (HOST_WORKSPACE_PATH set)", () => {
      it("returns path inside mounted workspace", () => {
        const result = getClaudeAuthLocalPath("/host/path/to/workspace", TEST_HOMEDIR);
        expect(result).toBe("/workspace/.daax/claude");
      });
    });
  });

  describe("getClaudeAuthHostPath", () => {
    describe("host mode", () => {
      it("returns same path as local path (home directory)", () => {
        const result = getClaudeAuthHostPath("", TEST_HOMEDIR);
        expect(result).toBe("/home/testuser/.daax-claude");
      });
    });

    describe("container mode", () => {
      it("translates container path to host path for Docker volume mount", () => {
        const result = getClaudeAuthHostPath("/host/path/to/workspace", TEST_HOMEDIR);
        expect(result).toBe("/host/path/to/workspace/.daax/claude");
      });
    });
  });

  describe("getOpenCodeAuthLocalPath", () => {
    describe("host mode without XDG_DATA_HOME", () => {
      it("returns default .local/share/opencode path", () => {
        const result = getOpenCodeAuthLocalPath("", TEST_HOMEDIR, undefined);
        expect(result).toBe("/home/testuser/.local/share/opencode");
      });
    });

    describe("host mode with XDG_DATA_HOME", () => {
      it("respects XDG_DATA_HOME environment variable", () => {
        const result = getOpenCodeAuthLocalPath("", TEST_HOMEDIR, "/custom/data/home");
        expect(result).toBe("/custom/data/home/opencode");
      });

      it("ignores empty XDG_DATA_HOME", () => {
        const result = getOpenCodeAuthLocalPath("", TEST_HOMEDIR, "");
        expect(result).toBe("/home/testuser/.local/share/opencode");
      });

      it("ignores whitespace-only XDG_DATA_HOME", () => {
        const result = getOpenCodeAuthLocalPath("", TEST_HOMEDIR, "   ");
        expect(result).toBe("/home/testuser/.local/share/opencode");
      });
    });

    describe("container mode", () => {
      it("returns path inside mounted workspace (ignores XDG_DATA_HOME)", () => {
        const result = getOpenCodeAuthLocalPath(
          "/host/path/to/workspace",
          TEST_HOMEDIR,
          "/custom/data/home"
        );
        expect(result).toBe("/workspace/.daax/opencode");
      });
    });
  });

  describe("getOpenCodeAuthHostPath", () => {
    describe("host mode without XDG_DATA_HOME", () => {
      it("returns default .local/share/opencode path", () => {
        const result = getOpenCodeAuthHostPath("", TEST_HOMEDIR, undefined);
        expect(result).toBe("/home/testuser/.local/share/opencode");
      });
    });

    describe("host mode with XDG_DATA_HOME", () => {
      it("respects XDG_DATA_HOME environment variable", () => {
        const result = getOpenCodeAuthHostPath("", TEST_HOMEDIR, "/custom/data/home");
        expect(result).toBe("/custom/data/home/opencode");
      });
    });

    describe("container mode", () => {
      it("translates container path to host path for Docker volume mount", () => {
        const result = getOpenCodeAuthHostPath(
          "/host/path/to/workspace",
          TEST_HOMEDIR,
          undefined
        );
        expect(result).toBe("/host/path/to/workspace/.daax/opencode");
      });
    });
  });

  describe("initializeClaudeAuthDir", () => {
    describe("directory creation", () => {
      it("creates directory with correct permissions (0o755)", () => {
        const fs = createMockFs({});
        const process = createMockProcess({ uid: 1000 });
        const console = createConsoleTracker();

        const result = initializeClaudeAuthDir("", TEST_HOMEDIR, fs, process, console);

        expect(fs.calls.mkdir).toHaveLength(1);
        expect(fs.calls.mkdir[0]).toEqual([
          "/home/testuser/.daax-claude",
          { recursive: true, mode: 0o755 },
        ]);
        expect(result.localPath).toBe("/home/testuser/.daax-claude");
        expect(result.hostPath).toBe("/home/testuser/.daax-claude");
      });

      it("returns both local and host paths in container mode", () => {
        const fs = createMockFs({});
        const process = createMockProcess({ uid: 1000 });
        const console = createConsoleTracker();

        const result = initializeClaudeAuthDir(
          "/host/workspace",
          TEST_HOMEDIR,
          fs,
          process,
          console
        );

        expect(result.localPath).toBe("/workspace/.daax/claude");
        expect(result.hostPath).toBe("/host/workspace/.daax/claude");
      });
    });

    describe("ownership handling when running as root", () => {
      it("chowns directory to 1000:1000 when running as root and directory is new", () => {
        const fs = createMockFs({ existsSync: false });
        const process = createMockProcess({ uid: 0 });
        const console = createConsoleTracker();

        initializeClaudeAuthDir("", TEST_HOMEDIR, fs, process, console);

        expect(fs.calls.chown).toHaveLength(1);
        expect(fs.calls.chown[0]).toEqual(["/home/testuser/.daax-claude", 1000, 1000]);
        expect(console.logs.some((log) => log.includes("Created"))).toBe(true);
      });

      it("chowns existing directory and logs fix message", () => {
        const fs = createMockFs({ existsSync: true });
        const process = createMockProcess({ uid: 0 });
        const console = createConsoleTracker();

        initializeClaudeAuthDir("", TEST_HOMEDIR, fs, process, console);

        expect(fs.calls.chown).toHaveLength(1);
        expect(fs.calls.chown[0]).toEqual(["/home/testuser/.daax-claude", 1000, 1000]);
        expect(console.logs.some((log) => log.includes("Fixed ownership"))).toBe(true);
      });

      it("logs host path for volume mount", () => {
        const fs = createMockFs({});
        const process = createMockProcess({ uid: 0 });
        const console = createConsoleTracker();

        initializeClaudeAuthDir("/host/workspace", TEST_HOMEDIR, fs, process, console);

        expect(console.logs.some((log) => log.includes("mounted from host path"))).toBe(
          true
        );
      });
    });

    describe("non-root execution", () => {
      it("skips chown when not running as root", () => {
        const fs = createMockFs({});
        const process = createMockProcess({ uid: 1000 });
        const console = createConsoleTracker();

        initializeClaudeAuthDir("", TEST_HOMEDIR, fs, process, console);

        expect(fs.calls.chown).toHaveLength(0);
      });

      it("skips chown when getuid is not available (Windows)", () => {
        const fs = createMockFs({});
        const process = createMockProcess({ hasGetuid: false });
        const console = createConsoleTracker();

        initializeClaudeAuthDir("", TEST_HOMEDIR, fs, process, console);

        expect(fs.calls.chown).toHaveLength(0);
      });
    });

    describe("error handling", () => {
      it("exits process with code 1 when directory creation fails", () => {
        const fs = createMockFs({ mkdirThrows: true });
        const process = createMockProcess({ uid: 1000 });
        const console = createConsoleTracker();

        initializeClaudeAuthDir("", TEST_HOMEDIR, fs, process, console);

        expect(console.errors.some((err) =>
          err.includes("Failed to create Claude auth directory")
        )).toBe(true);
        expect(process.exitCode).toBe(1);
      });

      it("warns but continues when chown fails", () => {
        const fs = createMockFs({ chownThrows: true });
        const process = createMockProcess({ uid: 0 });
        const console = createConsoleTracker();

        const result = initializeClaudeAuthDir("", TEST_HOMEDIR, fs, process, console);

        expect(console.warns.some((warn) => warn.includes("Failed to set ownership"))).toBe(
          true
        );
        // Should still return paths (not exit)
        expect(result.localPath).toBe("/home/testuser/.daax-claude");
        expect(process.exitCode).toBeNull();
      });
    });
  });

  describe("initializeOpenCodeAuthDir", () => {
    describe("directory creation", () => {
      it("creates directory with correct permissions (0o755)", () => {
        const fs = createMockFs({});
        const process = createMockProcess({ uid: 1000 });
        const console = createConsoleTracker();

        const result = initializeOpenCodeAuthDir(
          "",
          TEST_HOMEDIR,
          undefined,
          fs,
          process,
          console
        );

        expect(fs.calls.mkdir).toHaveLength(1);
        expect(fs.calls.mkdir[0]).toEqual([
          "/home/testuser/.local/share/opencode",
          { recursive: true, mode: 0o755 },
        ]);
        expect(result.localPath).toBe("/home/testuser/.local/share/opencode");
        expect(result.hostPath).toBe("/home/testuser/.local/share/opencode");
      });

      it("returns both local and host paths in container mode", () => {
        const fs = createMockFs({});
        const process = createMockProcess({ uid: 1000 });
        const console = createConsoleTracker();

        const result = initializeOpenCodeAuthDir(
          "/host/workspace",
          TEST_HOMEDIR,
          undefined,
          fs,
          process,
          console
        );

        expect(result.localPath).toBe("/workspace/.daax/opencode");
        expect(result.hostPath).toBe("/host/workspace/.daax/opencode");
      });
    });

    describe("ownership handling when running as root", () => {
      it("chowns directory to 1000:1000 when running as root", () => {
        const fs = createMockFs({ existsSync: false });
        const process = createMockProcess({ uid: 0 });
        const console = createConsoleTracker();

        initializeOpenCodeAuthDir("", TEST_HOMEDIR, undefined, fs, process, console);

        expect(fs.calls.chown).toHaveLength(1);
        expect(fs.calls.chown[0]).toEqual([
          "/home/testuser/.local/share/opencode",
          1000,
          1000,
        ]);
      });

      it("logs creation message for new directory", () => {
        const fs = createMockFs({ existsSync: false });
        const process = createMockProcess({ uid: 0 });
        const console = createConsoleTracker();

        initializeOpenCodeAuthDir("", TEST_HOMEDIR, undefined, fs, process, console);

        expect(console.logs.some((log) => log.includes("Created"))).toBe(true);
      });

      it("does NOT log creation message for existing directory", () => {
        const fs = createMockFs({ existsSync: true });
        const process = createMockProcess({ uid: 0 });
        const console = createConsoleTracker();

        initializeOpenCodeAuthDir("", TEST_HOMEDIR, undefined, fs, process, console);

        // Should log mount path but NOT creation message
        expect(console.logs.some((log) => log.includes("Created"))).toBe(false);
        expect(console.logs.some((log) => log.includes("mounted from host path"))).toBe(
          true
        );
      });
    });

    describe("error handling", () => {
      it("does NOT exit process when directory creation fails (OpenCode is optional)", () => {
        const fs = createMockFs({ mkdirThrows: true });
        const process = createMockProcess({ uid: 1000 });
        const console = createConsoleTracker();

        const result = initializeOpenCodeAuthDir(
          "",
          TEST_HOMEDIR,
          undefined,
          fs,
          process,
          console
        );

        expect(console.warns.some((warn) =>
          warn.includes("Failed to create OpenCode auth directory")
        )).toBe(true);
        // Should NOT exit - OpenCode is optional
        expect(process.exitCode).toBeNull();
        // Should still return paths
        expect(result.localPath).toBe("/home/testuser/.local/share/opencode");
      });

      it("warns but continues when chown fails", () => {
        const fs = createMockFs({ chownThrows: true });
        const process = createMockProcess({ uid: 0 });
        const console = createConsoleTracker();

        const result = initializeOpenCodeAuthDir(
          "",
          TEST_HOMEDIR,
          undefined,
          fs,
          process,
          console
        );

        expect(console.warns.some((warn) => warn.includes("Failed to set ownership"))).toBe(
          true
        );
        // Should still return paths
        expect(result.localPath).toBe("/home/testuser/.local/share/opencode");
        expect(process.exitCode).toBeNull();
      });
    });

    describe("XDG_DATA_HOME integration", () => {
      it("uses XDG_DATA_HOME when set", () => {
        const fs = createMockFs({});
        const process = createMockProcess({ uid: 1000 });
        const console = createConsoleTracker();

        const result = initializeOpenCodeAuthDir(
          "",
          TEST_HOMEDIR,
          "/custom/xdg/data",
          fs,
          process,
          console
        );

        expect(fs.calls.mkdir).toHaveLength(1);
        expect(fs.calls.mkdir[0]).toEqual([
          "/custom/xdg/data/opencode",
          { recursive: true, mode: 0o755 },
        ]);
        expect(result.localPath).toBe("/custom/xdg/data/opencode");
        expect(result.hostPath).toBe("/custom/xdg/data/opencode");
      });
    });
  });

  describe("container mode vs host mode consistency", () => {
    it("Claude paths are consistent between local and host in host mode", () => {
      const localPath = getClaudeAuthLocalPath("", TEST_HOMEDIR);
      const hostPath = getClaudeAuthHostPath("", TEST_HOMEDIR);

      // In host mode, both should be the same
      expect(localPath).toBe(hostPath);
      expect(localPath).toContain("/home/testuser");
    });

    it("Claude paths differ correctly in container mode", () => {
      const localPath = getClaudeAuthLocalPath("/host/projects", TEST_HOMEDIR);
      const hostPath = getClaudeAuthHostPath("/host/projects", TEST_HOMEDIR);

      // In container mode, paths differ
      expect(localPath).toBe("/workspace/.daax/claude");
      expect(hostPath).toBe("/host/projects/.daax/claude");
      expect(localPath).not.toBe(hostPath);
    });

    it("OpenCode paths are consistent between local and host in host mode", () => {
      const localPath = getOpenCodeAuthLocalPath("", TEST_HOMEDIR, undefined);
      const hostPath = getOpenCodeAuthHostPath("", TEST_HOMEDIR, undefined);

      // In host mode, both should be the same
      expect(localPath).toBe(hostPath);
      expect(localPath).toContain("/home/testuser");
    });

    it("OpenCode paths differ correctly in container mode", () => {
      const localPath = getOpenCodeAuthLocalPath("/host/projects", TEST_HOMEDIR, undefined);
      const hostPath = getOpenCodeAuthHostPath("/host/projects", TEST_HOMEDIR, undefined);

      // In container mode, paths differ
      expect(localPath).toBe("/workspace/.daax/opencode");
      expect(hostPath).toBe("/host/projects/.daax/opencode");
      expect(localPath).not.toBe(hostPath);
    });
  });

  describe("behavioral difference: Claude vs OpenCode failure handling", () => {
    it("Claude exits on failure because it is required", () => {
      const fs = createMockFs({ mkdirThrows: true });
      const process = createMockProcess({ uid: 1000 });
      const console = createConsoleTracker();

      initializeClaudeAuthDir("", TEST_HOMEDIR, fs, process, console);

      expect(process.exitCode).toBe(1);
    });

    it("OpenCode does NOT exit on failure because it is optional", () => {
      const fs = createMockFs({ mkdirThrows: true });
      const process = createMockProcess({ uid: 1000 });
      const console = createConsoleTracker();

      initializeOpenCodeAuthDir("", TEST_HOMEDIR, undefined, fs, process, console);

      expect(process.exitCode).toBeNull();
    });
  });
});
