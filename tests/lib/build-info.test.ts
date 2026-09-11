/**
 * Tests for the server-side build-info assembly + SBOM read path.
 *
 * These use a REAL temporary SBOM directory (no node:fs mock) so the defensive
 * read path — size cap, symlink containment, placeholder guard, and format
 * mismatch — is actually exercised, not stubbed away.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  symlinkSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  collectBuildInfo,
  displayVersion,
  getDeployment,
  sbomFilePath,
  readSbom,
  availableSboms,
  positiveIntEnv,
} from "@/lib/build/build-info";
import { buildSummary } from "@/lib/build/build-env";

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

function realSpdx(): string {
  const packages = Array.from({ length: 20 }, (_, i) => ({
    name: `pkg-${i}`,
    versionInfo: "1.0.0",
    licenseConcluded: "MIT",
  }));
  return JSON.stringify({ spdxVersion: "SPDX-2.3", packages });
}

let sbomDir: string;

beforeEach(() => {
  vi.unstubAllEnvs();
  sbomDir = mkdtempSync(path.join(tmpdir(), "daax-sbom-"));
  vi.stubEnv("DAAX_SBOM_DIR", sbomDir);
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(sbomDir, { recursive: true, force: true });
});

describe("positiveIntEnv", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("returns the value only for a positive integer", () => {
    vi.stubEnv("T_INT", "8");
    expect(positiveIntEnv("T_INT", 99)).toBe(8);
  });

  it("falls back for unset, empty, zero, negative, fractional, or NaN", () => {
    expect(positiveIntEnv("T_UNSET", 99)).toBe(99);
    for (const [v, label] of [
      ["", "empty"],
      ["0", "zero"],
      ["-5", "negative"],
      ["2.5", "fractional"],
      ["abc", "NaN"],
    ] as const) {
      vi.stubEnv("T_VAL", v);
      expect(positiveIntEnv("T_VAL", 99), label).toBe(99);
    }
  });
});

describe("getDeployment", () => {
  it("defaults to host mode with no image fields for a from-source build", () => {
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
    expect(dep.image).toBeUndefined();
    expect(dep.registry).toBeUndefined();
    expect(dep.workspace).toBeUndefined();
  });

  it("names the build host as the deploy host only in host mode", () => {
    vi.stubEnv("DAAX_DEPLOY_HOST", "");
    vi.stubEnv("NEXT_PUBLIC_BUILD_HOSTNAME", "chamonix");
    vi.stubEnv("HOST_WORKSPACE_PATH", "");
    vi.stubEnv("DAAX_DEPLOY_MODE", "");
    expect(getDeployment().host).toBe("chamonix");
    // Container mode: the image was built elsewhere (buildkit sandbox / CI),
    // so only an explicit DAAX_DEPLOY_HOST is trusted.
    vi.stubEnv("HOST_WORKSPACE_PATH", "/workspace");
    expect(getDeployment().host).toBeUndefined();
    vi.stubEnv("DAAX_DEPLOY_HOST", "kinsale");
    expect(getDeployment().host).toBe("kinsale");
  });

  it("infers container mode from HOST_WORKSPACE_PATH", () => {
    vi.stubEnv("HOST_WORKSPACE_PATH", "/workspace");
    const dep = getDeployment();
    expect(dep.mode).toBe("container");
    expect(dep.workspace).toBe("/workspace");
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

describe("readSbom (real filesystem)", () => {
  const write = (name: string, content: string) =>
    writeFileSync(path.join(sbomDir, name), content);

  it("returns not-found when the file is absent", () => {
    expect(readSbom("app", "cyclonedx")).toEqual({
      ok: false,
      reason: "not-found",
    });
  });

  it("returns content for a real CycloneDX SBOM", () => {
    const content = realCycloneDx();
    write("daax.cyclonedx.json", content);
    expect(readSbom("app", "cyclonedx")).toEqual({
      ok: true,
      content,
      format: "cyclonedx",
    });
  });

  it("rejects a placeholder ({}) SBOM", () => {
    write("daax.cyclonedx.json", "{}");
    expect(readSbom("app", "cyclonedx")).toEqual({
      ok: false,
      reason: "placeholder",
    });
  });

  it("rejects an oversized file before parsing", () => {
    vi.stubEnv("DAAX_SBOM_MAX_BYTES", "1000");
    write("daax.cyclonedx.json", realCycloneDx()); // > 1000 bytes
    expect(readSbom("app", "cyclonedx")).toEqual({
      ok: false,
      reason: "oversize",
    });
  });

  it("flags a format mismatch (SPDX content in the CycloneDX slot)", () => {
    write("daax.cyclonedx.json", realSpdx());
    expect(readSbom("app", "cyclonedx")).toEqual({
      ok: false,
      reason: "mismatch",
    });
  });

  it("rejects a symlink escaping the SBOM directory", () => {
    const outside = mkdtempSync(path.join(tmpdir(), "daax-outside-"));
    try {
      writeFileSync(path.join(outside, "secret.json"), realCycloneDx());
      symlinkSync(
        path.join(outside, "secret.json"),
        path.join(sbomDir, "daax.cyclonedx.json"),
      );
      expect(readSbom("app", "cyclonedx")).toEqual({
        ok: false,
        reason: "error",
      });
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it("lists only real, available SBOMs", () => {
    write("daax.cyclonedx.json", realCycloneDx());
    expect(availableSboms()).toEqual([
      { component: "app", format: "cyclonedx" },
    ]);
    write("daax.spdx.json", realSpdx());
    expect(availableSboms()).toEqual([
      { component: "app", format: "cyclonedx" },
      { component: "app", format: "spdx" },
    ]);
  });
});

describe("collectBuildInfo", () => {
  beforeEach(() => {
    // sbomDir is a fresh empty temp dir → no SBOMs available.
    mkdirSync(sbomDir, { recursive: true });
  });

  it("assembles version, runtime, deployment, and empty SBOM set", () => {
    vi.stubEnv("NEXT_PUBLIC_BUILD_VERSION", "");
    vi.stubEnv("NEXT_PUBLIC_BUILD_COMMIT", "abcdef1234567890");
    vi.stubEnv("NEXT_PUBLIC_BUILD_TIME", "2026-09-09T10:00:00Z");
    vi.stubEnv("NEXT_PUBLIC_BUILD_BRANCH", "sbom");
    const info = collectBuildInfo();
    // No stamped VERSION → derived from the real package.json ("vX.Y.Z+<sha7>").
    expect(info.version).toMatch(/^v\d+\.\d+\.\d+\+abcdef1$/);
    expect(info.packageVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(info.gitSha).toBe("abcdef1234567890");
    expect(info.buildTime).toBe("2026-09-09T10:00:00Z");
    expect(info.nextVersion).toBeTruthy();
    expect(info.branch).toBe("sbom");
    expect(info.nodeVersion).toBe(process.version);
    expect(info.sbomAvailable).toBe(false);
    expect(info.sboms).toEqual([]);
    expect(info.deployment?.mode).toBe("host");
  });

  it("uses a stamped VERSION verbatim (release tag / git describe)", () => {
    vi.stubEnv("NEXT_PUBLIC_BUILD_VERSION", "v1.4.0-3-gabc1234-dirty");
    vi.stubEnv("NEXT_PUBLIC_BUILD_COMMIT", "abc1234abc1234");
    expect(collectBuildInfo().version).toBe("v1.4.0-3-gabc1234-dirty");
  });

  it("reports the sentinels, not a guess, for an unstamped build", () => {
    vi.stubEnv("NEXT_PUBLIC_BUILD_VERSION", "");
    vi.stubEnv("NEXT_PUBLIC_BUILD_COMMIT", "");
    vi.stubEnv("NEXT_PUBLIC_BUILD_TIME", "");
    const info = collectBuildInfo();
    expect(info.gitSha).toBe("unknown");
    expect(info.buildTime).toBe("unknown");
    // No +sha suffix when the commit is unknown; "dev" never dresses up.
    expect(info.version).toMatch(/^v\d+\.\d+\.\d+$/);
  });

  it("displayVersion: stamped wins, else package version (+sha7 when known)", () => {
    expect(displayVersion("v2.0.0", "0.1.0", "unknown")).toBe("v2.0.0");
    expect(displayVersion("dev", "0.1.0", "unknown")).toBe("v0.1.0");
    expect(displayVersion("", "0.1.0", "0123456789abcdef")).toBe(
      "v0.1.0+0123456",
    );
    expect(displayVersion("dev", undefined, "unknown")).toBe("v0.0.0");
  });

  it("uses the same derived version in the titlebar summary", () => {
    expect(
      buildSummary({
        version: "dev",
        packageVersion: "0.1.0",
        commit: "abcdef1234567890",
        time: "2026-09-09T10:00:00Z",
        branch: "feature/build",
      }),
    ).toBe("v0.1.0+abcdef1 · abcdef1 · 2026-09-09T10:00:00Z · feature/build");
  });
});
