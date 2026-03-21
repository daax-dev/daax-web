/**
 * Daax Plugin System - Public API
 *
 * This is the main entry point for the plugin system.
 * Import from here, not from individual files.
 */

// Core types
export type {
  Plugin,
  PluginManifest,
  PluginState,
  PluginCategory,
  PluginLifecycle,
  PluginUIContributions,
  PluginAPIContributions,
  PluginTab,
  PluginNavItem,
  PluginDashboardCard,
  PluginMenuItem,
  PluginToolbarButton,
  PluginAPIRoute,
  PluginComponentProps,
  PluginSettingsSchema,
  PluginSettingField,
} from "./types";

// Registry
export { pluginRegistry } from "./registry";
export type { PluginRegistry } from "./registry";
