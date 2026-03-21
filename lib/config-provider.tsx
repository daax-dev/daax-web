"use client";

/**
 * ConfigProvider - Loads config.toml settings on client boot
 *
 * This provider fetches configuration from /api/config and initializes
 * the settings defaults before any other components access settings.
 *
 * IMPORTANT: This blocks rendering until config is loaded to ensure
 * all components see the correct config.toml defaults.
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { initConfigDefaults, type DaaxSettings } from "./settings";

interface ConfigContextValue {
  isLoaded: boolean;
  error: string | null;
}

const ConfigContext = createContext<ConfigContextValue>({
  isLoaded: false,
  error: null,
});

export function useConfig() {
  return useContext(ConfigContext);
}

interface ConfigProviderProps {
  children: ReactNode;
}

export function ConfigProvider({ children }: ConfigProviderProps) {
  // Track whether config has been fetched (separate from loaded state)
  const [hasFetched, setHasFetched] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Only fetch once
    if (hasFetched) return;
    setHasFetched(true);

    async function loadConfig() {
      try {
        const response = await fetch("/api/config");
        if (!response.ok) {
          throw new Error(`Failed to fetch config: ${response.status}`);
        }

        const data = await response.json();

        // Initialize settings defaults from config.toml
        if (data.settingsDefaults) {
          initConfigDefaults(data.settingsDefaults as Partial<DaaxSettings>);
          if (process.env.NODE_ENV === "development") {
            console.log("[ConfigProvider] Loaded config.toml defaults:", {
              source: data.source,
              visibility: data.settingsDefaults.featureVisibility,
              showMaturityLabels: data.settingsDefaults.showMaturityLabels,
            });
          }
        }

        setIsLoaded(true);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error("[ConfigProvider] Failed to load config:", message);
        setError(message);
        // Still mark as loaded so app can continue with hardcoded defaults
        setIsLoaded(true);
      }
    }

    loadConfig();
  }, [hasFetched]);

  // Show a simple loading state until config is loaded so users don't see
  // a blank screen. Children wait for config to be initialized before rendering.
  if (!isLoaded) {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-busy="true"
        className="flex items-center justify-center min-h-screen text-muted-foreground"
      >
        Loading configuration…
      </div>
    );
  }

  return (
    <ConfigContext.Provider value={{ isLoaded, error }}>
      {children}
    </ConfigContext.Provider>
  );
}
