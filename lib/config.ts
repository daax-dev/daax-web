/**
 * Configuration loader for config.toml
 *
 * This module handles loading boot-time configuration from config.toml.
 * Settings in config.toml serve as defaults that can be overridden at runtime
 * via the Settings UI (stored in localStorage).
 *
 * NOTE: File system operations are only used on the server side.
 * Client-side code should use the /api/config endpoint.
 */

import { parse } from "smol-toml";
import type { MaturityLevel } from "./settings";

// =============================================================================
// CONFIG TYPES
// =============================================================================

export interface FeaturesConfig {
  visibility: MaturityLevel;
  showMaturityLabels: boolean;
}

export interface LayoutConfig {
  aiCodingLayout: "tree" | "tabs";
}

export interface PluginsConfig {
  maturity: Record<string, MaturityLevel>;
  order: string[];
}

export interface SubfeaturesConfig {
  maturity: Record<string, Record<string, MaturityLevel>>;
  order: Record<string, { order: string[] }>;
}

export interface HomepageCardConfig {
  enabled: boolean;
  color: "blue" | "green" | "white";
  tagline?: string;
}

export interface HomepageConfig {
  cardOrder: string[];
  cards: Record<string, HomepageCardConfig>;
}

export interface DaaxConfig {
  features: FeaturesConfig;
  layout: LayoutConfig;
  plugins: PluginsConfig;
  subfeatures: SubfeaturesConfig;
  homepage: HomepageConfig;
}

// =============================================================================
// DEFAULT CONFIG
// =============================================================================

const DEFAULT_CONFIG: DaaxConfig = {
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
      backlog: "ga",
      devcontainers: "beta",
      provenance: "disabled",
      security: "alpha",
      cloud: "alpha",
      learning: "alpha",
      analytics: "beta",
      testcontainers: "beta",
      settings: "ga",
    },
    order: [
      "home",
      "ai-coding",
      "backlog",
      "devcontainers",
      "testcontainers",
      "analytics",
      "settings",
    ],
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

// =============================================================================
// CONFIG LOADER (Server-side only)
// =============================================================================

let cachedConfig: DaaxConfig | null = null;

/**
 * Load configuration from config.toml (server-side only)
 * Falls back to defaults if file doesn't exist or has errors
 */
export async function loadConfig(): Promise<DaaxConfig> {
  if (cachedConfig) {
    return cachedConfig;
  }

  // Only run on server
  if (typeof window !== "undefined") {
    cachedConfig = DEFAULT_CONFIG;
    return cachedConfig;
  }

  try {
    // Dynamic imports for server-only modules
    const fs = await import("fs").then((m) => m.promises);
    const path = await import("path");

    const configPath = path.join(process.cwd(), "config.toml");
    const tomlContent = await fs.readFile(configPath, "utf-8");
    const parsed = parse(tomlContent) as Record<string, unknown>;

    cachedConfig = mergeWithDefaults(parsed);
    return cachedConfig;
  } catch (error) {
    console.warn(
      "[config] Failed to load config.toml, using defaults:",
      error instanceof Error ? error.message : error
    );
    cachedConfig = DEFAULT_CONFIG;
    return cachedConfig;
  }
}

/**
 * Load configuration synchronously (for use during build/startup)
 * Falls back to defaults if file doesn't exist
 * NOTE: This function only works on the server side.
 */
export function loadConfigSync(): DaaxConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  // Only run on server
  if (typeof window !== "undefined") {
    cachedConfig = DEFAULT_CONFIG;
    return cachedConfig;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("fs");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require("path");

    const configPath = path.join(process.cwd(), "config.toml");
    const tomlContent = fs.readFileSync(configPath, "utf-8");
    const parsed = parse(tomlContent) as Record<string, unknown>;

    cachedConfig = mergeWithDefaults(parsed);
    return cachedConfig;
  } catch (error) {
    console.warn(
      "[config] Failed to load config.toml sync, using defaults:",
      error instanceof Error ? error.message : error
    );
    cachedConfig = DEFAULT_CONFIG;
    return cachedConfig;
  }
}

/**
 * Clear cached config (for hot reload during development)
 */
export function clearConfigCache(): void {
  cachedConfig = null;
}

/**
 * Get the default configuration (useful for testing or reset)
 * Uses JSON.parse/stringify for deep clone for better cross-environment compatibility.
 */
export function getDefaultConfig(): DaaxConfig {
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
}

// =============================================================================
// MERGE HELPERS
// =============================================================================

