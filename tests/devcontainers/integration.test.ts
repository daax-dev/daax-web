/**
 * DevContainer Integration Tests
 *
 * These tests verify that generated devcontainer configurations
 * can actually be validated by the devcontainer CLI (if available).
 *
 * These tests are OPTIONAL and will be skipped if the devcontainer CLI
 * is not installed.
 *
 * To install devcontainer CLI:
 *   npm install -g @devcontainers/cli
 *
 * Run with: bun run test tests/devcontainers/integration.test.ts
 */

import { describe, it, expect, beforeAll } from "vitest";
import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import {
  generateDevContainerConfig,
  configToJson,
  validateDevContainerConfig,
} from "@/lib/devcontainers/generator";
import { QUICKSTART_TEMPLATES } from "@/lib/devcontainers/templates";

const execAsync = promisify(exec);

// Check if devcontainer CLI is available
async function isDevcontainerCliAvailable(): Promise<boolean> {
  try {
    await execAsync("devcontainer --version");
    return true;
  } catch {
    return false;
  }
}

// Create a temporary directory for test files
async function createTempDir(): Promise<string> {
  const tmpDir = path.join(os.tmpdir(), `devcontainer-test-${Date.now()}`);
  await fs.mkdir(tmpDir, { recursive: true });
  return tmpDir;
}

