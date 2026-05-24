/**
 * Test Containers API - Template Operations
 *
 * Handlers for container template management.
 */

import type { ContainerTemplate, TemplateCategory } from "../types";
import defaultTemplates from "../data/default-templates.json";

// In-memory store for custom templates (would be persisted in production)
const customTemplates: ContainerTemplate[] = [];

/**
 * Get all templates (default + custom)
 */
export function listTemplates(
  category?: TemplateCategory,
): ContainerTemplate[] {
  const allTemplates = [
    ...(defaultTemplates.templates as ContainerTemplate[]),
    ...customTemplates,
  ];

  if (category) {
    return allTemplates.filter((t) => t.category === category);
  }

  return allTemplates;
}

/**
 * Get a template by ID
 */
export function getTemplate(id: string): ContainerTemplate | undefined {
  const allTemplates = [
    ...(defaultTemplates.templates as ContainerTemplate[]),
    ...customTemplates,
  ];

  return allTemplates.find((t) => t.id === id);
}

/**
 * Create a custom template
 */
export function createTemplate(
  template: Omit<ContainerTemplate, "id" | "official">,
): ContainerTemplate {
  const newTemplate: ContainerTemplate = {
    ...template,
    id: `custom-${Date.now()}`,
    official: false,
  };

  customTemplates.push(newTemplate);
  return newTemplate;
}

/**
 * Update a custom template
 */
export function updateTemplate(
  id: string,
  updates: Partial<ContainerTemplate>,
): ContainerTemplate | null {
  const index = customTemplates.findIndex((t) => t.id === id);
  if (index === -1) {
    return null;
  }

  customTemplates[index] = {
    ...customTemplates[index],
    ...updates,
    id, // Preserve ID
    official: false, // Can't make custom templates official
  };

  return customTemplates[index];
}

/**
 * Delete a custom template
 */
export function deleteTemplate(id: string): boolean {
  const index = customTemplates.findIndex((t) => t.id === id);
  if (index === -1) {
    return false;
  }

  customTemplates.splice(index, 1);
  return true;
}

/**
 * Get templates grouped by category
 */
export function getTemplatesByCategory(): Record<
  TemplateCategory,
  ContainerTemplate[]
> {
  const allTemplates = listTemplates();

  const grouped: Record<TemplateCategory, ContainerTemplate[]> = {
    database: [],
    messaging: [],
    cache: [],
    service: [],
    custom: [],
  };

  for (const template of allTemplates) {
    grouped[template.category].push(template);
  }

  return grouped;
}