function mergeWithDefaults(parsed: Record<string, unknown>): DaaxConfig {
  const features = parsed.features as Record<string, unknown> | undefined;
  const layout = parsed.layout as Record<string, unknown> | undefined;
  const plugins = parsed.plugins as Record<string, unknown> | undefined;
  const subfeatures = parsed.subfeatures as Record<string, unknown> | undefined;
  const homepage = parsed.homepage as Record<string, unknown> | undefined;

  return {
    features: {
      visibility:
        (features?.visibility as MaturityLevel) ??
        DEFAULT_CONFIG.features.visibility,
      showMaturityLabels:
        (features?.showMaturityLabels as boolean) ??
        DEFAULT_CONFIG.features.showMaturityLabels,
    },
    layout: {
      aiCodingLayout:
        (layout?.aiCodingLayout as "tree" | "tabs") ??
        DEFAULT_CONFIG.layout.aiCodingLayout,
    },
    plugins: {
      maturity: {
        ...DEFAULT_CONFIG.plugins.maturity,
        ...((plugins?.maturity as Record<string, MaturityLevel>) ?? {}),
      },
      order: (plugins?.order as string[]) ?? DEFAULT_CONFIG.plugins.order,
    },
    subfeatures: mergeSubfeatures(subfeatures),
    homepage: mergeHomepage(homepage),
  };
}

function mergeSubfeatures(
  subfeatures: Record<string, unknown> | undefined
): SubfeaturesConfig {
  if (!subfeatures) {
    return DEFAULT_CONFIG.subfeatures;
  }

  const maturitySection = subfeatures.maturity as
    | Record<string, Record<string, MaturityLevel>>
    | undefined;
  const orderSection = subfeatures.order as
    | Record<string, { order: string[] }>
    | undefined;

  return {
    maturity: maturitySection ?? {},
    order: orderSection ?? {},
  };
}

function mergeHomepage(
  homepage: Record<string, unknown> | undefined
): HomepageConfig {
  if (!homepage) {
    return DEFAULT_CONFIG.homepage;
  }

  return {
    cardOrder: (homepage.cardOrder as string[]) ?? [],
    cards: (homepage.cards as Record<string, HomepageCardConfig>) ?? {},
  };
}

// =============================================================================
// CONFIG TO SETTINGS MAPPING
// =============================================================================

/**
 * Convert config.toml format to settings.ts format
 * This allows settings.ts to use config.toml as the source of defaults
 */
export function configToSettingsDefaults(config: DaaxConfig): {
  featureVisibility: MaturityLevel;
  showMaturityLabels: boolean;
  aiCodingLayout: "tree" | "tabs";
  pluginMaturity: Record<string, MaturityLevel>;
  pluginOrder: string[];
  subFeatureMaturity: Record<string, MaturityLevel>;
  subFeatureOrder: Record<string, string[]>;
  homepageCards: Record<
    string,
    { enabled: boolean; color: "blue" | "green" | "white"; tagline?: string }
  >;
  homepageCardOrder: string[];
} {
  // Convert subfeatures.maturity from nested to flat format
  // From: { "ai-coding": { agents: "ga" } }
  // To: { "ai-coding.agents": "ga" }
  const flatSubFeatureMaturity: Record<string, MaturityLevel> = {};
  for (const [pluginId, features] of Object.entries(
    config.subfeatures.maturity
  )) {
    for (const [featureId, maturity] of Object.entries(features)) {
      flatSubFeatureMaturity[`${pluginId}.${featureId}`] = maturity;
    }
  }

  // Convert subfeatures.order from nested to flat format
  // From: { "ai-coding": { order: ["agents", "worktrees"] } }
  // To: { "ai-coding": ["agents", "worktrees"] }
  const flatSubFeatureOrder: Record<string, string[]> = {};
  for (const [pluginId, orderConfig] of Object.entries(
    config.subfeatures.order
  )) {
    flatSubFeatureOrder[pluginId] = orderConfig.order;
  }

  return {
    featureVisibility: config.features.visibility,
    showMaturityLabels: config.features.showMaturityLabels,
    aiCodingLayout: config.layout.aiCodingLayout,
    pluginMaturity: config.plugins.maturity,
    pluginOrder: config.plugins.order,
    subFeatureMaturity: flatSubFeatureMaturity,
    subFeatureOrder: flatSubFeatureOrder,
    homepageCards: config.homepage.cards,
    homepageCardOrder: config.homepage.cardOrder,
  };
}
