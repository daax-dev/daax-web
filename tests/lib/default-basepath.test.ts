/**
 * Tests for the host-derived default workspace base path.
 *
 * Covers:
 *  - lib/config.ts resolveDefaultBasePath() env precedence
 *    (DAAX_DEFAULT_BASE_PATH > HOST_WORKSPACE_PATH ~-form > ~/prj).
 *  - lib/settings.ts migration that upgrades a user's exact legacy default
 *    "~/prj" to this host's derived default, while leaving deliberate paths
 *    (including "~/prj/<subpath>") untouched.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const ENV_KEYS = ["DAAX_DEFAULT_BASE_PATH", "HOST_WORKSPACE_PATH"] as const;

function clearEnv() {
  for (const key of ENV_KEYS) delete process.env[key];
}

describe("config.resolveDefaultBasePath", () => {
  beforeEach(() => {
    vi.resetModules();
    clearEnv();
  });
  afterEach(clearEnv);

  it("falls back to ~/prj when no deploy env is set", async () => {
    const { resolveDefaultBasePath } = await import("@/lib/config");
    expect(resolveDefaultBasePath()).toBe("~/prj");
  });

  it("derives ~/<basename> from HOST_WORKSPACE_PATH", async () => {
    process.env.HOST_WORKSPACE_PATH = "/home/jpoley/jarvis";
    const { resolveDefaultBasePath } = await import("@/lib/config");
    expect(resolveDefaultBasePath()).toBe("~/jarvis");
  });

  it("tolerates a trailing slash on HOST_WORKSPACE_PATH", async () => {
    process.env.HOST_WORKSPACE_PATH = "/home/jpoley/jarvis/";
    const { resolveDefaultBasePath } = await import("@/lib/config");
    expect(resolveDefaultBasePath()).toBe("~/jarvis");
  });

  it("prefers an explicit DAAX_DEFAULT_BASE_PATH override verbatim", async () => {
    process.env.DAAX_DEFAULT_BASE_PATH = "~/work/repos";
    process.env.HOST_WORKSPACE_PATH = "/home/jpoley/jarvis";
    const { resolveDefaultBasePath } = await import("@/lib/config");
    expect(resolveDefaultBasePath()).toBe("~/work/repos");
  });
});

describe("settings migration: legacy default basePath", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    clearEnv();
  });
  afterEach(clearEnv);

  async function loadSettings() {
    vi.resetModules();
    return import("@/lib/settings");
  }

  function mockStored(value: unknown) {
    vi.mocked(localStorage.getItem).mockReturnValue(JSON.stringify(value));
  }

  it("upgrades the exact legacy default ~/prj to the host default", async () => {
    const { getSettings, initConfigDefaults } = await loadSettings();
    // Mirror what ConfigProvider does on the client: seed the effective default
    // from the server-derived value delivered via /api/config.
    initConfigDefaults({ basePath: "~/jarvis" });
    mockStored({ basePath: "~/prj" });

    const result = getSettings();

    expect(result.basePath).toBe("~/jarvis");
    expect(localStorage.setItem).toHaveBeenCalled();
  });

  it("leaves ~/prj untouched when the host default is also ~/prj", async () => {
    const { getSettings } = await loadSettings();
    mockStored({
      basePath: "~/prj",
      // Pre-set the fields guarded by unrelated `=== undefined` migrations so
      // this fixture isolates the basePath rule.
      containerImage: "jpoley/daax-agents:latest",
      terminalRecordingEnabled: true,
      autoWorktreeEnabled: true,
      autoWorktreeCleanup: true,
      autoWorktreePushBeforeCleanup: true,
      aiCoding: {
        defaultContainerImage: "jpoley/daax-agents-gsd:latest",
        containerRegistry: "jpoley",
        autoPullLatest: false,
        usePrebuiltImage: true,
      },
    });

    const result = getSettings();

    expect(result.basePath).toBe("~/prj");
    expect(localStorage.setItem).not.toHaveBeenCalled();
  });

  it("never rewrites a deliberate ~/prj/<subpath> even on a jarvis host", async () => {
    const { getSettings, initConfigDefaults } = await loadSettings();
    initConfigDefaults({ basePath: "~/jarvis" });
    mockStored({ basePath: "~/prj/ps" });

    const result = getSettings();

    expect(result.basePath).toBe("~/prj/ps");
  });
});
