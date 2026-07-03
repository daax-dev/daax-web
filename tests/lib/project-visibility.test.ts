/**
 * Tests for the project-visibility helpers used by the Backlog project picker
 * (components/backlog/project-selector.tsx) so it applies the same
 * `disabledProjectDirs` filter as Settings / the Titlebar tree.
 *
 * The critical property: backlog project paths are absolute under one root
 * (e.g. "/workspace/ps/daax") while the workspace directory listing may report
 * absolute paths under a DIFFERENT root (e.g. "~/prj/ps/daax"). Both still
 * carry the same root-relative `name` ("ps/daax"), and `disabledProjectDirs`
 * is defined against those names — so matching must use names, never roots.
 */

import { describe, it, expect } from "vitest";
import { relativeProjectPath, isProjectDisabled } from "@/lib/project-tree";

// Directory names as returned by /api/workspace (root-relative, exhaustive).
const DIR_NAMES = [
  "ps",
  "ps/daax",
  "ps/hawkeye",
  "jp",
  "jp/nova",
  "jp/career",
  "psx",
  "psx/app",
];

describe("relativeProjectPath", () => {
  it("maps an absolute backlog path to its root-relative directory name", () => {
    expect(relativeProjectPath("/workspace/ps/daax", DIR_NAMES)).toBe(
      "ps/daax",
    );
  });

  it("is namespace-proof: works even when the absolute root differs", () => {
    // Backlog reports "/workspace/...", workspace listing reported "~/prj/...".
    // Only the relative name matters, so both resolve identically.
    expect(relativeProjectPath("/workspace/jp/nova", DIR_NAMES)).toBe(
      "jp/nova",
    );
    expect(relativeProjectPath("~/prj/jp/nova", DIR_NAMES)).toBe("jp/nova");
  });

  it("prefers the LONGEST matching name (most specific)", () => {
    // Both "ps" and "ps/daax" are suffixes of the path; pick "ps/daax".
    expect(relativeProjectPath("/root/ps/daax", DIR_NAMES)).toBe("ps/daax");
  });

  it("returns null for the workspace root / unmapped paths", () => {
    expect(relativeProjectPath("/workspace", DIR_NAMES)).toBeNull();
    expect(relativeProjectPath("/somewhere/unknown", DIR_NAMES)).toBeNull();
  });
});

describe("isProjectDisabled", () => {
  it("hides a project whose folder is directly disabled", () => {
    expect(
      isProjectDisabled("/workspace/ps/daax", DIR_NAMES, ["ps/daax"]),
    ).toBe(true);
  });

  it("hides descendants when an ancestor folder is disabled (cascade)", () => {
    expect(isProjectDisabled("/workspace/ps/daax", DIR_NAMES, ["ps"])).toBe(
      true,
    );
    expect(isProjectDisabled("/workspace/ps/hawkeye", DIR_NAMES, ["ps"])).toBe(
      true,
    );
  });

  it("keeps projects not under any disabled folder", () => {
    expect(isProjectDisabled("/workspace/jp/nova", DIR_NAMES, ["ps"])).toBe(
      false,
    );
  });

  it("is boundary-safe: disabling 'ps' does not hide 'psx'", () => {
    expect(isProjectDisabled("/workspace/psx/app", DIR_NAMES, ["ps"])).toBe(
      false,
    );
  });

  it("hides across a namespace mismatch (the live-container bug)", () => {
    // This is the regression the mocked test missed: backlog path uses one
    // root, workspace names another — the filter must still apply.
    expect(isProjectDisabled("/workspace/ps/daax", DIR_NAMES, ["ps"])).toBe(
      true,
    );
  });

  it("treats the root project and unmapped paths as visible (fail-open)", () => {
    expect(isProjectDisabled("/workspace", DIR_NAMES, ["ps"])).toBe(false);
    expect(isProjectDisabled("/workspace/ps/daax", [], ["ps"])).toBe(false);
    expect(isProjectDisabled("/workspace/ps/daax", DIR_NAMES, [])).toBe(false);
  });
});
