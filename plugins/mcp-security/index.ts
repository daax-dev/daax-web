/**
 * SAFE-MCP Security Toolkit Plugin
 *
 * Integrates the SAFE-MCP (Security Analysis Framework for Evaluation of
 * Model Context Protocol) into Daax. Provides comprehensive security
 * analysis tools for MCP implementations.
 *
 * Features:
 * - TTP Browser: MITRE ATT&CK-style matrix for 81 attack techniques
 * - Mitigation Dashboard: Coverage analysis for 47 security controls
 * - MCP Scanner: Vulnerability detection for MCP configurations
 * - Detection Rules: Sigma-format rules with test capabilities
 * - Security Assessment: Interactive posture checklist
 * - Incidents Timeline: Real-world attack documentation
 *
 * @see https://github.com/SAFE-MCP/safe-mcp
 * @see .specify/features/safe-mcp/plan.md
 */

import { Shield } from "lucide-react";
import type { Plugin } from "@/lib/plugins";

export const mcpSecurityPlugin: Plugin = {
  // Manifest
  id: "mcp-security",
  name: "SAFE-MCP Security Toolkit",
  description: "Security analysis framework for MCP implementations",
  version: "1.0.0",
  author: "Daax",
  category: "security",
  enabledByDefault: true,
  icon: Shield,

  // UI Contributions
  ui: {
    navigation: [
      {
        id: "cyber",
        label: "Cyber",
        href: "/cyber/safe-mcp",
        icon: Shield,
        order: 80,
      },
    ],
  },

  // Lifecycle hooks
  onLoad: async () => {
    console.log("[SAFE-MCP] Plugin loaded");
  },

  onEnable: async () => {
    console.log("[SAFE-MCP] Plugin enabled");
  },

  onDisable: async () => {
    console.log("[SAFE-MCP] Plugin disabled");
  },
};

// Re-export types for external usage
export * from "./types";
