"use client";

/**
 * Plugin Provider
 *
 * Initializes the plugin system and provides plugin context to the app.
 * Wrap your app with this provider to enable plugins.
 */

import {
  useEffect,
  useState,
  createContext,
  useContext,
  ReactNode,
} from "react";
import { initializePlugins } from "@/plugins";

interface PluginContextValue {
  initialized: boolean;
  error: string | null;
}

const PluginContext = createContext<PluginContextValue>({
  initialized: false,
  error: null,
});

export function usePluginContext() {
  return useContext(PluginContext);
}

interface PluginProviderProps {
  children: ReactNode;
}

export function PluginProvider({ children }: PluginProviderProps) {
  const [initialized, setInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      try {
        await initializePlugins();
        setInitialized(true);
      } catch (err) {
        console.error("Failed to initialize plugins:", err);
        setError(String(err));
        // Still mark as initialized so app can function without plugins
        setInitialized(true);
      }
    }

    init();
  }, []);

  return (
    <PluginContext.Provider value={{ initialized, error }}>
      {children}
    </PluginContext.Provider>
  );
}
