/**
 * Tests for the pure SBOM-rendering helpers used by the settings Build panel.
 */
import { describe, it, expect } from "vitest";

import {
  licenseOf,
  spdxLicenseOf,
  rowsFromSbom,
  deployViaLabel,
  SBOM_COMPONENT_LABELS,
  SBOM_FORMAT_LABELS,
} from "@/lib/build/sbom-format";
import type {
  CycloneDxComponent,
  SbomDocument,
  SpdxPackage,
} from "@/lib/build/sbom-format";

describe("licenseOf (CycloneDX)", () => {
  it("prefers license id, then name, then expression", () => {
    expect(licenseOf({ licenses: [{ license: { id: "MIT" } }] })).toBe("MIT");
    expect(
      licenseOf({ licenses: [{ license: { name: "Apache License" } }] }),
    ).toBe("Apache License");
    expect(licenseOf({ licenses: [{ expression: "(MIT OR ISC)" }] })).toBe(
      "(MIT OR ISC)",
    );
  });

  it("joins multiple licenses and falls back to em dash", () => {
    const c: CycloneDxComponent = {
      licenses: [{ license: { id: "MIT" } }, { license: { id: "ISC" } }],
    };
    expect(licenseOf(c)).toBe("MIT, ISC");
    expect(licenseOf({})).toBe("—");
    expect(licenseOf({ licenses: [] })).toBe("—");
  });
});

describe("spdxLicenseOf", () => {
  it("uses concluded first, then declared", () => {
    expect(
      spdxLicenseOf({ licenseConcluded: "MIT", licenseDeclared: "ISC" }),
    ).toBe("MIT");
    expect(
      spdxLicenseOf({
        licenseConcluded: "NOASSERTION",
        licenseDeclared: "ISC",
      }),
    ).toBe("ISC");
  });

  it("treats NOASSERTION/NONE/missing as no license", () => {
    expect(
      spdxLicenseOf({
        licenseConcluded: "NOASSERTION",
        licenseDeclared: "NONE",
      }),
    ).toBe("—");
    expect(spdxLicenseOf({} as SpdxPackage)).toBe("—");
  });
});

describe("rowsFromSbom", () => {
  it("maps CycloneDX components (components[] wins)", () => {
    const sbom: SbomDocument = {
      bomFormat: "CycloneDX",
      components: [
        {
          type: "library",
          name: "react",
          version: "19.0.0",
          licenses: [{ license: { id: "MIT" } }],
        },
      ],
      packages: [{ name: "ignored", versionInfo: "1.0.0" }],
    };
    expect(rowsFromSbom(sbom)).toEqual([
      { name: "react", version: "19.0.0", type: "library", license: "MIT" },
    ]);
  });

  it("maps SPDX packages when no components", () => {
    const sbom: SbomDocument = {
      spdxVersion: "SPDX-2.3",
      packages: [
        { name: "left-pad", versionInfo: "1.3.0", licenseConcluded: "WTFPL" },
      ],
    };
    expect(rowsFromSbom(sbom)).toEqual([
      { name: "left-pad", version: "1.3.0", type: "—", license: "WTFPL" },
    ]);
  });

  it("fills missing fields with em dash and returns [] for empty docs", () => {
    expect(rowsFromSbom({ components: [{}] })).toEqual([
      { name: "—", version: "—", type: "—", license: "—" },
    ]);
    expect(rowsFromSbom({})).toEqual([]);
    expect(rowsFromSbom({ components: [], packages: [] })).toEqual([]);
  });
});

describe("deployViaLabel", () => {
  it("maps known mechanisms and passes through unknown/empty", () => {
    expect(deployViaLabel("github-actions")).toBe("GitHub Actions");
    expect(deployViaLabel("github-runner")).toBe("GitHub self-hosted runner");
    expect(deployViaLabel("host")).toBe("Host (manual)");
    expect(deployViaLabel("something-else")).toBe("something-else");
    expect(deployViaLabel(undefined)).toBe("");
  });
});

describe("labels", () => {
  it("exposes component and format labels", () => {
    expect(SBOM_COMPONENT_LABELS.app).toBe("Application");
    expect(SBOM_FORMAT_LABELS.cyclonedx).toBe("CycloneDX");
    expect(SBOM_FORMAT_LABELS.spdx).toBe("SPDX");
  });
});
