/**
 * Tests for lib/settings.ts persisted-settings migration.
 *
 * Focus: legacy top-level "devcontainers"/"testcontainers" plugin IDs are
 * migrated to the new "containers" group on load, for both pluginOrder
 * (position-preserving, de-duplicated) and pluginMaturity (remapped to
 * subFeatureMaturity). Fresh installs and already-migrated settings are
 * left untouched.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// Import the module fresh in each test so the module-scoped config cache
// (configBasedDefaults) cannot leak between cases.
async function loadSettings() {
  vi.resetModules();
  return import("@/lib/settings");
}

function mockStored(value: unknown) {
  vi.mocked(localStorage.getItem).mockReturnValue(JSON.stringify(value));
}

describe("settings migration: legacy container plugin IDs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("migrates pluginOrder legacy IDs to 'containers', preserving position and de-duplicating", async () => {
    const { getSettings } = await loadSettings();
    mockStored({
      pluginOrder: [
        "home",
        "devcontainers",
        "ai-coding",
        "testcontainers",
        "settings",
      ],
    });

    const result = getSettings();

    expect(result.pluginOrder).toEqual([
      "home",
      "containers",
      "ai-coding",
      "settings",
    ]);
    expect(result.pluginOrder).not.toContain("devcontainers");
    expect(result.pluginOrder).not.toContain("testcontainers");

    // Migration must be persisted.
    expect(localStorage.setItem).toHaveBeenCalledTimes(1);
    const saved = JSON.parse(
      vi.mocked(localStorage.setItem).mock.calls[0][1] as string,
    );
    expect(saved.pluginOrder).toEqual([
      "home",
      "containers",
      "ai-coding",
      "settings",
    ]);
  });

  it("remaps legacy pluginMaturity overrides to subFeatureMaturity and drops the old keys", async () => {
    const { getSettings } = await loadSettings();
    mockStored({
      pluginMaturity: {
        devcontainers: "disabled",
        testcontainers: "ga",
        "ai-coding": "ga",
      },
    });

    const result = getSettings();

    expect(result.pluginMaturity).not.toHaveProperty("devcontainers");
    expect(result.pluginMaturity).not.toHaveProperty("testcontainers");
    expect(result.pluginMaturity["ai-coding"]).toBe("ga");
    expect(result.subFeatureMaturity["containers.devcontainers"]).toBe(
      "disabled",
    );
    expect(result.subFeatureMaturity["containers.testcontainers"]).toBe("ga");

    expect(localStorage.setItem).toHaveBeenCalledTimes(1);
  });

  it("does not clobber an existing containers sub-feature maturity override", async () => {
    const { getSettings } = await loadSettings();
    mockStored({
      pluginMaturity: { devcontainers: "disabled" },
      subFeatureMaturity: { "containers.devcontainers": "beta" },
    });

    const result = getSettings();

    // Explicit sub-feature override wins; legacy plugin key is still removed.
    expect(result.subFeatureMaturity["containers.devcontainers"]).toBe("beta");
    expect(result.pluginMaturity).not.toHaveProperty("devcontainers");
  });

  it("leaves a fresh install (no stored settings) untouched", async () => {
    const { getSettings } = await loadSettings();
    vi.mocked(localStorage.getItem).mockReturnValue(null);

    const result = getSettings();

    expect(result.pluginOrder).toEqual([]);
    expect(localStorage.setItem).not.toHaveBeenCalled();
  });

  it("is idempotent: already-migrated settings do not trigger a re-save", async () => {
    const { getSettings } = await loadSettings();
    // Include the fields guarded by unrelated `=== undefined` migrations so
    // this fixture isolates the container-ID migration as the only trigger.
    mockStored({
      basePath: "~/prj",
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
      pluginOrder: ["home", "containers", "ai-coding"],
      pluginMaturity: { containers: "beta" },
    });

    const result = getSettings();

    expect(result.pluginOrder).toEqual(["home", "containers", "ai-coding"]);
    expect(localStorage.setItem).not.toHaveBeenCalled();
  });
});

describe("settings migration: legacy ~/ps basePath", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Fixture with every `=== undefined`-guarded field pre-set, so basePath is
  // the ONLY thing that can trigger a migration/re-save.
  function baseFixture(basePath: string) {
    return {
      basePath,
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
    };
  }

  it("preserves a valid basePath containing the substring '/ps' (regression)", async () => {
    const { getSettings } = await loadSettings();
    mockStored(baseFixture("~/prj/ps"));

    const result = getSettings();

    // Must NOT be reverted to the default and must NOT trigger a re-save.
    expect(result.basePath).toBe("~/prj/ps");
    expect(localStorage.setItem).not.toHaveBeenCalled();
  });

  it("still migrates the exact legacy root '~/ps' to '~/prj'", async () => {
    const { getSettings, DEFAULT_SETTINGS } = await loadSettings();
    mockStored(baseFixture("~/ps"));

    const result = getSettings();

    expect(result.basePath).toBe(DEFAULT_SETTINGS.basePath);
    expect(localStorage.setItem).toHaveBeenCalledTimes(1);
  });

  it("still migrates a legacy '~/ps/<sub>' subpath to '~/prj/<sub>'", async () => {
    const { getSettings } = await loadSettings();
    mockStored(baseFixture("~/ps/myrepo"));

    const result = getSettings();

    expect(result.basePath).toBe("~/prj/myrepo");
    expect(localStorage.setItem).toHaveBeenCalledTimes(1);
  });
});
