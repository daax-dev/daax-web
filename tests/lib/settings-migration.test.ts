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
    const { getSettings, DEFAULT_AGENT_IMAGE, DEFAULT_AGENT_IMAGE_GSD } =
      await loadSettings();
    // Include the fields guarded by unrelated `=== undefined` migrations so
    // this fixture isolates the container-ID migration as the only trigger.
    // Image fields use the digest-pinned defaults (#195) — the old `:latest`
    // defaults would themselves trigger a migration.
    mockStored({
      basePath: "~/prj",
      containerImage: DEFAULT_AGENT_IMAGE,
      terminalRecordingEnabled: true,
      autoWorktreeEnabled: true,
      autoWorktreeCleanup: true,
      autoWorktreePushBeforeCleanup: true,
      aiCoding: {
        defaultContainerImage: DEFAULT_AGENT_IMAGE_GSD,
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
  // the ONLY thing that can trigger a migration/re-save. Image fields use
  // deliberately custom (non-default) values so the #195 old-default→pinned
  // migrations cannot fire either.
  function baseFixture(basePath: string) {
    return {
      basePath,
      containerImage: "jpoley/daax-agents:arm64",
      terminalRecordingEnabled: true,
      autoWorktreeEnabled: true,
      autoWorktreeCleanup: true,
      autoWorktreePushBeforeCleanup: true,
      aiCoding: {
        defaultContainerImage: "ghcr.io/acme/daax-agents-gsd:latest",
        containerRegistry: "ghcr.io/acme",
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

describe("settings migration: legacy :latest agent-image defaults (#195)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Fixture with every other migration-guarded field pre-set, so the two
  // agent-image fields are the ONLY possible migration triggers.
  function imageFixture(
    containerImage: string,
    defaultContainerImage: string,
    containerRegistry = "jpoley",
  ) {
    return {
      basePath: "~/prj",
      containerImage,
      terminalRecordingEnabled: true,
      autoWorktreeEnabled: true,
      autoWorktreeCleanup: true,
      autoWorktreePushBeforeCleanup: true,
      aiCoding: {
        defaultContainerImage,
        containerRegistry,
        autoPullLatest: false,
        usePrebuiltImage: true,
      },
    };
  }

  it("migrates the old default containerImage 'jpoley/daax-agents:latest' to the pinned digest", async () => {
    const { getSettings, DEFAULT_AGENT_IMAGE, DEFAULT_AGENT_IMAGE_GSD } =
      await loadSettings();
    mockStored(
      imageFixture("jpoley/daax-agents:latest", DEFAULT_AGENT_IMAGE_GSD),
    );

    const result = getSettings();

    expect(result.containerImage).toBe(DEFAULT_AGENT_IMAGE);
    expect(result.containerImage).toMatch(/@sha256:[0-9a-f]{64}$/);

    // Migration must be persisted so the pin survives the next load.
    expect(localStorage.setItem).toHaveBeenCalledTimes(1);
    const saved = JSON.parse(
      vi.mocked(localStorage.setItem).mock.calls[0][1] as string,
    );
    expect(saved.containerImage).toBe(DEFAULT_AGENT_IMAGE);
  });

  it("migrates the old aiCoding default 'jpoley/daax-agents-gsd:latest' to the pinned digest", async () => {
    const { getSettings, DEFAULT_AGENT_IMAGE, DEFAULT_AGENT_IMAGE_GSD } =
      await loadSettings();
    mockStored(
      imageFixture(DEFAULT_AGENT_IMAGE, "jpoley/daax-agents-gsd:latest"),
    );

    const result = getSettings();

    expect(result.aiCoding.defaultContainerImage).toBe(DEFAULT_AGENT_IMAGE_GSD);
    expect(result.aiCoding.defaultContainerImage).toMatch(
      /@sha256:[0-9a-f]{64}$/,
    );

    expect(localStorage.setItem).toHaveBeenCalledTimes(1);
    const saved = JSON.parse(
      vi.mocked(localStorage.setItem).mock.calls[0][1] as string,
    );
    expect(saved.aiCoding.defaultContainerImage).toBe(DEFAULT_AGENT_IMAGE_GSD);
  });

  it("preserves a valid digest that uses uppercase hex (not reset to default)", async () => {
    const { getSettings, DEFAULT_AGENT_IMAGE_GSD } = await loadSettings();
    // A valid @sha256 digest may use uppercase hex per the Docker reference
    // grammar (lib/docker-validation.ts VALID_IMAGE_NAME_PATTERN allows A-F).
    // The persisted-settings validImagePattern must accept it too, otherwise a
    // legitimate pinned image is wrongly reset to the default on load.
    const upperHexDigest =
      "jpoley/daax-agents@sha256:2153F137B3F47DE007698D1E5F0D31A684CB45A7E1EBC1326F668EE458F55BC5";
    mockStored(imageFixture(upperHexDigest, DEFAULT_AGENT_IMAGE_GSD));

    const result = getSettings();

    // Must survive untouched — not reset, not re-saved.
    expect(result.containerImage).toBe(upperHexDigest);
    expect(localStorage.setItem).not.toHaveBeenCalled();
  });

  it("does NOT rewrite genuinely custom user-chosen images", async () => {
    const { getSettings } = await loadSettings();
    // Values a user could have picked deliberately: a valid non-default tag
    // for containerImage, and a third-party image for aiCoding. Neither
    // byte-equals a previously shipped default, so both must survive.
    mockStored(
      imageFixture(
        "jpoley/daax-agents:arm64",
        "ghcr.io/acme/daax-agents-gsd:latest",
        "ghcr.io/acme",
      ),
    );

    const result = getSettings();

    expect(result.containerImage).toBe("jpoley/daax-agents:arm64");
    expect(result.aiCoding.defaultContainerImage).toBe(
      "ghcr.io/acme/daax-agents-gsd:latest",
    );
    expect(localStorage.setItem).not.toHaveBeenCalled();
  });
});