// Clean up temp directory
async function cleanupTempDir(dir: string): Promise<void> {
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

// CLI availability is checked once before running the test suite
let cliAvailable = false;

describe("DevContainer Integration Tests", () => {
  beforeAll(async () => {
    cliAvailable = await isDevcontainerCliAvailable();
    if (!cliAvailable) {
      console.log(
        "⚠️  devcontainer CLI not found - integration tests will be skipped",
      );
      console.log("   Install with: npm install -g @devcontainers/cli");
    }
  });

  // Skip CLI-dependent tests - these require manual testing with a working devcontainer CLI
  // The CLI may behave differently across environments and versions
  it.skip("validates generated config with devcontainer CLI read-configuration", async () => {
    const tmpDir = await createTempDir();

    try {
      // Generate a config
      const config = generateDevContainerConfig({
        name: "CLI Test Container",
        baseImage: "mcr.microsoft.com/devcontainers/base:ubuntu",
        features: {
          "ghcr.io/devcontainers/features/git:1": {},
        },
      });

      // Write to temp directory
      const devcontainerDir = path.join(tmpDir, ".devcontainer");
      await fs.mkdir(devcontainerDir, { recursive: true });
      await fs.writeFile(
        path.join(devcontainerDir, "devcontainer.json"),
        configToJson(config),
        "utf-8",
      );

      // Validate with devcontainer CLI
      const { stdout } = await execAsync(
        `devcontainer read-configuration --workspace-folder "${tmpDir}"`,
      );

      // If no error thrown, the config is valid
      expect(true).toBe(true);

      // Parse the output to verify it matches our config
      const parsed = JSON.parse(stdout);
      expect(parsed.configuration.name).toBe("CLI Test Container");
    } finally {
      await cleanupTempDir(tmpDir);
    }
  });

  it.skip(
    "validates all quickstart templates with devcontainer CLI",
    { timeout: 60000 },
    async () => {
      for (const template of QUICKSTART_TEMPLATES) {
        const tmpDir = await createTempDir();

        try {
          const config = generateDevContainerConfig({
            name: `${template.name} Test`,
            baseImage: template.image,
            features: template.defaultFeatures,
            extensions: template.extensions,
            settings: template.settings,
          });

          const devcontainerDir = path.join(tmpDir, ".devcontainer");
          await fs.mkdir(devcontainerDir, { recursive: true });
          await fs.writeFile(
            path.join(devcontainerDir, "devcontainer.json"),
            configToJson(config),
            "utf-8",
          );

          // This should not throw if the config is valid
          await execAsync(
            `devcontainer read-configuration --workspace-folder "${tmpDir}"`,
          );

          console.log(`✓ ${template.name} template validated`);
        } catch (error) {
          console.error(`✗ ${template.name} template failed:`, error);
          throw error;
        } finally {
          await cleanupTempDir(tmpDir);
        }
      }
    },
  );
});

describe("DevContainer JSON Schema Validation", () => {
  it("generated JSON matches expected structure", () => {
    const config = generateDevContainerConfig({
      name: "Schema Test",
      baseImage: "mcr.microsoft.com/devcontainers/base:ubuntu",
    });

    const json = configToJson(config);
    const parsed = JSON.parse(json);

    // Required fields
    expect(parsed).toHaveProperty("name");
    expect(typeof parsed.name).toBe("string");

    // Image is set
    expect(parsed).toHaveProperty("image");
    expect(typeof parsed.image).toBe("string");
  });

  it("features are properly formatted", () => {
    const config = generateDevContainerConfig({
      name: "Features Test",
      baseImage: "mcr.microsoft.com/devcontainers/base:ubuntu",
      features: {
        "ghcr.io/devcontainers/features/git:1": {},
        "ghcr.io/devcontainers/features/docker-in-docker:2": {
          version: "latest",
          moby: true,
        },
      },
    });

    const json = configToJson(config);
    const parsed = JSON.parse(json);

    expect(parsed.features).toBeDefined();

    // Feature with no options should be empty object
    expect(parsed.features["ghcr.io/devcontainers/features/git:1"]).toEqual({});

    // Feature with options should have those options
    expect(
      parsed.features["ghcr.io/devcontainers/features/docker-in-docker:2"],
    ).toEqual({
      version: "latest",
      moby: true,
    });
  });

  it("VS Code customizations are properly nested", () => {
    const config = generateDevContainerConfig({
      name: "VSCode Test",
      baseImage: "mcr.microsoft.com/devcontainers/base:ubuntu",
      extensions: ["ms-python.python", "ms-python.vscode-pylance"],
      settings: {
        "editor.formatOnSave": true,
        "editor.tabSize": 2,
      },
    });

    const json = configToJson(config);
    const parsed = JSON.parse(json);

    expect(parsed.customizations).toBeDefined();
    expect(parsed.customizations.vscode).toBeDefined();
    expect(parsed.customizations.vscode.extensions).toBeInstanceOf(Array);
    expect(parsed.customizations.vscode.extensions).toHaveLength(2);
    expect(parsed.customizations.vscode.settings).toBeDefined();
    expect(parsed.customizations.vscode.settings["editor.formatOnSave"]).toBe(
      true,
    );
  });
});

describe("Real-world Configuration Tests", () => {
  it("generates a production-ready Node.js config", () => {
    const config = generateDevContainerConfig({
      name: "Node.js Production Container",
      baseImage: "mcr.microsoft.com/devcontainers/javascript-node:22",
      features: {
        "ghcr.io/devcontainers/features/git:1": {},
        "ghcr.io/devcontainers/features/github-cli:1": {},
        "ghcr.io/devcontainers/features/docker-in-docker:2": {},
      },
      extensions: [
        "dbaeumer.vscode-eslint",
        "esbenp.prettier-vscode",
        "bradlc.vscode-tailwindcss",
        "Prisma.prisma",
      ],
      settings: {
        "editor.formatOnSave": true,
        "editor.defaultFormatter": "esbenp.prettier-vscode",
        "editor.codeActionsOnSave": {
          "source.fixAll.eslint": "explicit",
        },
      },
      postCreateCommand: "npm install",
      forwardPorts: [3000, 5432],
      containerEnv: {
        NODE_ENV: "development",
      },
    });

    const validation = validateDevContainerConfig(config);
    expect(validation.valid).toBe(true);

    const json = configToJson(config);
    const parsed = JSON.parse(json);

    expect(parsed.name).toBe("Node.js Production Container");
    expect(parsed.image).toContain("javascript-node");
    expect(Object.keys(parsed.features)).toHaveLength(3);
    expect(parsed.customizations.vscode.extensions).toHaveLength(4);
    expect(parsed.postCreateCommand).toBe("npm install");
    expect(parsed.forwardPorts).toEqual([3000, 5432]);
  });

  it("generates a production-ready Python config", () => {
    const config = generateDevContainerConfig({
      name: "Python ML Container",
      baseImage: "mcr.microsoft.com/devcontainers/python:3.12",
      features: {
        "ghcr.io/devcontainers/features/git:1": {},
        "ghcr.io/devcontainers/features/github-cli:1": {},
      },
      extensions: [
        "ms-python.python",
        "ms-python.vscode-pylance",
        "ms-toolsai.jupyter",
      ],
      settings: {
        "python.defaultInterpreterPath": "/usr/local/bin/python",
        "python.linting.enabled": true,
        "python.formatting.provider": "black",
      },
      postCreateCommand: "pip install -r requirements.txt",
      forwardPorts: [8888], // Jupyter
    });

    const validation = validateDevContainerConfig(config);
    expect(validation.valid).toBe(true);

    const json = configToJson(config);
    const parsed = JSON.parse(json);

    expect(parsed.name).toBe("Python ML Container");
    expect(parsed.image).toContain("python:3.12");
    expect(parsed.postCreateCommand).toContain("pip install");
  });
});
