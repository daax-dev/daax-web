/**
 * DevContainer Generator Types
 *
 * Types following the official devcontainer spec at https://containers.dev/
 */

import type {
  BaseImage,
  Feature,
  FeatureSelection,
  SecurityProfile,
  SBOMFormat,
} from "@/types/catalog";

// ============================================================================
// DevContainer JSON Schema (per containers.dev spec)
// ============================================================================

export interface DevContainerJson {
  // Metadata
  name: string;

  // Image-based configuration
  image?: string;

  // Dockerfile-based configuration
  build?: {
    dockerfile?: string;
    context?: string;
    args?: Record<string, string>;
    target?: string;
    cacheFrom?: string | string[];
  };

  // Docker Compose configuration
  dockerComposeFile?: string | string[];
  service?: string;
  runServices?: string[];

  // Features
  features?: Record<string, string | boolean | Record<string, unknown>>;

  // Runtime configuration
  containerEnv?: Record<string, string>;
  remoteEnv?: Record<string, string>;
  containerUser?: string;
  remoteUser?: string;
  updateRemoteUserUID?: boolean;

  // Mounts and volumes
  mounts?: (string | DevContainerMount)[];
  workspaceMount?: string;
  workspaceFolder?: string;

  // Port forwarding
  forwardPorts?: (number | string)[];
  portsAttributes?: Record<string, PortAttributes>;
  otherPortsAttributes?: PortAttributes;

  // Lifecycle scripts
  initializeCommand?: LifecycleCommand;
  onCreateCommand?: LifecycleCommand;
  updateContentCommand?: LifecycleCommand;
  postCreateCommand?: LifecycleCommand;
  postStartCommand?: LifecycleCommand;
  postAttachCommand?: LifecycleCommand;
  waitFor?:
    | "initializeCommand"
    | "onCreateCommand"
    | "updateContentCommand"
    | "postCreateCommand"
    | "postStartCommand";

  // Host requirements
  hostRequirements?: {
    cpus?: number;
    memory?: string;
    storage?: string;
    gpu?: boolean | "optional" | GPURequirement;
  };

  // Tool-specific customizations
  customizations?: {
    vscode?: VSCodeCustomization;
    codespaces?: CodespacesCustomization;
    [key: string]: unknown;
  };

  // Security
  privileged?: boolean;
  init?: boolean;
  capAdd?: string[];
  securityOpt?: string[];

  // User data
  userEnvProbe?:
    | "none"
    | "loginShell"
    | "loginInteractiveShell"
    | "interactiveShell";
  overrideCommand?: boolean;
  shutdownAction?: "none" | "stopContainer" | "stopCompose";
}

export interface DevContainerMount {
  type: "bind" | "volume" | "tmpfs";
  source?: string;
  target: string;
  consistency?: "consistent" | "cached" | "delegated";
}

export interface PortAttributes {
  label?: string;
  protocol?: "http" | "https" | "auto";
  onAutoForward?:
    | "notify"
    | "openBrowser"
    | "openBrowserOnce"
    | "openPreview"
    | "silent"
    | "ignore";
  requireLocalPort?: boolean;
  elevateIfNeeded?: boolean;
}

export type LifecycleCommand =
  | string
  | string[]
  | Record<string, string | string[]>;

export interface GPURequirement {
  cores?: number;
  memory?: string;
}

export interface VSCodeCustomization {
  extensions?: string[];
  settings?: Record<string, unknown>;
}

export interface CodespacesCustomization {
  openFiles?: string[];
  repositories?: Record<string, { permissions: Record<string, string> }>;
}

// ============================================================================
// DevContainer Template Metadata (per containers.dev/templates spec)
// ============================================================================

export interface DevContainerTemplate {
  id: string;
  version: string;
  name: string;
  description: string;
  documentationURL?: string;
  licenseURL?: string;
  publisher: string;

  // Template options (user-configurable)
  options?: Record<string, TemplateOption>;

  // Platform tags
  platforms?: string[];

  // Keywords
  keywords?: string[];

  // Files that are optional (can be excluded)
  optionalPaths?: string[];

  // Dependencies on other templates
  dependencies?: Record<string, string>;
}

export interface TemplateOption {
  type: "string" | "boolean";
  description: string;
  default?: string | boolean;
  proposals?: string[];
  enum?: string[];
}

// ============================================================================
// Generator Input/Output Types
// ============================================================================

export interface DevContainerGeneratorInput {
  // Naming
  name: string;
  displayName: string;
  description?: string;

  // Base image selection
  base: {
    image: BaseImage;
    version: string;
  };

  // Selected features
  features: FeatureSelectionWithMetadata[];

  // Additional configuration
  config?: {
    // Ports to forward
    forwardPorts?: number[];

    // Environment variables
    env?: Record<string, string>;

    // Post-create command
    postCreateCommand?: string;

    // VS Code extensions
    vscodeExtensions?: string[];

    // VS Code settings
    vscodeSettings?: Record<string, unknown>;

    // Remote user
    remoteUser?: string;

    // Privileged mode
    privileged?: boolean;

    // Custom mounts
    mounts?: DevContainerMount[];
  };

  // Version info
  version?: string;

  // Author info
  author?: {
    name: string;
    email?: string;
  };
}

export interface FeatureSelectionWithMetadata extends FeatureSelection {
  feature: Feature;
}

export interface DevContainerGeneratorOutput {
  // Generated files
  files: GeneratedFile[];

  // Template metadata
  template: DevContainerTemplate;

  // Security info
  security: {
    baseSecurityProfile: SecurityProfile;
    sbomFormats: SBOMFormat[];
    signatureVerified: boolean;
  };

  // Path info
  outputPath: string;
}

export interface GeneratedFile {
  path: string; // Relative path within the output directory
  content: string;
  encoding?: "utf-8" | "base64";
}

// ============================================================================
// Repository Structure
// ============================================================================

/**
 * Structure of the dev-containers repository:
 *
 * dev-containers/
 * ├── README.md
 * ├── src/
 * │   ├── <template-name>/
 * │   │   ├── .devcontainer/
 * │   │   │   └── devcontainer.json
 * │   │   ├── devcontainer-template.json
 * │   │   ├── README.md
 * │   │   ├── NOTES.md
 * │   │   └── .security/
 * │   │       ├── sbom.spdx.json (placeholder)
 * │   │       └── sbom.cyclonedx.json (placeholder)
 * │   └── ...
 * └── collection.json (template collection metadata)
 */

export interface TemplateCollection {
  sourceInformation: {
    repository: string;
    revision?: string;
  };
  templates: string[]; // List of template IDs
  features?: string[]; // Optional feature collection
}
