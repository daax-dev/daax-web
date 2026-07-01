/**
 * Tests for the server-side build-info assembly + SBOM whitelist.
 *
 * Mocks node:fs so the SBOM files and package.json are deterministic.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockExistsSync, mockReadFileSync } = vi.hoisted(() => ({
  mockExistsSync: vi.fn<(p: string) => boolean>(),
  mockReadFileSync: vi.fn<(p: string, enc?: string) => string>(),
}));

vi.mock("node:fs", () => ({
  default: { existsSync: mockExistsSync, readFileSync: mockReadFileSync },
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
}));

import {
  collectBuildInfo,
  getDeployment,
  sbomFilePath,
  readRealSbom,
  availableSboms,
} from "@/lib/build/build-info";

// A real CycloneDX SBOM: correct marker, non-empty components, > 512 bytes.
function realCycloneDx(): string {
  const components = Array.from({ length: 20 }, (_, i) => ({
    type: "library",
    name: `pkg-${i}`,
    version: "1.0.0",
    licenses: [{ license: { id: "MIT" } }],
  }));
  return JSON.stringify({
    bomFormat: "CycloneDX",
    specVersion: "1.6",
    components,
  });
}

const PACKAGE_JSON = JSON.stringify({
  version: "0.1.0",
  dependencies: { next: "16.1.6" },
});

describe("getDeployment", () => {
  beforeEach(() => vi.unstubAllEnvs());
  afterEach(() => vi.unstubAllEnvs());

  it("defaults to host mode with no image fields for a from-source build", () => {
    // Ensure a clean slate for the env vars it reads.
    for (const k of [
      "DAAX_DEPLOY_MODE",
      "DAAX_DEPLOY_VIA",
      "DAAX_DEPLOY_BY",
      "DAAX_IMAGE_REGISTRY",
      "DAAX_IMAGE",
      "DAAX_IMAGE_TAG",
      "HOST_WORKSPACE_PATH",
      "DAAX_DEPLOY_HOST",
      "NEXT_PUBLIC_BUILD_HOSTNAME",
    ]) {
      vi.stubEnv(k, "");
    }
    const dep = getDeployment();
    expect(dep.mode).toBe("host");
    expect(dep.via).toBe("host");
    // No container image for a from-source run.
    expect(dep.image).toBeUndefined();
    expect(dep.registry).toBeUndefined();
    expect(dep.workspace).toBeUndefined();
  });

  it("infers container mode from HOST_WORKSPACE_PATH", () => {
    vi.stubEnv("HOST_WORKSPACE_PATH", "/workspace");
    const dep = getDeployment();
    expect(dep?.mode).toBe("container");
    expect(dep?.workspace).toBe("/workspace");
  });

  it("surfaces explicit deployment fields", () => {
    vi.stubEnv("DAAX_DEPLOY_VIA", "github-actions");
    vi.stubEnv("DAAX_DEPLOY_BY", "JPoley");
    vi.stubEnv("DAAX_IMAGE_REGISTRY", "ghcr.io/daax-dev/daax-web");
    vi.stubEnv("DAAX_IMAGE_TAG", "latest");
    const dep = getDeployment();
    expect(dep).toMatchObject({
      via: "github-actions",
      by: "JPoley",
      registry: "ghcr.io/daax-dev/daax-web",
      imageTag: "latest",
    });
  });
});

describe("sbomFilePath (whitelist)", () => {
  it("resolves known pairs to whitelisted filenames", () => {
    expect(sbomFilePath("app", "cyclonedx")).toMatch(/daax\.cyclonedx\.json$/);
    expect(sbomFilePath("app", "spdx")).toMatch(/daax\.spdx\.json$/);
  });

  it("rejects unknown component/format and traversal attempts", () => {
    expect(sbomFilePath("app", "exe")).toBeNull();
    expect(sbomFilePath("web", "cyclonedx")).toBeNull();
    expect(sbomFilePath("../../etc/passwd", "cyclonedx")).toBeNull();
    expect(sbomFilePath("app", "../../../etc/passwd")).toBeNull();
  });
});

describe("readRealSbom / availableSboms", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(false);
  });

  it("returns null when the file is absent", () => {
    expect(readRealSbom("app", "cyclonedx")).toBeNull();
  });

  it("rejects a placeholder ({}) SBOM", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue("{}");
    expect(readRealSbom("app", "cyclonedx")).toBeNull();
  });

  it("returns content for a real SBOM", () => {
    const content = realCycloneDx();
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(content);
    expect(readRealSbom("app", "cyclonedx")).toBe(content);
  });

  it("lists only real, available SBOMs", () => {
    mockExistsSync.mockImplementation((p: string) =>
      p.endsWith("daax.cyclonedx.json"),
    );
    mockReadFileSync.mockReturnValue(realCycloneDx());
    expect(availableSboms()).toEqual([
      { component: "app", format: "cyclonedx" },
    ]);
  });
});

describe("collectBuildInfo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    mockExistsSync.mockReturnValue(false);
    mockReadFileSync.mockImplementation((p: string) => {
      if (p.endsWith("package.json")) return PACKAGE_JSON;
      throw new Error(`unexpected read: ${p}`);
    });
  });
  afterEach(() => vi.unstubAllEnvs());

  it("assembles version, runtime, and next version", () => {
    vi.stubEnv("NEXT_PUBLIC_BUILD_COMMIT", "abcdef1234567890");
    vi.stubEnv("NEXT_PUBLIC_BUILD_BRANCH", "sbom");
    const info = collectBuildInfo();
    expect(info.version).toBe("v0.1.0+abcdef1");
    expect(info.gitSha).toBe("abcdef1234567890");
    expect(info.nextVersion).toBe("16.1.6");
    expect(info.branch).toBe("sbom");
    expect(info.nodeVersion).toBe(process.version);
    expect(info.sbomAvailable).toBe(false);
    expect(info.sboms).toEqual([]);
    // Deployment is always populated with locally-knowable fields.
    expect(info.deployment?.mode).toBe("host");
  });

  it("omits the +sha suffix for a bare dev build", () => {
    // No NEXT_PUBLIC_BUILD_COMMIT → gitSha defaults to 000000.
    const info = collectBuildInfo();
    expect(info.gitSha).toBe("000000");
    expect(info.version).toBe("v0.1.0");
  });
});
