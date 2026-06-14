/**
 * Placeholder-vs-real SBOM guard (F2, issue #97).
 *
 * Ports reference-platform's guard in spirit: a generated SBOM is only accepted
 * as "real" when it parses, is not the empty object, clears a conservative size
 * floor, and carries a non-empty component/package list. Anything else is
 * reported unavailable — daax never ships an SBOM that looks present but isn't
 * (and never the old synthetic stand-in).
 *
 * Pure module (no Node/Next imports) so it is usable from the runtime build
 * route, the CI guard step, and unit tests alike.
 */

/**
 * Conservative lower bound (bytes of serialized JSON) below which an SBOM is
 * treated as a placeholder. A real container SBOM is many KB; `{}` is 2 bytes.
 */
export const SBOM_MIN_BYTES = 512;

export type SbomCheck =
  | { real: true; format: "cyclonedx" | "spdx" | "unknown" }
  | { real: false; reason: string };

function parse(input: string | object): object | null {
  if (typeof input === "object") return input;
  try {
    const v = JSON.parse(input);
    return v && typeof v === "object" ? v : null;
  } catch {
    return null;
  }
}

/**
 * Classify an SBOM document (raw JSON string or parsed object). Returns a
 * structured result so callers can log/report the specific reason.
 */
export function checkSbom(
  input: string | object | null | undefined,
): SbomCheck {
  if (input === null || input === undefined) {
    return { real: false, reason: "missing" };
  }
  const obj = parse(input);
  if (!obj) return { real: false, reason: "unparseable" };

  const keys = Object.keys(obj);
  if (keys.length === 0) return { real: false, reason: "empty-object" };

  const serialized = typeof input === "string" ? input : JSON.stringify(obj);
  if (serialized.length < SBOM_MIN_BYTES) {
    return { real: false, reason: "undersized" };
  }

  // Require BOTH the format marker AND a non-empty inventory, so a padded blob
  // that merely carries a `components`/`packages` array (but isn't a real SBOM
  // document) is rejected. CycloneDX → bomFormat/specVersion + components;
  // SPDX → spdxVersion + packages.
  const rec = obj as Record<string, unknown>;
  const components = rec.components;
  const packages = rec.packages;
  const looksCyclonedx =
    rec.bomFormat === "CycloneDX" || typeof rec.specVersion === "string";
  const looksSpdx = typeof rec.spdxVersion === "string";

  if (looksCyclonedx && Array.isArray(components) && components.length > 0) {
    return { real: true, format: "cyclonedx" };
  }
  if (looksSpdx && Array.isArray(packages) && packages.length > 0) {
    return { real: true, format: "spdx" };
  }
  return { real: false, reason: "no-components" };
}

/** Convenience boolean wrapper around {@link checkSbom}. */
export function isRealSbom(input: string | object | null | undefined): boolean {
  return checkSbom(input).real;
}
