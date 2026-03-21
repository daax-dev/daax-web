/**
 * DevContainer Generator
 *
 * Generates devcontainer configurations following the official spec at containers.dev
 * Outputs to the dev-containers repository for versioned, hardened templates.
 */

import * as fs from "fs/promises";
import * as path from "path";
import type {
  DevContainerJson,
  DevContainerTemplate,
  DevContainerGeneratorInput,
  DevContainerGeneratorOutput,
  GeneratedFile,
  TemplateCollection,
} from "./types";
import type { SBOMFormat } from "@/types/catalog";

// Repository paths
const DEV_CONTAINERS_REPO = path.resolve(process.cwd(), "../dev-containers");
const SRC_DIR = path.join(DEV_CONTAINERS_REPO, "src");

// ============================================================================
// Main Generator Functions
// ============================================================================

/**
 * Generate a complete devcontainer template from the input configuration
 */
export function generateDevContainer(
  input: DevContainerGeneratorInput,
): DevContainerGeneratorOutput {
  const templateId = slugify(input.name);
  const outputPath = path.join(SRC_DIR, templateId);

  // Generate devcontainer.json
  const devcontainerJson = generateDevContainerJson(input);

  // Generate template metadata
  const template = generateTemplateMetadata(input, templateId);

  // Generate README
  const readme = generateReadme(input);

  // Generate NOTES.md
  const notes = generateNotes(input);

  // Generate SBOM placeholders
  const sbomFiles = generateSBOMPlaceholders(input, templateId);

  const files: GeneratedFile[] = [
    {
      path: ".devcontainer/devcontainer.json",
      content: JSON.stringify(devcontainerJson, null, "\t"),
    },
    {
      path: "devcontainer-template.json",
      content: JSON.stringify(template, null, 4),
    },
    {
      path: "README.md",
      content: readme,
    },
    {
      path: "NOTES.md",
      content: notes,
    },
    ...sbomFiles,
  ];

  return {
    files,
    template,
    security: {
      baseSecurityProfile: input.base.image.securityProfile,
      sbomFormats: ["spdx-2.3", "cyclonedx-1.6"],
      signatureVerified: input.base.image.securityProfile.signatureVerified,
    },
    outputPath,
  };
}

/**
 * Generate the devcontainer.json file content
 */
export function generateDevContainerJson(
  input: DevContainerGeneratorInput,
): DevContainerJson {
  const { base, features, config } = input;

  // Build the image reference
  const imageRef = `${base.image.registry}/${base.image.repository}:${base.version}`;

  // Build features object
  const featuresObj: Record<
    string,
    string | boolean | Record<string, unknown>
  > = {};
  for (const f of features) {
    const featureRef = `${f.feature.registry}/${f.feature.repository}:${f.version}`;
    if (Object.keys(f.options).length > 0) {
      featuresObj[featureRef] = f.options;
    } else {
      featuresObj[featureRef] = true;
    }
  }

  const devcontainer: DevContainerJson = {
    name: input.displayName,
    image: imageRef,
  };

  // Add features if any selected
  if (Object.keys(featuresObj).length > 0) {
    devcontainer.features = featuresObj;
  }

  // Add port forwarding
  if (config?.forwardPorts && config.forwardPorts.length > 0) {
    devcontainer.forwardPorts = config.forwardPorts;
  }

  // Add environment variables
  if (config?.env && Object.keys(config.env).length > 0) {
    devcontainer.containerEnv = config.env;
  }

  // Add post-create command
  if (config?.postCreateCommand) {
    devcontainer.postCreateCommand = config.postCreateCommand;
  }

  // Add VS Code customizations
  if (config?.vscodeExtensions || config?.vscodeSettings) {
    devcontainer.customizations = {
      vscode: {},
    };
    if (config.vscodeExtensions && config.vscodeExtensions.length > 0) {
      devcontainer.customizations.vscode!.extensions = config.vscodeExtensions;
    }
    if (
      config.vscodeSettings &&
      Object.keys(config.vscodeSettings).length > 0
    ) {
      devcontainer.customizations.vscode!.settings = config.vscodeSettings;
    }
  }

  // Add remote user
  if (config?.remoteUser) {
    devcontainer.remoteUser = config.remoteUser;
  }

  // Add privileged mode if needed
  if (config?.privileged) {
    devcontainer.privileged = true;
  }

  // Add mounts
  if (config?.mounts && config.mounts.length > 0) {
    devcontainer.mounts = config.mounts;
  }

  return devcontainer;
}

/**
 * Generate the devcontainer-template.json metadata file
 */
