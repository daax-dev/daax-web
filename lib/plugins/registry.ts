/**
 * Daax Plugin Registry
 *
 * Central registry for managing plugins. Handles registration, lifecycle,
 * and provides access to plugin contributions.
 */

import {
  Plugin,
  PluginState,
  PluginTab,
  PluginNavItem,
  PluginDashboardCard,
} from "./types";

class PluginRegistry {
  private plugins: Map<string, PluginState> = new Map();
  private listeners: Set<() => void> = new Set();

  /**
   * Register a plugin with the registry
   */
  async register(plugin: Plugin): Promise<void> {
    if (this.plugins.has(plugin.id)) {
      console.warn(`Plugin ${plugin.id} is already registered`);
      return;
    }

    // Check dependencies
    if (plugin.dependencies) {
      for (const dep of plugin.dependencies) {
        if (!this.plugins.has(dep)) {
          throw new Error(
            `Plugin ${plugin.id} requires ${dep} which is not registered`,
          );
        }
      }
    }

    const state: PluginState = {
      plugin,
      enabled: plugin.enabledByDefault ?? true,
      loaded: false,
    };

    this.plugins.set(plugin.id, state);

    // Auto-load if enabled by default
    if (state.enabled) {
      await this.loadPlugin(plugin.id);
    }

    this.notifyListeners();
  }

  /**
   * Unregister a plugin
   */
  async unregister(pluginId: string): Promise<void> {
    const state = this.plugins.get(pluginId);
    if (!state) return;

    // Check if other plugins depend on this one
    for (const [id, s] of this.plugins) {
      if (s.plugin.dependencies?.includes(pluginId)) {
        throw new Error(`Cannot unregister ${pluginId}: ${id} depends on it`);
      }
    }

    if (state.loaded) {
      await this.unloadPlugin(pluginId);
    }

    this.plugins.delete(pluginId);
    this.notifyListeners();
  }

  /**
   * Load a plugin (call onLoad lifecycle hook)
   */
  async loadPlugin(pluginId: string): Promise<void> {
    const state = this.plugins.get(pluginId);
    if (!state || state.loaded) return;

    try {
      await state.plugin.onLoad?.();
      state.loaded = true;
      state.error = undefined;

      if (state.enabled) {
        await state.plugin.onEnable?.();
      }
    } catch (err) {
      state.error = String(err);
      console.error(`Failed to load plugin ${pluginId}:`, err);
    }

    this.notifyListeners();
  }

  /**
   * Unload a plugin (call onUnload lifecycle hook)
   */
  async unloadPlugin(pluginId: string): Promise<void> {
    const state = this.plugins.get(pluginId);
    if (!state || !state.loaded) return;

    try {
      if (state.enabled) {
        await state.plugin.onDisable?.();
      }
      await state.plugin.onUnload?.();
      state.loaded = false;
    } catch (err) {
      state.error = String(err);
      console.error(`Failed to unload plugin ${pluginId}:`, err);
    }

    this.notifyListeners();
  }

  /**
   * Enable a plugin
   */
  async enablePlugin(pluginId: string): Promise<void> {
    const state = this.plugins.get(pluginId);
    if (!state || state.enabled) return;

    state.enabled = true;

    if (state.loaded) {
      await state.plugin.onEnable?.();
    } else {
      await this.loadPlugin(pluginId);
    }

    this.notifyListeners();
  }

  /**
   * Disable a plugin
   */
  async disablePlugin(pluginId: string): Promise<void> {
    const state = this.plugins.get(pluginId);
    if (!state || !state.enabled) return;

    state.enabled = false;

    if (state.loaded) {
      await state.plugin.onDisable?.();
    }

    this.notifyListeners();
  }

  /**
   * Get a plugin by ID
   */
  getPlugin(pluginId: string): PluginState | undefined {
    return this.plugins.get(pluginId);
  }

  /**
   * Get all registered plugins
   */
  getAllPlugins(): PluginState[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Get all enabled plugins
   */
  getEnabledPlugins(): PluginState[] {
    return this.getAllPlugins().filter((s) => s.enabled && s.loaded);
  }

  /**
   * Get all tabs contributed by plugins for a specific page
   */
  getTabsForPage(pageId: string): PluginTab[] {
    const tabs: PluginTab[] = [];

    for (const state of this.getEnabledPlugins()) {
      const pluginTabs =
        state.plugin.ui?.tabs?.filter((t) => t.targetPage === pageId) ?? [];
      tabs.push(...pluginTabs);
    }

    return tabs.sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
  }

  /**
   * Get all navigation items contributed by plugins
   */
  getNavigationItems(): PluginNavItem[] {
    const items: PluginNavItem[] = [];

    for (const state of this.getEnabledPlugins()) {
      const navItems = state.plugin.ui?.navigation ?? [];
      items.push(...navItems);
    }

    return items.sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
  }

  /**
   * Get all dashboard cards contributed by plugins
   */
  getDashboardCards(): PluginDashboardCard[] {
    const cards: PluginDashboardCard[] = [];

    for (const state of this.getEnabledPlugins()) {
      const dashboardCards = state.plugin.ui?.dashboardCards ?? [];
      cards.push(...dashboardCards);
    }

    return cards.sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
  }

  /**
   * Subscribe to registry changes
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    this.listeners.forEach((listener) => listener());
  }
}

// Singleton instance
export const pluginRegistry = new PluginRegistry();

// Export for type usage
export type { PluginRegistry };
