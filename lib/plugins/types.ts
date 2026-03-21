/**
 * Daax Plugin System - Core Types
 *
 * Plugins are self-contained features that can be added/removed without
 * affecting the core application. Each plugin must implement the Plugin
 * interface and register itself with the plugin registry.
 */

import { ComponentType, ReactNode } from "react";
import { LucideIcon } from "lucide-react";

/**
 * Plugin metadata - describes the plugin without loading it
 */
export interface PluginManifest {
  /** Unique plugin identifier (kebab-case) */
  id: string;
  /** Display name */
  name: string;
  /** Short description */
  description: string;
  /** Semantic version */
  version: string;
  /** Plugin author/maintainer */
  author?: string;
  /** Plugin category for organization */
  category: PluginCategory;
  /** Whether plugin is enabled by default */
  enabledByDefault?: boolean;
  /** Dependencies on other plugins */
  dependencies?: string[];
  /** Icon component or icon name */
  icon?: LucideIcon | string;
}

export type PluginCategory =
  | "tools" // Developer tools (inspector, debugger, etc.)
  | "integration" // External service integrations
  | "ui" // UI enhancements
  | "data" // Data viewers/editors
  | "ai" // AI/ML features
  | "games" // Games and entertainment
  | "core" // Core system plugins
  | "security" // Security analysis tools (ADR-004)
  | "content"; // Content and media (news, videos, resources)

/**
 * Plugin lifecycle hooks
 */
export interface PluginLifecycle {
  /** Called when plugin is first loaded */
  onLoad?: () => Promise<void> | void;
  /** Called when plugin is enabled */
  onEnable?: () => Promise<void> | void;
  /** Called when plugin is disabled */
  onDisable?: () => Promise<void> | void;
  /** Called when plugin is unloaded */
  onUnload?: () => Promise<void> | void;
}

/**
 * UI contribution points - where plugins can inject UI
 */
export interface PluginUIContributions {
  /** Add a tab to a specific page */
  tabs?: PluginTab[];
  /** Add items to navigation */
  navigation?: PluginNavItem[];
  /** Add cards to dashboard/homepage */
  dashboardCards?: PluginDashboardCard[];
  /** Add menu items */
  menuItems?: PluginMenuItem[];
  /** Add toolbar buttons */
  toolbarButtons?: PluginToolbarButton[];
}

export interface PluginTab {
  /** Target page where tab should appear */
  targetPage: string;
  /** Tab identifier */
  id: string;
  /** Tab label */
  label: string;
  /** Tab icon */
  icon?: LucideIcon;
  /** Tab content component */
  component: ComponentType<PluginComponentProps>;
  /** Tab order (lower = earlier) */
  order?: number;
}

export interface PluginNavItem {
  /** Navigation item identifier */
  id: string;
  /** Display label */
  label: string;
  /** Route path */
  href: string;
  /** Icon */
  icon?: LucideIcon | ComponentType<{ className?: string; size?: number }>;
  /** Order in navigation */
  order?: number;
}

export interface PluginDashboardCard {
  /** Card identifier */
  id: string;
  /** Card component */
  component: ComponentType<PluginComponentProps>;
  /** Grid column span (1-4) */
  colSpan?: 1 | 2 | 3 | 4;
  /** Display order */
  order?: number;
}

export interface PluginMenuItem {
  /** Menu identifier */
  menuId: string;
  /** Item identifier */
  id: string;
  /** Display label */
  label: string;
  /** Icon */
  icon?: LucideIcon;
  /** Click handler */
  onClick?: () => void;
  /** Sub-items */
  children?: PluginMenuItem[];
}

export interface PluginToolbarButton {
  /** Toolbar identifier */
  toolbarId: string;
  /** Button identifier */
  id: string;
  /** Tooltip/label */
  label: string;
  /** Icon */
  icon: LucideIcon;
  /** Click handler */
  onClick: () => void;
  /** Order in toolbar */
  order?: number;
}

/**
 * API contribution points - where plugins can add API routes
 */
export interface PluginAPIContributions {
  /** API route handlers */
  routes?: PluginAPIRoute[];
}

export interface PluginAPIRoute {
  /** HTTP method */
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Route path (relative to /api/plugins/{pluginId}/) */
  path: string;
  /** Route handler */
  handler: (req: Request) => Promise<Response>;
}

/**
 * Props passed to all plugin components
 */
export interface PluginComponentProps {
  /** Plugin instance */
  plugin: Plugin;
  /** Plugin-specific context/state */
  context?: Record<string, unknown>;
}

/**
 * Main Plugin interface - all plugins must implement this
 */
export interface Plugin extends PluginManifest, PluginLifecycle {
  /** UI contributions */
  ui?: PluginUIContributions;
  /** API contributions */
  api?: PluginAPIContributions;
  /** Plugin-specific settings schema */
  settingsSchema?: PluginSettingsSchema;
  /** Current settings values */
  settings?: Record<string, unknown>;
}

/**
 * Settings schema for plugin configuration
 */
export interface PluginSettingsSchema {
  [key: string]: PluginSettingField;
}

export interface PluginSettingField {
  type: "string" | "number" | "boolean" | "select" | "multiselect";
  label: string;
  description?: string;
  default?: unknown;
  required?: boolean;
  options?: { value: string; label: string }[];
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
  };
}

/**
 * Plugin state in the registry
 */
export interface PluginState {
  plugin: Plugin;
  enabled: boolean;
  loaded: boolean;
  error?: string;
}