export function generateTemplateMetadata(
  input: DevContainerGeneratorInput,
  templateId: string,
): DevContainerTemplate {
  const version = input.version || "1.0.0";

  // Generate options from base image versions
  const options: Record<
    string,
    {
      type: "string";
      description: string;
      proposals: string[];
      default: string;
    }
  > = {};

  if (input.base.image.versions.length > 1) {
    options.imageVariant = {
      type: "string",
      description: `${input.base.image.name} version:`,
      proposals: input.base.image.versions.map((v) => v.tag),
      default: input.base.version,
    };
  }

  // Add feature version options
  for (const f of input.features) {
    if (f.feature.versions.length > 1) {
      const optionId = `${slugify(f.feature.id)}Version`;
      options[optionId] = {
        type: "string",
        description: `${f.feature.name} version:`,
        proposals: f.feature.versions.map((v) => v.tag),
        default: f.version,
      };
    }
  }

  const template: DevContainerTemplate = {
    id: templateId,
    version,
    name: input.displayName,
    description:
      input.description ||
      `Hardened ${input.displayName} development environment`,
    documentationURL: `https://github.com/jpoley/dev-containers/tree/main/src/${templateId}`,
    licenseURL: "https://github.com/jpoley/dev-containers/blob/main/LICENSE",
    publisher: input.author?.name || "Daax",
    platforms: derivePlatforms(input),
    keywords: deriveKeywords(input),
  };

  if (Object.keys(options).length > 0) {
    template.options = options;
  }

  return template;
}

/**
 * Generate README.md for the template
 */
export function generateReadme(input: DevContainerGeneratorInput): string {
  const securityBadges = generateSecurityBadges(input);
  const featuresList = input.features
    .map(
      (f) =>
        `- **${f.feature.name}** (${f.version}) - ${f.feature.description}`,
    )
    .join("\n");

  return `# ${input.displayName}

${input.description || `Hardened ${input.displayName} development environment.`}

${securityBadges}

## Base Image

- **Image**: \`${input.base.image.registry}/${input.base.image.repository}:${input.base.version}\`
- **Hardening Level**: ${input.base.image.securityProfile.hardeningLevel}
- **Architecture**: ${input.base.image.architecture.join(", ")}

## Features

${featuresList || "No additional features selected."}

## Security

This devcontainer is built on a hardened base image with:

${input.base.image.securityProfile.signatureVerified ? "- ✅ Signature verified" : "- ⚠️ Signature not verified"}
${input.base.image.securityProfile.sbomAvailable ? "- ✅ SBOM available" : "- ⚠️ SBOM not available"}
${input.base.image.securityProfile.attestationsAvailable ? "- ✅ Attestations available" : "- ⚠️ Attestations not available"}

### Provenance

- **Source**: ${input.base.image.securityProfile.provenance.source}
- **Build Platform**: ${input.base.image.securityProfile.provenance.buildPlatform}
- **Reproducible**: ${input.base.image.securityProfile.provenance.reproducible ? "Yes" : "No"}

## Usage

### VS Code

1. Install the [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)
2. Open this folder in VS Code
3. Click "Reopen in Container" when prompted

### CLI

\`\`\`bash
devcontainer build --workspace-folder .
devcontainer up --workspace-folder .
\`\`\`

## License

See [LICENSE](../../LICENSE) for details.
`;
}

/**
 * Generate NOTES.md for the template
 */
export function generateNotes(input: DevContainerGeneratorInput): string {
  const versionNotes = input.base.image.versions
    .slice(0, 5)
    .map((v) => `- \`${v.tag}\` (${formatBytes(v.size)})`)
    .join("\n");

  return `## Available Versions

${versionNotes}

## Security Notes

- This image uses hardened base images from Docker Hub Hardened Images (DHI)
- SBOM files are available in the \`.security/\` directory
- Vulnerability scans are run on each version

## Feature Options

${input.features
  .map((f) => {
    const opts = f.feature.options
      .map((o) => `  - \`${o.id}\`: ${o.description} (default: ${o.default})`)
      .join("\n");
    return `### ${f.feature.name}\n${opts || "  No configurable options."}`;
  })
  .join("\n\n")}
