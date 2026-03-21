/**
 * MCP Inspector Plugin
 *
 * Plugin for testing and debugging MCP servers using the official MCP Inspector.
 * Provides a tab on the MCP page for launching and managing inspector instances.
 */

import { Terminal } from "lucide-react";
import type { Plugin } from "@/lib/plugins";
import { InspectorPanel } from "./components/InspectorPanel";

export const mcpInspectorPlugin: Plugin = {
  // Manifest
  id: "mcp-inspector",
  name: "MCP Inspector",
  description:
    "Test and debug MCP servers using the official MCP Inspector tool",
  version: "1.0.0",
  author: "Daax",
  category: "tools",
  enabledByDefault: true,
  icon: Terminal,

  // UI Contributions
  ui: {
    tabs: [
      {
        targetPage: "mcp",
        id: "inspector",
        label: "Inspector",
        icon: Terminal,
        component: InspectorPanel,
        order: 50,
      },
    ],
  },

  // Lifecycle hooks
  onLoad: async () => {
    console.log("[MCP Inspector] Plugin loaded");
  },

  onEnable: async () => {
    console.log("[MCP Inspector] Plugin enabled");
  },

  onDisable: async () => {
    console.log("[MCP Inspector] Plugin disabled");
  },
};

// Re-export types and API for direct usage
export * from "./types";
export * from "./api";
export { InspectorPanel } from "./components/InspectorPanel";
