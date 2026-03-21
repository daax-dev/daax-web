/**
 * DevContainer Generator Tests
 *
 * These tests validate that generated devcontainer configurations:
 * 1. Are valid JSON
 * 2. Have all required fields per the containers.dev spec
 * 3. Have properly formatted features, extensions, and other fields
 * 4. Pass validation
 *
 * Run with: bun run test tests/devcontainers/
 */

import { describe, it, expect } from "vitest";
import {
  generateDevContainerConfig,
  configToJson,
  validateDevContainerConfig,
  parseDevContainerJson,
  type DevContainerConfig,
  type GeneratorInput,
} from "@/lib/devcontainers/generator";
import {
  QUICKSTART_TEMPLATES,
  COMMON_FEATURES,
} from "@/lib/devcontainers/templates";

describe("DevContainer Generator", () => {
  describe("generateDevContainerConfig", () => {
    it("generates a minimal valid config with just name and image", () => {
      const input: GeneratorInput = {
        name: "Test Container",
        baseImage: "mcr.microsoft.com/devcontainers/base:ubuntu",
      };

      const config = generateDevContainerConfig(input);

      expect(config.name).toBe("Test Container");
      expect(config.image).toBe("mcr.microsoft.com/devcontainers/base:ubuntu");
      expect(config.features).toBeUndefined();
      expect(config.customizations).toBeUndefined();
    });

    it("includes features when provided", () => {
      const input: GeneratorInput = {
        name: "Test Container",
        baseImage: "mcr.microsoft.com/devcontainers/base:ubuntu",
        features: {
          "ghcr.io/devcontainers/features/git:1": {},
          "ghcr.io/devcontainers/features/docker-in-docker:2": {
            version: "latest",
            moby: true,
          },
        },
      };

      const config = generateDevContainerConfig(input);

      expect(config.features).toBeDefined();
      expect(Object.keys(config.features!).length).toBe(2);
      expect(config.features!["ghcr.io/devcontainers/features/git:1"]).toEqual(
        {},
      );
      expect(
        config.features!["ghcr.io/devcontainers/features/docker-in-docker:2"],
      ).toEqual({
        version: "latest",
        moby: true,
      });
    });

    it("includes VS Code customizations when extensions or settings provided", () => {
      const input: GeneratorInput = {
        name: "Test Container",
        baseImage: "mcr.microsoft.com/devcontainers/base:ubuntu",
        extensions: ["ms-python.python", "ms-python.vscode-pylance"],
        settings: {
          "editor.formatOnSave": true,
        },
      };

      const config = generateDevContainerConfig(input);

      expect(config.customizations).toBeDefined();
      expect(config.customizations!.vscode).toBeDefined();
      expect(config.customizations!.vscode!.extensions).toEqual([
        "ms-python.python",
        "ms-python.vscode-pylance",
      ]);
      expect(config.customizations!.vscode!.settings).toEqual({
        "editor.formatOnSave": true,
      });
    });

    it("includes all optional fields when provided", () => {
      const input: GeneratorInput = {
        name: "Full Test Container",
        baseImage: "mcr.microsoft.com/devcontainers/python:3.12",
        features: { "ghcr.io/devcontainers/features/git:1": {} },
        extensions: ["ms-python.python"],
        settings: { "python.analysis.typeCheckingMode": "strict" },
        postCreateCommand: "pip install -r requirements.txt",
        forwardPorts: [8000, 5432],
        containerEnv: { DEBUG: "true", PYTHONPATH: "/workspace" },
        remoteUser: "vscode",
        privileged: true,
      };

      const config = generateDevContainerConfig(input);

      expect(config.name).toBe("Full Test Container");
      expect(config.image).toBe("mcr.microsoft.com/devcontainers/python:3.12");
      expect(config.features).toBeDefined();
      expect(config.customizations?.vscode?.extensions).toEqual([
        "ms-python.python",
      ]);
      expect(config.customizations?.vscode?.settings).toEqual({
        "python.analysis.typeCheckingMode": "strict",
      });
      expect(config.postCreateCommand).toBe("pip install -r requirements.txt");
      expect(config.forwardPorts).toEqual([8000, 5432]);
      expect(config.containerEnv).toEqual({
        DEBUG: "true",
        PYTHONPATH: "/workspace",
      });
      expect(config.remoteUser).toBe("vscode");
      expect(config.privileged).toBe(true);
    });
  });

  describe("configToJson", () => {
    it("produces valid JSON", () => {
      const config: DevContainerConfig = {
        name: "Test",
        image: "test:latest",
      };

      const json = configToJson(config);

      expect(() => JSON.parse(json)).not.toThrow();
    });

    it("uses tabs for indentation", () => {
      const config: DevContainerConfig = {
        name: "Test",
        image: "test:latest",
        features: { "ghcr.io/devcontainers/features/git:1": {} },
      };

      const json = configToJson(config);

      // Should contain tabs, not spaces for indentation
      expect(json).toContain("\t");
    });

    it("roundtrips correctly", () => {
      const original: DevContainerConfig = {
        name: "Roundtrip Test",
        image: "mcr.microsoft.com/devcontainers/base:ubuntu",
        features: {
          "ghcr.io/devcontainers/features/git:1": {},
        },
        customizations: {
          vscode: {
            extensions: ["ms-python.python"],
          },
        },
      };

      const json = configToJson(original);
      const parsed = JSON.parse(json);

      expect(parsed.name).toBe(original.name);
      expect(parsed.image).toBe(original.image);
      expect(parsed.features).toEqual(original.features);
      expect(parsed.customizations).toEqual(original.customizations);
    });
  });

  describe("validateDevContainerConfig", () => {
    it("validates a minimal valid config", () => {
      const config: DevContainerConfig = {
        name: "Valid Config",
        image: "test:latest",
      };

      const result = validateDevContainerConfig(config);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("rejects config without name", () => {
      const config = {
        image: "test:latest",
      } as DevContainerConfig;

      const result = validateDevContainerConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("name"))).toBe(true);
    });

    it("rejects config with empty name", () => {
      const config: DevContainerConfig = {
        name: "",
        image: "test:latest",
      };

      const result = validateDevContainerConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("name"))).toBe(true);
    });

    it("rejects config without image, build, or dockerComposeFile", () => {
      const config = {
        name: "No Image",
      } as DevContainerConfig;

      const result = validateDevContainerConfig(config);

      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.includes("image") || e.includes("build")),
      ).toBe(true);
    });

    it("rejects config with both image and build", () => {
      const config: DevContainerConfig = {
        name: "Both Image and Build",
        image: "test:latest",
        build: {
          dockerfile: "Dockerfile",
        },
      };

      const result = validateDevContainerConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("Cannot specify both"))).toBe(
        true,
      );
    });

    it("validates port numbers", () => {
      const validConfig: DevContainerConfig = {
        name: "Valid Ports",
        image: "test:latest",
        forwardPorts: [3000, 8080, 65535],
      };

      const invalidConfig: DevContainerConfig = {
        name: "Invalid Ports",
        image: "test:latest",
        forwardPorts: [0, 70000],
      };

      expect(validateDevContainerConfig(validConfig).valid).toBe(true);

      const invalidResult = validateDevContainerConfig(invalidConfig);
      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.errors.some((e) => e.includes("Invalid port"))).toBe(
        true,
      );
    });

    it("warns about feature references without registry path", () => {
      const config: DevContainerConfig = {
        name: "Local Feature",
        image: "test:latest",
        features: {
          git: {}, // Should warn - no registry path
        },
      };

      const result = validateDevContainerConfig(config);

      expect(result.warnings.some((w) => w.includes("registry path"))).toBe(
        true,
      );
    });

    it("warns about extensions without publisher prefix", () => {
      const config: DevContainerConfig = {
        name: "Bad Extensions",
        image: "test:latest",
        customizations: {
          vscode: {
            extensions: ["python"], // Should be ms-python.python
          },
        },
      };

      const result = validateDevContainerConfig(config);

      expect(
        result.warnings.some((w) => w.includes("publisher.extension")),
      ).toBe(true);
    });
  });

  describe("parseDevContainerJson", () => {
    it("parses valid JSON", () => {
      const json = JSON.stringify({
        name: "Test",
        image: "test:latest",
      });

      const result = parseDevContainerJson(json);

      expect(result.parseError).toBeNull();
      expect(result.config).not.toBeNull();
      expect(result.config!.name).toBe("Test");
      expect(result.validation).not.toBeNull();
    });

    it("reports parse errors for invalid JSON", () => {
      const invalidJson = "{ not valid json }";

      const result = parseDevContainerJson(invalidJson);

      expect(result.parseError).not.toBeNull();
      expect(result.config).toBeNull();
      expect(result.validation).toBeNull();
    });

    it("validates after parsing", () => {
      const json = JSON.stringify({
        name: "",
        // Missing image/build/compose
      });

      const result = parseDevContainerJson(json);

      expect(result.parseError).toBeNull();
      expect(result.config).not.toBeNull();
      expect(result.validation).not.toBeNull();
      expect(result.validation!.valid).toBe(false);
    });
  });

  describe("Quickstart Templates", () => {
    it("all quickstart templates generate valid configs", () => {
      for (const template of QUICKSTART_TEMPLATES) {
        const config = generateDevContainerConfig({
          name: `${template.name} Development`,
          baseImage: template.image,
          features: template.defaultFeatures,
          extensions: template.extensions,
          settings: template.settings,
        });

        const validation = validateDevContainerConfig(config);

        expect(validation.valid).toBe(true);
        expect(validation.errors).toHaveLength(0);

        // Also verify JSON is valid
        const json = configToJson(config);
        expect(() => JSON.parse(json)).not.toThrow();
      }
    });

    it("each quickstart template has required fields", () => {
      for (const template of QUICKSTART_TEMPLATES) {
        expect(template.id).toBeTruthy();
        expect(template.name).toBeTruthy();
        expect(template.description).toBeTruthy();
        expect(template.image).toBeTruthy();
        expect(template.image).toMatch(/^mcr\.microsoft\.com\//);
        expect(template.icon).toBeTruthy();
        expect(template.tags).toBeDefined();
        expect(Array.isArray(template.tags)).toBe(true);
      }
    });
  });

  describe("Common Features", () => {
    it("all common features have valid registry paths", () => {
      for (const feature of COMMON_FEATURES) {
        expect(feature.id).toBeTruthy();
        expect(feature.name).toBeTruthy();
        expect(feature.registry).toBe("ghcr.io");
        expect(feature.repository).toMatch(/^devcontainers\/features\/.+/);
      }
    });

    it("feature references can be constructed correctly", () => {
      for (const feature of COMMON_FEATURES) {
        const featureRef = `${feature.registry}/${feature.repository}:1`;
        expect(featureRef).toMatch(
          /^ghcr\.io\/devcontainers\/features\/.+:\d+$/,
        );
      }
    });
  });
});

