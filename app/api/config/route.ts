import { NextResponse } from "next/server";
import {
  loadConfig,
  getDefaultConfig,
  configToSettingsDefaults,
  clearConfigCache,
} from "@/lib/config";

// Rate limit cache clearing to avoid excessive disk reads in development.
// This uses a simple timestamp-based approach rather than a mutex/lock because:
// 1. Cache clearing is idempotent - multiple clears just re-read config.toml
// 2. A proper mutex would add significant complexity for minimal benefit
// 3. We explicitly accept that concurrent requests MAY both pass the rate limit
//    check, resulting in 2+ cache clears in quick succession - this is benign
//    since it only causes extra disk I/O during a brief window, not incorrect behavior
let lastConfigCacheClear = 0;
const CONFIG_CACHE_CLEAR_INTERVAL_MS = 1000; // Only clear cache once per second

/**
 * GET /api/config
 * Returns the parsed config.toml configuration for client-side use.
 * The config is loaded from config.toml and merged with defaults.
 *
 * In development mode, re-read config.toml to pick up changes (rate-limited).
 */
export async function GET() {
  try {
    // In development, clear cache to pick up config.toml changes,
    // but rate-limit to avoid excessive disk reads on rapid requests.
    if (process.env.NODE_ENV === "development") {
      const now = Date.now();
      if (now - lastConfigCacheClear > CONFIG_CACHE_CLEAR_INTERVAL_MS) {
        // Set timestamp BEFORE clearing cache to prevent race conditions where
        // multiple concurrent requests all see the old timestamp
        lastConfigCacheClear = now;
        clearConfigCache();
      }
    }

    const config = await loadConfig();
    const settingsDefaults = configToSettingsDefaults(config);

    // Only log in development to avoid noisy production logs
    if (process.env.NODE_ENV === "development") {
      console.log("[api/config] Loaded config.toml:", {
        visibility: config.features.visibility,
        showMaturityLabels: config.features.showMaturityLabels,
      });
    }

    return NextResponse.json({
      config,
      settingsDefaults,
      source: "config.toml",
    });
  } catch (error) {
    console.error("[api/config] Error loading config:", error);

    // Return defaults on error
    const defaultConfig = getDefaultConfig();
    const settingsDefaults = configToSettingsDefaults(defaultConfig);

    return NextResponse.json(
      {
        config: defaultConfig,
        settingsDefaults,
        source: "defaults",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 200 }, // Still 200 because we return valid defaults
    );
  }
}
