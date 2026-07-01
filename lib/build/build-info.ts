/**
 * Server-side assembly of build/version + deployment metadata and the set of
 * available SBOM documents, for the settings > Build panel and /api/build.
 *
 * Mirrors the reference platform's admin Build endpoint, adapted to daax-web:
 *   - "Go runtime" → Node runtime (process.version) + Next.js version.
 *   - Azure Container Apps fields → daax's real deployment surface. Mode/host/
 *     deployer are always populated (knowable locally); GHCR registry/image/tag
 *     and workspace stay env-driven and are omitted when unset (a from-source
 *     dev run has no image) rather than inventing container-registry values.
 *
 * SBOM files are served from a whitelisted directory (no path traversal) and
 * validated with the shared placeholder-vs-real guard, so the panel degrades to
 * "no SBOM in this build" rather than shipping something that looks present but
 * isn't.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { checkSbom } from "@/lib/sbom-guard";
import type { SbomFormatId, SbomComponentId, SbomRef } from "./sbom-format";

/** daax's deployment surface — the analogue of the reference's Azure card. */
export interface DaaxDeployment {
  /** "host" | "container" (auto-detected, overridable via DAAX_DEPLOY_MODE). */
  mode?: string;
  /** How it was deployed (DAAX_DEPLOY_VIA), e.g. "github-actions" | "host". */
  via?: string;
  /** Who deployed it (DAAX_DEPLOY_BY). */
  by?: string;
  /** Image registry/repo (DAAX_IMAGE_REGISTRY), e.g. ghcr.io/daax-dev/daax-web. */
  registry?: string;
  /** Fully-qualified image reference (DAAX_IMAGE). */
  image?: string;
  /** Image tag (DAAX_IMAGE_TAG). */
  imageTag?: string;
  /** Host workspace mount (HOST_WORKSPACE_PATH) — set in container mode. */
  workspace?: string;
  /** Tailnet / deploy host (DAAX_DEPLOY_HOST). */
  host?: string;
}

export interface BuildInfo {
  /** Display version, e.g. "v0.1.0" (package.json) or "v0.1.0+<sha7>". */
  version: string;
  /** Full git commit SHA (or "000000" in a bare dev build). */
  gitSha: string;
  /** Build timestamp (NEXT_PUBLIC_BUILD_TIMESTAMP, or now for dev). */
  buildTime: string;
  /** Node.js runtime version, e.g. "v22.x". */
  nodeVersion: string;
  /** Next.js version from package.json. */
  nextVersion: string;
  /** Git branch at build time. */
  branch: string;
  /** Build host. */
  hostname: string;
  /** True when at least one real SBOM is bundled. */
  sbomAvailable: boolean;
  /** Which (component, format) SBOMs are available. */
  sboms: SbomRef[];
  /** Deployment metadata (mode/host/deployer always set; image fields when known). */
  deployment?: DaaxDeployment;
}

/** Directory the SBOM files live in (override via DAAX_SBOM_DIR). */
function sbomDir(): string {
  return process.env.DAAX_SBOM_DIR || path.join(process.cwd(), "sbom");
}

/**
 * Closed whitelist mapping (component, format) → filename. Because the filename
 * is looked up from this fixed table (never built from request input), the SBOM
 * route cannot be tricked into path traversal.
 */
const SBOM_FILES: Record<string, string> = {
  "app:cyclonedx": "daax.cyclonedx.json",
  "app:spdx": "daax.spdx.json",
};

export const SBOM_COMPONENTS: SbomComponentId[] = ["app"];
export const SBOM_FORMATS: SbomFormatId[] = ["cyclonedx", "spdx"];

function sbomKey(component: string, format: string): string {
  return `${component}:${format}`;
}

/**
 * Resolve the absolute path for a (component, format) SBOM, or null when the
 * pair is not in the whitelist. Never returns a caller-controlled path.
 */
export function sbomFilePath(component: string, format: string): string | null {
  const file = SBOM_FILES[sbomKey(component, format)];
  return file ? path.join(sbomDir(), file) : null;
}

/**
 * Read a whitelisted SBOM file and return its raw JSON only when it passes the
 * placeholder-vs-real guard; null otherwise (unknown pair, missing file, read
 * error, or placeholder/undersized content).
 */
export function readRealSbom(component: string, format: string): string | null {
  const file = sbomFilePath(component, format);
  if (!file || !existsSync(file)) return null;
  let content: string;
  try {
    content = readFileSync(file, "utf-8");
  } catch (error) {
    console.error(`[Build] failed to read SBOM ${component}/${format}:`, error);
    return null;
  }
  return checkSbom(content).real ? content : null;
}

/** The set of real SBOMs currently bundled, as {component, format} refs. */
export function availableSboms(): SbomRef[] {
  const refs: SbomRef[] = [];
  for (const component of SBOM_COMPONENTS) {
    for (const format of SBOM_FORMATS) {
      if (readRealSbom(component, format)) refs.push({ component, format });
    }
  }
  return refs;
}

function readPackageJson(): { version?: string; nextVersion?: string } {
  try {
    const raw = readFileSync(path.join(process.cwd(), "package.json"), "utf-8");
    const pkg = JSON.parse(raw) as {
      version?: string;
      dependencies?: Record<string, string>;
    };
    return { version: pkg.version, nextVersion: pkg.dependencies?.next };
  } catch {
    return {};
  }
}

/**
 * Read deployment metadata. Always populates the fields that are genuinely
 * knowable locally — mode (host vs container), host, and the deploying user —
 * so the Deployment card is never an empty "not deployed" line. Registry/image/
 * tag/workspace/via stay env-driven and are omitted when unset (a from-source
 * dev run has no image), rather than inventing container-registry values.
 */
export function getDeployment(): DaaxDeployment {
  const env = process.env;
  const mode =
    env.DAAX_DEPLOY_MODE || (env.HOST_WORKSPACE_PATH ? "container" : "host");
  return {
    mode,
    via: env.DAAX_DEPLOY_VIA || (mode === "host" ? "host" : undefined),
    by: env.DAAX_DEPLOY_BY || env.USER || env.USERNAME || undefined,
    registry: env.DAAX_IMAGE_REGISTRY || undefined,
    image: env.DAAX_IMAGE || undefined,
    imageTag: env.DAAX_IMAGE_TAG || undefined,
    workspace: env.HOST_WORKSPACE_PATH || undefined,
    host: env.DAAX_DEPLOY_HOST || env.NEXT_PUBLIC_BUILD_HOSTNAME || undefined,
  };
}

/** Assemble the full BuildInfo payload. */
export function collectBuildInfo(): BuildInfo {
  const { version, nextVersion } = readPackageJson();
  const env = process.env;
  const gitSha = env.NEXT_PUBLIC_BUILD_COMMIT || "000000";
  const shortSha = gitSha.slice(0, 7);
  const baseVersion = version ? `v${version}` : "v0.0.0";
  const displayVersion =
    gitSha !== "000000" ? `${baseVersion}+${shortSha}` : baseVersion;

  const sboms = availableSboms();

  return {
    version: displayVersion,
    gitSha,
    buildTime: env.NEXT_PUBLIC_BUILD_TIMESTAMP || new Date().toISOString(),
    nodeVersion: process.version,
    nextVersion: nextVersion || "unknown",
    branch: env.NEXT_PUBLIC_BUILD_BRANCH || "local",
    hostname: env.NEXT_PUBLIC_BUILD_HOSTNAME || "dev",
    sbomAvailable: sboms.length > 0,
    sboms,
    deployment: getDeployment(),
  };
}
