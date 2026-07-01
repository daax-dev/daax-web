/**
 * Pure, dependency-free helpers for rendering an SBOM document in the settings
 * Build panel. Ported (in spirit) from the reference platform's admin Build tab.
 *
 * No Node/Next imports so this is usable from the client component, the server
 * route, and unit tests alike. Handles both CycloneDX (components[]) and SPDX
 * (packages[]) shapes.
 */

export type SbomFormatId = "cyclonedx" | "spdx";

/**
 * daax-web is a single deployable app (not a split backend/frontend), so there
 * is exactly one SBOM component. The Build panel hides the component selector
 * when only one is present.
 */
export type SbomComponentId = "app";

export interface SbomRef {
  component: SbomComponentId;
  format: SbomFormatId;
}

export interface CycloneDxLicenseEntry {
  license?: { id?: string; name?: string };
  expression?: string;
}

export interface CycloneDxComponent {
  type?: string;
  name?: string;
  version?: string;
  purl?: string;
  licenses?: CycloneDxLicenseEntry[];
}

export interface SpdxPackage {
  name?: string;
  versionInfo?: string;
  licenseConcluded?: string;
  licenseDeclared?: string;
}

/** Minimal shape covering the CycloneDX and SPDX fields the panel renders. */
export interface SbomDocument {
  bomFormat?: string;
  specVersion?: string;
  components?: CycloneDxComponent[];
  spdxVersion?: string;
  packages?: SpdxPackage[];
  [k: string]: unknown;
}

export interface SbomRow {
  name: string;
  version: string;
  type: string;
  license: string;
}

export const SBOM_COMPONENT_LABELS: Record<SbomComponentId, string> = {
  app: "Application",
};

export const SBOM_FORMAT_LABELS: Record<SbomFormatId, string> = {
  cyclonedx: "CycloneDX",
  spdx: "SPDX",
};

/** Human label for a CycloneDX license entry (id → name → expression → "—"). */
export function licenseOf(c: CycloneDxComponent): string {
  const parts = (c.licenses ?? [])
    .map((l) => l.license?.id || l.license?.name || l.expression || "")
    .filter(Boolean);
  return parts.length ? parts.join(", ") : "—";
}

/** Human label for an SPDX package license (concluded → declared → "—"). */
export function spdxLicenseOf(p: SpdxPackage): string {
  for (const l of [p.licenseConcluded, p.licenseDeclared]) {
    if (l && l !== "NOASSERTION" && l !== "NONE") return l;
  }
  return "—";
}

/**
 * Flatten an SBOM document into table rows. CycloneDX `components[]` win when
 * present; otherwise SPDX `packages[]`. Returns [] for an inventory-less doc.
 */
export function rowsFromSbom(sbom: SbomDocument): SbomRow[] {
  if (sbom.components?.length) {
    return sbom.components.map((c) => ({
      name: c.name ?? "—",
      version: c.version ?? "—",
      type: c.type ?? "—",
      license: licenseOf(c),
    }));
  }
  if (sbom.packages?.length) {
    return sbom.packages.map((p) => ({
      name: p.name ?? "—",
      version: p.versionInfo ?? "—",
      type: "—",
      license: spdxLicenseOf(p),
    }));
  }
  return [];
}

/** Friendly label for the deployment mechanism (`deployment.via`). */
export function deployViaLabel(via?: string): string {
  switch (via) {
    case "github-actions":
      return "GitHub Actions";
    case "github-runner":
      return "GitHub self-hosted runner";
    case "host":
      return "Host (manual)";
    case "user-device":
      return "User device (manual)";
    default:
      return via || "";
  }
}
