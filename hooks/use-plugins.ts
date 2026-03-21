"use client";

/**
 * React hooks for the plugin system
 */

import { useState, useEffect, useCallback } from "react";
import {
  pluginRegistry,
  PluginState,
  PluginTab,
  PluginNavItem,
  PluginDashboardCard,
} from "@/lib/plugins";

/**
 * Subscribe to all plugin state changes
 */
export function usePlugins(): PluginState[] {
  const [plugins, setPlugins] = useState<PluginState[]>(() =>
    pluginRegistry.getAllPlugins(),
  );

  useEffect(() => {
    // Update state when registry changes
    const unsubscribe = pluginRegistry.subscribe(() => {
      setPlugins(pluginRegistry.getAllPlugins());
    });

    // Sync initial state
    setPlugins(pluginRegistry.getAllPlugins());

    return unsubscribe;
  }, []);

  return plugins;
}

/**
 * Get only enabled plugins
 */
export function useEnabledPlugins(): PluginState[] {
  const allPlugins = usePlugins();
  return allPlugins.filter((p) => p.enabled && p.loaded);
}

/**
 * Get a specific plugin by ID
 */
export function usePlugin(pluginId: string): PluginState | undefined {
  const allPlugins = usePlugins();
  return allPlugins.find((p) => p.plugin.id === pluginId);
}

/**
 * Get all tabs for a specific page from enabled plugins
 */
export function usePluginTabs(pageId: string): PluginTab[] {
  const enabledPlugins = useEnabledPlugins();

  // Recalculate when plugins change
  const tabs: PluginTab[] = [];
  for (const state of enabledPlugins) {
    const pluginTabs =
      state.plugin.ui?.tabs?.filter((t) => t.targetPage === pageId) ?? [];
    tabs.push(...pluginTabs);
  }

  return tabs.sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
}

/**
 * Get all navigation items from enabled plugins
 */
export function usePluginNavItems(): PluginNavItem[] {
  const enabledPlugins = useEnabledPlugins();

  const items: PluginNavItem[] = [];
  for (const state of enabledPlugins) {
    const navItems = state.plugin.ui?.navigation ?? [];
    items.push(...navItems);
  }

  return items.sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
}

/**
 * Get all dashboard cards from enabled plugins
 */
export function usePluginDashboardCards(): PluginDashboardCard[] {
  const enabledPlugins = useEnabledPlugins();

  const cards: PluginDashboardCard[] = [];
  for (const state of enabledPlugins) {
    const dashboardCards = state.plugin.ui?.dashboardCards ?? [];
    cards.push(...dashboardCards);
  }

  return cards.sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
}

/**
 * Plugin management actions
 */
export function usePluginActions() {
  const enable = useCallback(async (pluginId: string) => {
    await pluginRegistry.enablePlugin(pluginId);
  }, []);

  const disable = useCallback(async (pluginId: string) => {
    await pluginRegistry.disablePlugin(pluginId);
  }, []);

  const register = useCallback(async (plugin: PluginState["plugin"]) => {
    await pluginRegistry.register(plugin);
  }, []);

  const unregister = useCallback(async (pluginId: string) => {
    await pluginRegistry.unregister(pluginId);
  }, []);

  return { enable, disable, register, unregister };
}
