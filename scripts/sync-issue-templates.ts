#!/usr/bin/env tsx
/**
 * Sync GitHub Issue Templates with Menu Structure
 *
 * This script reads the plugin/menu configuration from lib/settings.ts
 * and updates the GitHub issue templates to reflect current feature areas.
 *
 * Run with: npm run sync:issue-templates
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import * as yaml from "yaml";

// Import the plugin config directly from settings
import { DEFAULT_PLUGINS } from "../lib/settings";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = join(__dirname, "../.github/ISSUE_TEMPLATE");

// Static areas that aren't driven by plugins
const STATIC_AREAS = ["UI / Navigation", "Performance", "Other"];

// Areas for feature requests only (not bugs)
const FEATURE_ONLY_AREAS = [
  "Voice Input",
  "Project Management",
  "Integration / API",
  "New Feature Area",
];

// Agent category sub-feature IDs to exclude from general area lists.
// These are internal implementation details (local-agents, tailscale-agents, cloud-agents)
// that represent deployment modes, not user-facing feature areas.
// "coding-agents" is kept as it represents the main Coding Agents page.
const EXCLUDED_AGENT_CATEGORIES = [
  "local-agents",
  "tailscale-agents",
  "cloud-agents",
];

/**
 * Generate dropdown options from plugin configuration
 */
function generateAreaOptions(includeFeatureOnly = false): string[] {
  const areas: string[] = [];

  for (const plugin of DEFAULT_PLUGINS) {
    // Skip utility plugins that don't represent feature areas
    if (plugin.id === "home" || plugin.id === "settings") continue;

    if (plugin.subFeatures && plugin.subFeatures.length > 0) {
      // Plugin has sub-features - list each as "Plugin / SubFeature"
      for (const subFeature of plugin.subFeatures) {
        // Skip agent deployment categories (see EXCLUDED_AGENT_CATEGORIES)
        if (EXCLUDED_AGENT_CATEGORIES.includes(subFeature.id)) continue;
        areas.push(`${plugin.name} / ${subFeature.name}`);
      }
    } else {
      // Plugin without sub-features - just list the plugin
      areas.push(plugin.name);
    }
  }

  // Add static areas
  areas.push(...STATIC_AREAS);

  // Add feature-only areas if requested
  if (includeFeatureOnly) {
    // Insert before "Other" if present; otherwise append at the end
    const otherIndex = areas.indexOf("Other");
    if (otherIndex === -1) {
      areas.push(...FEATURE_ONLY_AREAS);
    } else {
      areas.splice(otherIndex, 0, ...FEATURE_ONLY_AREAS);
    }
  }

  return areas;
}

/**
 * Generate technical area options for platform builder template
 */
function generateTechnicalAreas(): string[] {
  return [
    "API Routes (/api/*)",
    "WebSocket / Terminal Server",
    "Plugin System (lib/plugins/*)",
    "Settings Management",
    "Project Context / Directory Management",
    "AI Agent Launchers",
    "MCP Integration",
    "Provenance System",
    "Security Features",
    "Analytics / Recordings",
    "Docker / Container Mode",
    "Host Mode / Local Development",
    "UI Components (components/*)",
    "State Management / Hooks",
    "Build / CI / Deployment",
    "Testing Infrastructure",
    "Other",
  ];
}

// Mapping from AI coding sub-feature IDs to user-friendly area names.
// Sub-features not in this map will use their display name with a warning.
const AI_CODING_AREA_MAP: Record<string, string> = {
  "coding-agents": "Agent Launching / Spawning",
  "code-server": "Code Server Integration",
  "workflow-editor": "Workflow Editor",
  shell: "Terminal Interaction",
  backlog: "Backlog / Task Management",
  recordings: "Session Recording",
  logs: "Log Viewing / Analysis",
  "api-tools": "API Tools Integration",
};

/**
 * Generate AI coding area options for ai_coder template
 */
