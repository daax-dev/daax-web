/**
 * DevContainer Configuration Generator
 *
 * Generates devcontainer.json files following the official specification at containers.dev
 * This is a clean, testable implementation focused on creating valid configurations.
 */

/**
 * DevContainer JSON Schema (per containers.dev spec)
 * @see https://containers.dev/implementors/json_reference/
 */
export interface DevContainerConfig {
  // Metadata
  name: string;

  // Image-based configuration (choose one: image, build, or dockerComposeFile)
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

  // Features (devcontainer features)
  features?: Record<string, Record<string, unknown> | boolean>;

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

/**
 * Input for generating a devcontainer configuration
 */
export interface GeneratorInput {
  name: string;
  baseImage: string;
  features?: Record<string, Record<string, unknown>>;
  extensions?: string[];
  settings?: Record<string, unknown>;
  postCreateCommand?: string;
  forwardPorts?: number[];
  containerEnv?: Record<string, string>;
  remoteUser?: string;
  privileged?: boolean;
  mounts?: DevContainerMount[];
  workspaceFolder?: string;
}

/**
 * Generate a devcontainer configuration from input
 */
export function generateDevContainerConfig(
  input: GeneratorInput,
): DevContainerConfig {
  const config: DevContainerConfig = {
    name: input.name,
    image: input.baseImage,
  };

  // Add features if provided
  if (input.features && Object.keys(input.features).length > 0) {
    config.features = {};
    for (const [featureRef, options] of Object.entries(input.features)) {
      // If options is empty object, just set to empty object (not true)
      config.features[featureRef] = options;
    }
  }

  // Add VS Code customizations if extensions or settings provided
  if ((input.extensions && input.extensions.length > 0) || input.settings) {
    config.customizations = {
      vscode: {},
    };
    if (input.extensions && input.extensions.length > 0) {
      config.customizations.vscode!.extensions = input.extensions;
    }
    if (input.settings && Object.keys(input.settings).length > 0) {
      config.customizations.vscode!.settings = input.settings;
    }
  }

  // Add post-create command
  if (input.postCreateCommand) {
    config.postCreateCommand = input.postCreateCommand;
  }

  // Add port forwarding
  if (input.forwardPorts && input.forwardPorts.length > 0) {
    config.forwardPorts = input.forwardPorts;
  }

  // Add environment variables
  if (input.containerEnv && Object.keys(input.containerEnv).length > 0) {
    config.containerEnv = input.containerEnv;
  }

  // Add remote user
  if (input.remoteUser) {
    config.remoteUser = input.remoteUser;
  }

  // Add privileged mode
  if (input.privileged) {
    config.privileged = true;
  }

  // Add mounts
  if (input.mounts && input.mounts.length > 0) {
    config.mounts = input.mounts;
  }

  // Add workspace folder
  if (input.workspaceFolder) {
    config.workspaceFolder = input.workspaceFolder;
  }

  return config;
}

/**
 * Convert config to JSON string with proper formatting
 */
export function configToJson(config: DevContainerConfig): string {
  // Use tabs for indentation as per devcontainer convention
  return JSON.stringify(config, null, "\t");
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate a devcontainer configuration against the spec
 */
export function validateDevContainerConfig(
  config: DevContainerConfig,
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required: name
  if (
    !config.name ||
    typeof config.name !== "string" ||
    config.name.trim() === ""
  ) {
    errors.push("'name' is required and must be a non-empty string");
  }

  // Must have one of: image, build, or dockerComposeFile
  const hasImage = Boolean(config.image);
  const hasBuild = Boolean(config.build);
  const hasCompose = Boolean(config.dockerComposeFile);

  if (!hasImage && !hasBuild && !hasCompose) {
    errors.push(
      "Must specify one of: 'image', 'build', or 'dockerComposeFile'",
    );
  }

  // Can't have both image and build
  if (hasImage && hasBuild) {
    errors.push("Cannot specify both 'image' and 'build'");
  }

  // Validate image format
  if (config.image) {
    // Basic image reference validation
    const imageRegex = /^[\w.\-/:]+$/;
    if (!imageRegex.test(config.image)) {
      errors.push(`Invalid image reference: ${config.image}`);
    }
  }

  // Validate build configuration
  if (config.build) {
    if (!config.build.dockerfile && !config.build.context) {
      warnings.push("'build' should specify either 'dockerfile' or 'context'");
    }
  }

  // Validate features format
  if (config.features) {
    for (const [ref, options] of Object.entries(config.features)) {
      // Feature references should be registry paths or local paths
      if (
        !ref.includes("/") &&
        !ref.startsWith("./") &&
        !ref.startsWith("../")
      ) {
        warnings.push(
          `Feature reference '${ref}' should include registry path (e.g., ghcr.io/devcontainers/features/git:1)`,
        );
      }

      // Options should be object or boolean
      if (typeof options !== "object" && typeof options !== "boolean") {
        errors.push(
          `Feature options for '${ref}' must be an object or boolean`,
        );
      }
    }
  }

  // Validate forwardPorts
  if (config.forwardPorts) {
    for (const port of config.forwardPorts) {
      if (typeof port === "number") {
        if (port < 1 || port > 65535) {
          errors.push(`Invalid port number: ${port}`);
        }
      } else if (typeof port === "string") {
        // String format: "host:container" or just port number as string
        const portRegex = /^\d+(?::\d+)?$/;
        if (!portRegex.test(port)) {
          errors.push(`Invalid port format: ${port}`);
        }
      }
    }
  }

  // Validate lifecycle commands
  const lifecycleCommands = [
    "initializeCommand",
    "onCreateCommand",
    "updateContentCommand",
    "postCreateCommand",
    "postStartCommand",
    "postAttachCommand",
  ] as const;

  for (const cmd of lifecycleCommands) {
    const value = config[cmd];
    if (value !== undefined) {
      if (
        typeof value !== "string" &&
        !Array.isArray(value) &&
        typeof value !== "object"
      ) {
        errors.push(`'${cmd}' must be a string, array, or object`);
      }
    }
  }

  // Validate VS Code extensions format
  if (config.customizations?.vscode?.extensions) {
    for (const ext of config.customizations.vscode.extensions) {
      // Extensions should be in format "publisher.extension"
      if (!ext.includes(".")) {
        warnings.push(
          `Extension '${ext}' should be in format 'publisher.extension'`,
        );
      }
    }
  }

  // Validate waitFor
  if (config.waitFor) {
    const validWaitFor = [
      "initializeCommand",
      "onCreateCommand",
      "updateContentCommand",
      "postCreateCommand",
      "postStartCommand",
    ];
    if (!validWaitFor.includes(config.waitFor)) {
      errors.push(`Invalid 'waitFor' value: ${config.waitFor}`);
    }
  }

  // Validate hostRequirements
  if (config.hostRequirements) {
    if (
      config.hostRequirements.cpus !== undefined &&
      config.hostRequirements.cpus < 1
    ) {
      errors.push("'hostRequirements.cpus' must be at least 1");
    }
    if (config.hostRequirements.memory !== undefined) {
      const memoryRegex = /^\d+(\.\d+)?\s*(gb|mb|kb)?$/i;
      if (!memoryRegex.test(config.hostRequirements.memory)) {
        warnings.push(
          "'hostRequirements.memory' should be in format like '4gb' or '4096mb'",
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Parse and validate a devcontainer.json string
 */
export function parseDevContainerJson(json: string): {
  config: DevContainerConfig | null;
  parseError: string | null;
  validation: ValidationResult | null;
} {
  try {
    const config = JSON.parse(json) as DevContainerConfig;
    const validation = validateDevContainerConfig(config);
    return {
      config,
      parseError: null,
      validation,
    };
  } catch (e) {
    return {
      config: null,
      parseError: e instanceof Error ? e.message : "Failed to parse JSON",
      validation: null,
    };
  }
}

/**
 * Generate file contents for a complete .devcontainer directory
 */
export interface GeneratedFiles {
  "devcontainer.json": string;
  "README.md"?: string;
}

export function generateDevContainerFiles(
  config: DevContainerConfig,
): GeneratedFiles {
  const files: GeneratedFiles = {
    "devcontainer.json": configToJson(config),
  };

  // Generate a simple README
  const readme = `# Development Container

This development container is configured for ${config.name}.

## Base Image

\`${config.image || "Custom Dockerfile"}\`

## Features

${
  config.features
    ? Object.keys(config.features)
        .map((f) => `- ${f}`)
        .join("\n")
    : "No additional features configured."
}

## VS Code Extensions

${config.customizations?.vscode?.extensions?.map((e) => `- ${e}`).join("\n") || "No extensions configured."}

## Usage

1. Open this folder in VS Code
2. When prompted, click "Reopen in Container"
3. Wait for the container to build and start

Alternatively, use the Dev Containers CLI:

\`\`\`bash
devcontainer up --workspace-folder .
\`\`\`
`;

  files["README.md"] = readme;

  return files;
}