`;
}

/**
 * Generate SBOM placeholder files
 */
export function generateSBOMPlaceholders(
  input: DevContainerGeneratorInput,
  templateId: string,
): GeneratedFile[] {
  const now = new Date().toISOString();

  // SPDX 2.3 placeholder
  const spdxSbom = {
    spdxVersion: "SPDX-2.3",
    dataLicense: "CC0-1.0",
    SPDXID: "SPDXRef-DOCUMENT",
    name: `${templateId}-sbom`,
    documentNamespace: `https://github.com/jpoley/dev-containers/src/${templateId}`,
    creationInfo: {
      created: now,
      creators: ["Tool: Daax-1.0.0"],
      comment: "Placeholder SBOM - will be populated during build",
    },
    packages: [
      {
        name: input.base.image.repository,
        SPDXID: "SPDXRef-Package-base",
        versionInfo: input.base.version,
        downloadLocation: `docker://${input.base.image.registry}/${input.base.image.repository}:${input.base.version}`,
        filesAnalyzed: false,
      },
    ],
    relationships: [
      {
        spdxElementId: "SPDXRef-DOCUMENT",
        relatedSpdxElement: "SPDXRef-Package-base",
        relationshipType: "DESCRIBES",
      },
    ],
  };

  // CycloneDX 1.6 placeholder
  const cyclonedxSbom = {
    $schema: "http://cyclonedx.org/schema/bom-1.6.schema.json",
    bomFormat: "CycloneDX",
    specVersion: "1.6",
    serialNumber: `urn:uuid:${generateUUID()}`,
    version: 1,
    metadata: {
      timestamp: now,
      tools: {
        components: [
          {
            type: "application",
            name: "Daax",
            version: "1.0.0",
          },
        ],
      },
      component: {
        type: "container",
        name: templateId,
        version: input.version || "1.0.0",
      },
    },
    components: [
      {
        type: "container",
        name: input.base.image.repository,
        version: input.base.version,
        purl: `pkg:docker/${input.base.image.registry}/${input.base.image.repository}@${input.base.version}`,
      },
      ...input.features.map((f) => ({
        type: "library" as const,
        name: f.feature.repository,
        version: f.version,
        purl: `pkg:oci/${f.feature.registry}/${f.feature.repository}@${f.version}`,
      })),
    ],
  };

  return [
    {
      path: ".security/sbom.spdx.json",
      content: JSON.stringify(spdxSbom, null, 2),
    },
    {
      path: ".security/sbom.cyclonedx.json",
      content: JSON.stringify(cyclonedxSbom, null, 2),
    },
  ];
}

// ============================================================================
// Write Functions
// ============================================================================

/**
 * Write all generated files to the dev-containers repository
 */
export async function writeDevContainer(
  output: DevContainerGeneratorOutput,
): Promise<void> {
  // Ensure the src directory exists
  await fs.mkdir(SRC_DIR, { recursive: true });

  // Create the template directory
  await fs.mkdir(output.outputPath, { recursive: true });

  // Write each file
  for (const file of output.files) {
    const filePath = path.join(output.outputPath, file.path);
    const fileDir = path.dirname(filePath);

    // Ensure directory exists
    await fs.mkdir(fileDir, { recursive: true });

    // Write the file
    await fs.writeFile(filePath, file.content, "utf-8");
  }

  // Update the collection.json at the repo root
  await updateCollectionJson(output.template.id);
}

/**
 * Update or create the collection.json file
 */
async function updateCollectionJson(templateId: string): Promise<void> {
  const collectionPath = path.join(DEV_CONTAINERS_REPO, "collection.json");

  let collection: TemplateCollection;

  try {
    const content = await fs.readFile(collectionPath, "utf-8");
    collection = JSON.parse(content);
  } catch {
    // Create new collection if doesn't exist
    collection = {
      sourceInformation: {
        repository: "https://github.com/jpoley/dev-containers",
      },
      templates: [],
    };
  }

  // Add template if not already present
  if (!collection.templates.includes(templateId)) {
    collection.templates.push(templateId);
    collection.templates.sort();
  }

  await fs.writeFile(
    collectionPath,
    JSON.stringify(collection, null, 2),
    "utf-8",
  );
}

/**
 * Update the repository README.md with the new template
 */
export async function updateRepoReadme(): Promise<void> {
  const readmePath = path.join(DEV_CONTAINERS_REPO, "README.md");
  const collectionPath = path.join(DEV_CONTAINERS_REPO, "collection.json");

  let templates: string[] = [];
  try {
    const content = await fs.readFile(collectionPath, "utf-8");
    const collection: TemplateCollection = JSON.parse(content);
    templates = collection.templates;
  } catch {
    // No templates yet
  }

  const templateList = templates.map((t) => `- [${t}](./src/${t}/)`).join("\n");

  const readme = `# Hardened Dev Containers

A collection of hardened devcontainer templates built with Docker Hub Hardened Images (DHI).

## Features

- 🔒 **Hardened Base Images** - Built on verified, hardened base images
- 📦 **SBOM Included** - Software Bill of Materials in SPDX and CycloneDX formats
- ✅ **Signed & Verified** - Image signatures and attestations
- 🛡️ **Vulnerability Scanning** - Regular security scans with Trivy/Grype

## Available Templates

${templateList || "_No templates yet. Create one using Daax!_"}

## Usage

### With VS Code

1. Install the [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)
2. Clone this repo
3. Open any template folder
4. Click "Reopen in Container"

### With devcontainer CLI

\`\`\`bash
npm install -g @devcontainers/cli
devcontainer up --workspace-folder ./src/<template-name>
\`\`\`

## Creating New Templates

Use [Daax](https://github.com/jpoley/daax) to create new hardened devcontainer templates:

1. Open Daax
2. Go to Image Catalog > Create DevContainer
3. Select a hardened base image
4. Add devcontainer features
5. Click "Generate" to create the template

## Security

All templates in this repository:

- Use hardened base images from Docker Hub Hardened Images
- Include SBOM files in multiple formats (SPDX 2.3, CycloneDX 1.6)
- Have verified signatures and provenance attestations
- Are regularly scanned for vulnerabilities

## License

MIT License - See [LICENSE](./LICENSE) for details.
`;

  await fs.writeFile(readmePath, readme, "utf-8");
}

