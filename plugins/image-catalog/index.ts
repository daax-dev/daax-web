/**
 * Image Catalog Plugin
 *
 * Plugin for managing hardened base images and devcontainer features.
 * Provides a catalog system for building custom development container images.
 */

import { Package } from "lucide-react";
import type { Plugin } from "@/lib/plugins";

export const imageCatalogPlugin: Plugin = {
  // Manifest
  id: "image-catalog",
  name: "Image Catalog",
  description:
    "Manage hardened base images and devcontainer features for building custom development containers",
  version: "1.0.0",
  author: "Daax",
  category: "tools",
  enabledByDefault: true,
  icon: Package,

  // UI Contributions
  // The catalog has its own top-level navigation and pages
  // No tabs or cards contributed to other pages
  ui: {
    // Navigation is handled in Titlebar
    // Pages are handled in app/catalog/
  },

  // Lifecycle hooks
  onLoad: async () => {
    console.log("[Image Catalog] Plugin loaded");
  },

  onEnable: async () => {
    console.log("[Image Catalog] Plugin enabled");
  },

  onDisable: async () => {
    console.log("[Image Catalog] Plugin disabled");
  },
};

// Re-export types for direct usage
export * from "@/types/catalog";