function generateAICodingAreas(): string[] {
  const aiPlugin = DEFAULT_PLUGINS.find((p) => p.id === "ai-coding");
  const areas: string[] = [];

  if (aiPlugin?.subFeatures) {
    for (const sf of aiPlugin.subFeatures) {
      // Skip agent deployment categories
      if (EXCLUDED_AGENT_CATEGORIES.includes(sf.id)) continue;

      // Use mapped name if available, otherwise fall back to display name
      const mappedName = AI_CODING_AREA_MAP[sf.id];
      if (mappedName) {
        areas.push(mappedName);
      } else {
        // Fallback: use the sub-feature's display name and warn
        console.warn(
          `  Warning: Unmapped AI coding sub-feature "${sf.id}" - using display name "${sf.name}"`,
        );
        areas.push(sf.name);
      }
    }
  }

  // Add AI-specific areas not directly from menu
  areas.push(
    "Agent Container Management",
    "Voice Input / Commands",
    "Multi-Agent Coordination",
    "MCP Server Integration",
    "Project Context / Workspace",
    "Other",
  );

  return areas;
}

/**
 * Update a dropdown field in a YAML template by matching the dropdown's id attribute
 */
function updateTemplateDropdown(
  templatePath: string,
  dropdownId: string,
  newOptions: string[],
): void {
  const content = readFileSync(templatePath, "utf-8");

  // Parse YAML
  const doc = yaml.parse(content);

  // Find and update the dropdown by id (more stable than matching by label text)
  let updated = false;
  for (const item of doc.body || []) {
    if (item.type === "dropdown" && item.id === dropdownId) {
      item.attributes.options = newOptions;
      updated = true;
      console.log(
        `  Updated "${item.attributes?.label}" dropdown (${newOptions.length} options)`,
      );
      break;
    }
  }

  if (!updated) {
    console.log(`  Warning: Could not find dropdown with id="${dropdownId}"`);
    return;
  }

  // Write back with nice formatting
  const output = yaml.stringify(doc, {
    lineWidth: 0, // Don't wrap lines
    defaultKeyType: "PLAIN",
    defaultStringType: "PLAIN",
  });

  writeFileSync(templatePath, output);
}

/**
 * Safely update a template with error handling
 */
function safeUpdateTemplate(
  templateFileName: string,
  dropdownId: string,
  areas: string[],
): void {
  const templatePath = join(TEMPLATE_DIR, templateFileName);
  console.log(`Updating ${templateFileName}...`);

  // Check if file exists
  if (!existsSync(templatePath)) {
    console.error(`  Error: Template file not found: ${templatePath}`);
    process.exitCode = 1;
    return;
  }

  try {
    updateTemplateDropdown(templatePath, dropdownId, areas);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`  Error updating "${templateFileName}": ${message}`);
    process.exitCode = 1;
  }
}

// Main execution
console.log("Syncing GitHub Issue Templates with Menu Structure\n");
console.log("Source: lib/settings.ts (DEFAULT_PLUGINS)\n");

// Generate options
const bugAreas = generateAreaOptions(false);
const featureAreas = generateAreaOptions(true);
const technicalAreas = generateTechnicalAreas();
const aiCodingAreas = generateAICodingAreas();

console.log(`Generated ${bugAreas.length} bug report areas`);
console.log(`Generated ${featureAreas.length} feature request areas`);
console.log(`Generated ${technicalAreas.length} technical areas`);
console.log(`Generated ${aiCodingAreas.length} AI coding areas\n`);

// Update templates using dropdown id (not label) for stable matching
safeUpdateTemplate("bug_report.yml", "area", bugAreas);
safeUpdateTemplate("feature_request.yml", "area", featureAreas);
safeUpdateTemplate("platform_builder.yml", "area", technicalAreas);
safeUpdateTemplate("ai_coder.yml", "ai-area", aiCodingAreas);

if (process.exitCode === 1) {
  console.log("\nCompleted with errors. Review messages above.");
} else {
  console.log("\nDone! Review changes with: git diff .github/ISSUE_TEMPLATE/");
}
