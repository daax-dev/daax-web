/**
 * Test Containers Plugin
 *
 * Self-hosted Docker container management for testing infrastructure.
 * Provides a unified UI for managing, monitoring, and cleaning up
 * ephemeral test containers.
 */

import { Container } from "lucide-react";
import type { Plugin } from "@/lib/plugins";

export const testcontainersPlugin: Plugin = {
  // Manifest
  id: "testcontainers",
  name: "Test Containers",
  description: "Manage ephemeral testing infrastructure with Docker containers",
  version: "1.0.0",
  author: "Daax",
  category: "tools",
  enabledByDefault: true,
  icon: Container,

  // UI Contributions
  ui: {
    navigation: [
      {
        id: "testcontainers",
        label: "Test Containers",
        href: "/testcontainers",
        icon: Container,
        order: 45, // After AI Coding, before Provenance
      },
    ],
  },

  // Lifecycle hooks
  onLoad: async () => {
    console.log("[Test Containers] Plugin loaded");
  },

  onEnable: async () => {
    console.log("[Test Containers] Plugin enabled");
    // TODO: Start cleanup scheduler when implemented
  },

  onDisable: async () => {
    console.log("[Test Containers] Plugin disabled");
    // TODO: Stop cleanup scheduler when implemented
  },

  // Settings Schema
  settingsSchema: {
    autoRefreshInterval: {
      type: "number",
      label: "Auto-refresh Interval (seconds)",
      description: "How often to refresh the container list",
      default: 10,
      validation: { min: 5, max: 60 },
    },
    defaultCleanupAge: {
      type: "number",
      label: "Default Cleanup Age (hours)",
      description: "Remove containers older than this",
      default: 24,
      validation: { min: 1, max: 168 },
    },
    maxContainers: {
      type: "number",
      label: "Max Containers",
      description: "Maximum number of concurrent test containers",
      default: 20,
      validation: { min: 5, max: 100 },
    },
  },
};

// Re-export types for external usage
export * from "./types";
export * from "./constants";
