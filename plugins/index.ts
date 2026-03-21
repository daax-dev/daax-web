/**
 * Daax Plugins - Registration
 *
 * This file registers all available plugins with the registry.
 * To add a new plugin:
 * 1. Create the plugin in plugins/<plugin-name>/
 * 2. Import and add to the plugins array below
 */

import { pluginRegistry, Plugin } from "@/lib/plugins";

// Import all plugins
import { mcpInspectorPlugin } from "./mcp-inspector";
import { imageCatalogPlugin } from "./image-catalog";
import { screenRecorderPlugin } from "./screen-recorder";
import { terminalRecorderPlugin } from "./terminal-recorder";
import { mcpSecurityPlugin } from "./mcp-security";
import { testcontainersPlugin } from "./testcontainers";
import { botPlugin } from "./clawd-bot";

/**
 * All available plugins
 */
const plugins: Plugin[] = [
  mcpInspectorPlugin,
  imageCatalogPlugin,
  screenRecorderPlugin,
  terminalRecorderPlugin,
  mcpSecurityPlugin,
  testcontainersPlugin,
  botPlugin,
];

/**
 * Initialize all plugins
 * Call this once at app startup
 */
export async function initializePlugins(): Promise<void> {
  console.log("[Plugins] Initializing plugins...");

  for (const plugin of plugins) {
    try {
      await pluginRegistry.register(plugin);
      console.log(`[Plugins] Registered: ${plugin.id}`);
    } catch (err) {
      console.error(`[Plugins] Failed to register ${plugin.id}:`, err);
    }
  }

  console.log(`[Plugins] Initialized ${plugins.length} plugins`);
}

/**
 * Get a plugin by ID (for direct access)
 */
export function getPlugin(id: string): Plugin | undefined {
  return plugins.find((p) => p.id === id);
}

// Re-export the registry
export { pluginRegistry };
