import { describe, it, expect } from "vitest";
import { checkSbom, isRealSbom, SBOM_MIN_BYTES } from "@/lib/sbom-guard";

// A realistic-size CycloneDX doc (padded past the size floor with components).
function bigCyclonedx(): object {
  return {
    bomFormat: "CycloneDX",
    specVersion: "1.5",
    components: Array.from({ length: 20 }, (_, i) => ({
      type: "library",
      name: `pkg-${i}`,
      version: "1.2.3",
      purl: `pkg:npm/pkg-${i}@1.2.3`,
    })),
  };
}

function bigSpdx(): object {
  return {
    spdxVersion: "SPDX-2.3",
    packages: Array.from({ length: 20 }, (_, i) => ({
      name: `pkg-${i}`,
      versionInfo: "1.2.3",
      SPDXID: `SPDXRef-Package-${i}`,
    })),
  };
}

describe("sbom-guard placeholder-vs-real (F2, #97)", () => {
  it("accepts a real CycloneDX SBOM", () => {
    const r = checkSbom(bigCyclonedx());
    expect(r.real).toBe(true);
    if (r.real) expect(r.format).toBe("cyclonedx");
  });

  it("accepts a real SPDX SBOM", () => {
    const r = checkSbom(bigSpdx());
    expect(r.real).toBe(true);
    if (r.real) expect(r.format).toBe("spdx");
  });

  it("accepts a real SBOM passed as a JSON string", () => {
    expect(isRealSbom(JSON.stringify(bigCyclonedx()))).toBe(true);
  });

  it("rejects the empty object", () => {
    const r = checkSbom({});
    expect(r.real).toBe(false);
    if (!r.real) expect(r.reason).toBe("empty-object");
  });

  it("rejects null / undefined", () => {
    expect(checkSbom(null)).toMatchObject({ real: false, reason: "missing" });
    expect(checkSbom(undefined)).toMatchObject({
      real: false,
      reason: "missing",
    });
  });

  it("rejects an unparseable string", () => {
    expect(checkSbom("not json")).toMatchObject({
      real: false,
      reason: "unparseable",
    });
  });

  it("rejects a non-serializable object (circular ref) without throwing", () => {
    const circular: Record<string, unknown> = { components: [{ name: "a" }] };
    circular.self = circular;
    expect(() => checkSbom(circular)).not.toThrow();
    expect(checkSbom(circular)).toMatchObject({
      real: false,
      reason: "unserializable",
    });
  });

  it("rejects an undersized document below the size floor", () => {
    // Has a (tiny) components array but is well under SBOM_MIN_BYTES.
    const tiny = JSON.stringify({ components: [{ name: "x" }] });
    expect(tiny.length).toBeLessThan(SBOM_MIN_BYTES);
    expect(checkSbom(tiny)).toMatchObject({
      real: false,
      reason: "undersized",
    });
  });

  it("rejects a large doc with no components/packages (e.g. metadata-only)", () => {
    const padded = { note: "x".repeat(SBOM_MIN_BYTES + 10) };
    expect(checkSbom(padded)).toMatchObject({
      real: false,
      reason: "no-components",
    });
  });

  it("rejects a large doc with a components array but NO format marker (padded blob)", () => {
    // Big enough + has a components array, but lacks the CycloneDX bomFormat
    // marker — not a real SBOM. Distinct reason from the empty-inventory case.
    const blob = {
      note: "x".repeat(SBOM_MIN_BYTES),
      components: [{ name: "a" }, { name: "b" }],
    };
    expect(checkSbom(blob)).toMatchObject({
      real: false,
      reason: "missing-marker",
    });
  });
});
