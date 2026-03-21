/**
 * DevContainer Generator Library
 *
 * Generates devcontainer configurations following the official spec at containers.dev
 */

// Types
export type {
  DevContainerJson,
  DevContainerTemplate,
  DevContainerGeneratorInput,
  DevContainerGeneratorOutput,
  GeneratedFile,
  FeatureSelectionWithMetadata,
  TemplateCollection,
  DevContainerMount,
  PortAttributes,
  LifecycleCommand,
  VSCodeCustomization,
  TemplateOption,
} from "./types";

// Generator functions
export {
  generateDevContainer,
  generateDevContainerJson,
  generateTemplateMetadata,
  generateReadme,
  generateNotes,
  generateSBOMPlaceholders,
  writeDevContainer,
  updateRepoReadme,
  validateDevContainer,
  checkRepoStatus,
  listTemplates,
} from "./generator";
