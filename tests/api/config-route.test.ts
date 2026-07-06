/**
 * Tests for /api/config endpoint
 *
 * Tests config loading, caching, error handling, and fallback behavior.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET } from "@/app/api/config/route";
import * as configModule from "@/lib/config";
import type { DaaxConfig } from "@/lib/config";

// Mock the config module
vi.mock("@/lib/config", () => ({
  loadConfig: vi.fn(),
  getDefaultConfig: vi.fn(),
  configToSettingsDefaults: vi.fn(),
  clearConfigCache: vi.fn(),
}));

describe("/api/config", () => {
  // Full mock config matching DaaxConfig type
  const mockConfig: DaaxConfig = {
    features: {
      visibility: "alpha",
      showMaturityLabels: true,
    },
    layout: {
      aiCodingLayout: "tree",
    },
    plugins: {
      maturity: {
        home: "ga",
        "ai-coding": "ga",
      },
      order: ["home", "ai-coding"],
    },
    subfeatures: {
      maturity: {},
      order: {},
    },
    homepage: {
      cardOrder: [],
      cards: {},
    },
  };

  const mockDefaultConfig: DaaxConfig = {
    features: {
      visibility: "beta",
      showMaturityLabels: false,
    },
    layout: {
      aiCodingLayout: "tabs",
    },
    plugins: {
      maturity: {},
      order: [],
    },
    subfeatures: {
      maturity: {},
      order: {},
    },
    homepage: {
      cardOrder: [],
      cards: {},
    },
  };

  // Mock settings defaults that match the expected return type
  const mockSettingsDefaults = {
    basePath: "~/prj",
    featureVisibility: "alpha" as const,
    showMaturityLabels: true,
    aiCodingLayout: "tree" as const,
    pluginMaturity: {} as Record<string, "disabled" | "alpha" | "beta" | "ga">,
    pluginOrder: [] as string[],
    subFeatureMaturity: {} as Record<
      string,
      "disabled" | "alpha" | "beta" | "ga"
    >,
    subFeatureOrder: {} as Record<string, string[]>,
    homepageCards: {} as Record<
      string,
      { enabled: boolean; color: "blue" | "green" | "white"; tagline?: string }
    >,
    homepageCardOrder: [] as string[],
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock implementations
    vi.mocked(configModule.loadConfig).mockResolvedValue(mockConfig);
    vi.mocked(configModule.getDefaultConfig).mockReturnValue(mockDefaultConfig);
    vi.mocked(configModule.configToSettingsDefaults).mockReturnValue(
      mockSettingsDefaults,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // This suite stubs NODE_ENV via vi.stubEnv; without unstubbing, vitest's
    // env-stub registry leaks into later test files in the same worker and can
    // clobber env-dependent assertions (e.g. the RBAC local-operator bypass).
    vi.unstubAllEnvs();
  });

  describe("successful config loading", () => {
    it("returns loaded config with source indicator", async () => {
      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.source).toBe("config.toml");
      expect(data.config).toEqual(mockConfig);
      expect(data.settingsDefaults).toEqual(mockSettingsDefaults);
    });

    it("calls loadConfig to fetch configuration", async () => {
      await GET();

      expect(configModule.loadConfig).toHaveBeenCalledTimes(1);
    });

    it("calls configToSettingsDefaults with loaded config", async () => {
      await GET();

      expect(configModule.configToSettingsDefaults).toHaveBeenCalledWith(
        mockConfig,
      );
    });
  });

  describe("error handling and fallback", () => {
    it("returns defaults on loadConfig error", async () => {
      vi.mocked(configModule.loadConfig).mockRejectedValue(
        new Error("Failed to parse TOML"),
      );

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200); // Still 200 because we return valid defaults
      expect(data.source).toBe("defaults");
      expect(data.config).toEqual(mockDefaultConfig);
      expect(data.error).toBe("Failed to parse TOML");
    });

    it("returns defaults on config file not found", async () => {
      const notFoundError = new Error("ENOENT: no such file or directory");
      vi.mocked(configModule.loadConfig).mockRejectedValue(notFoundError);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.source).toBe("defaults");
      expect(data.error).toContain("ENOENT");
    });

    it("handles non-Error objects in catch block", async () => {
      vi.mocked(configModule.loadConfig).mockRejectedValue("string error");

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.source).toBe("defaults");
      expect(data.error).toBe("Unknown error");
    });
  });

  describe("development mode cache clearing", () => {
    it("clears cache in development mode", async () => {
      // Store original and override
      const originalEnv = process.env.NODE_ENV;
      vi.stubEnv("NODE_ENV", "development");

      await GET();

      expect(configModule.clearConfigCache).toHaveBeenCalled();

      // Restore
      vi.stubEnv("NODE_ENV", originalEnv || "test");
    });

    it("does not clear cache in production mode", async () => {
      const originalEnv = process.env.NODE_ENV;
      vi.stubEnv("NODE_ENV", "production");

      await GET();

      expect(configModule.clearConfigCache).not.toHaveBeenCalled();

      // Restore the original NODE_ENV to prevent leaking into other tests
      vi.stubEnv("NODE_ENV", originalEnv || "test");
    });
  });

  describe("response format", () => {
    it("returns JSON response", async () => {
      const response = await GET();

      expect(response.headers.get("content-type")).toContain(
        "application/json",
      );
    });

    it("includes all expected fields on success", async () => {
      const response = await GET();
      const data = await response.json();

      expect(data).toHaveProperty("config");
      expect(data).toHaveProperty("settingsDefaults");
      expect(data).toHaveProperty("source");
    });

    it("includes error field on failure", async () => {
      vi.mocked(configModule.loadConfig).mockRejectedValue(
        new Error("Test error"),
      );

      const response = await GET();
      const data = await response.json();

      expect(data).toHaveProperty("config");
      expect(data).toHaveProperty("settingsDefaults");
      expect(data).toHaveProperty("source", "defaults");
      expect(data).toHaveProperty("error", "Test error");
    });
  });
});