// ============================================================================
// Helper Functions
// ============================================================================

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function derivePlatforms(input: DevContainerGeneratorInput): string[] {
  const platforms = new Set<string>();

  // Add base image category
  if (input.base.image.category === "runtime") {
    platforms.add(input.base.image.name);
  }

  // Add feature platforms
  for (const f of input.features) {
    for (const tag of f.feature.tags) {
      if (
        [
          "python",
          "node",
          "go",
          "rust",
          "java",
          "typescript",
          "javascript",
        ].includes(tag.toLowerCase())
      ) {
        platforms.add(capitalize(tag));
      }
    }
  }

  return Array.from(platforms);
}

function deriveKeywords(input: DevContainerGeneratorInput): string[] {
  const keywords = new Set<string>(["devcontainer", "hardened", "secure"]);

  // Add base image keywords
  keywords.add(input.base.image.id);
  if (input.base.image.category === "os") {
    keywords.add(input.base.image.name.toLowerCase());
  }

  // Add feature keywords
  for (const f of input.features) {
    for (const tag of f.feature.tags) {
      keywords.add(tag);
    }
  }

  return Array.from(keywords).slice(0, 10);
}

function generateSecurityBadges(input: DevContainerGeneratorInput): string {
  const badges: string[] = [];
  const sp = input.base.image.securityProfile;

  if (sp.hardeningLevel === "strict") {
    badges.push(
      "![Hardened](https://img.shields.io/badge/hardening-strict-green)",
    );
  } else if (sp.hardeningLevel === "standard") {
    badges.push(
      "![Hardened](https://img.shields.io/badge/hardening-standard-yellow)",
    );
  }

  if (sp.signatureVerified) {
    badges.push("![Signed](https://img.shields.io/badge/signed-verified-blue)");
  }

  if (sp.sbomAvailable) {
    badges.push("![SBOM](https://img.shields.io/badge/SBOM-available-purple)");
  }

  return badges.join(" ");
}

function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(0)} MB`;
  return `${(bytes / 1_000).toFixed(0)} KB`;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate the generated devcontainer configuration
 */
export function validateDevContainer(
  output: DevContainerGeneratorOutput,
): string[] {
  const errors: string[] = [];

  // Check devcontainer.json exists
  const hasDevcontainerJson = output.files.some(
    (f) => f.path === ".devcontainer/devcontainer.json",
  );
  if (!hasDevcontainerJson) {
    errors.push("Missing devcontainer.json");
  }

  // Check template metadata
  if (!output.template.id) {
    errors.push("Template ID is required");
  }
  if (!output.template.name) {
    errors.push("Template name is required");
  }

  return errors;
}

// ============================================================================
// Repository Status
// ============================================================================

/**
 * Check if the dev-containers repository exists and is initialized
 */
export async function checkRepoStatus(): Promise<{
  exists: boolean;
  initialized: boolean;
  templateCount: number;
}> {
  try {
    await fs.access(DEV_CONTAINERS_REPO);

    // Check if it's a git repo
    try {
      await fs.access(path.join(DEV_CONTAINERS_REPO, ".git"));
    } catch {
      return { exists: true, initialized: false, templateCount: 0 };
    }

    // Count templates
    let templateCount = 0;
    try {
      const collectionContent = await fs.readFile(
        path.join(DEV_CONTAINERS_REPO, "collection.json"),
        "utf-8",
      );
      const collection: TemplateCollection = JSON.parse(collectionContent);
      templateCount = collection.templates.length;
    } catch {
      // No collection.json yet
    }

    return { exists: true, initialized: true, templateCount };
  } catch {
    return { exists: false, initialized: false, templateCount: 0 };
  }
}

/**
 * List all templates in the repository
 */
export async function listTemplates(): Promise<string[]> {
  try {
    const collectionContent = await fs.readFile(
      path.join(DEV_CONTAINERS_REPO, "collection.json"),
      "utf-8",
    );
    const collection: TemplateCollection = JSON.parse(collectionContent);
    return collection.templates;
  } catch {
    return [];
  }
}