describe("DevContainer Spec Compliance", () => {
  it("generated configs match expected schema structure", () => {
    const config = generateDevContainerConfig({
      name: "Schema Test",
      baseImage: "mcr.microsoft.com/devcontainers/base:ubuntu",
      features: {
        "ghcr.io/devcontainers/features/git:1": {},
        "ghcr.io/devcontainers/features/docker-in-docker:2": { moby: true },
      },
      extensions: ["ms-python.python"],
      settings: { "editor.formatOnSave": true },
      postCreateCommand: "echo 'Hello'",
      forwardPorts: [3000],
      containerEnv: { NODE_ENV: "development" },
    });

    // Verify structure matches containers.dev spec
    expect(typeof config.name).toBe("string");
    expect(typeof config.image).toBe("string");
    expect(typeof config.features).toBe("object");
    expect(typeof config.customizations).toBe("object");
    expect(typeof config.customizations!.vscode).toBe("object");
    expect(Array.isArray(config.customizations!.vscode!.extensions)).toBe(true);
    expect(typeof config.customizations!.vscode!.settings).toBe("object");
    expect(typeof config.postCreateCommand).toBe("string");
    expect(Array.isArray(config.forwardPorts)).toBe(true);
    expect(typeof config.containerEnv).toBe("object");
  });

  it("feature options are properly typed", () => {
    const config = generateDevContainerConfig({
      name: "Feature Options Test",
      baseImage: "mcr.microsoft.com/devcontainers/base:ubuntu",
      features: {
        "ghcr.io/devcontainers/features/docker-in-docker:2": {
          version: "latest",
          moby: true,
          dockerDashComposeVersion: "v2",
        },
      },
    });

    const featureOptions = config.features![
      "ghcr.io/devcontainers/features/docker-in-docker:2"
    ] as Record<string, unknown>;

    expect(typeof featureOptions.version).toBe("string");
    expect(typeof featureOptions.moby).toBe("boolean");
    expect(typeof featureOptions.dockerDashComposeVersion).toBe("string");
  });
});
