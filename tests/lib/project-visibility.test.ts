/**
 * Tests for the project-visibility helpers used by the Backlog project picker
 * (components/backlog/project-selector.tsx) so it applies the same
 * `disabledProjectDirs` filter as Settings / the Titlebar tree.
 *
 * Path shapes mirror live data: backlog project paths are absolute
 * ("/workspace/ps/daax"); workspace directories pair a base-relative `name`
 * ("ps/daax") with an absolute `path`; `disabledProjectDirs` holds the
 * base-relative names.
 */

import { describe, it, expect } from "vitest";
import { deriveWorkspaceBase, isProjectPathDisabled } from "@/lib/project-tree";

const DIRS = [
  { name: "jp", path: "/workspace/jp" },
  { name: "ps", path: "/workspace/ps" },
  { name: "ps/daax", path: "/workspace/ps/daax" },
  { name: "jp/practice/go", path: "/workspace/jp/practice/go" },
];

describe("deriveWorkspaceBase", () => {
  it("derives the absolute base by stripping a relative name off its path", () => {
    expect(deriveWorkspaceBase(DIRS)).toBe("/workspace");
    // Multi-segment name still resolves the same base.
    expect(deriveWorkspaceBase([{ name: "a/b/c", path: "/root/a/b/c" }])).toBe(
      "/root",
    );
  });

  it("returns null when the base cannot be derived", () => {
    expect(deriveWorkspaceBase([])).toBeNull();
    // path does not end with name -> not derivable from this entry
    expect(
      deriveWorkspaceBase([{ name: "x", path: "/somewhere/y" }]),
    ).toBeNull();
  });
});

describe("isProjectPathDisabled", () => {
  const base = "/workspace";

  it("hides a project whose folder is directly disabled", () => {
    expect(isProjectPathDisabled("/workspace/ps/daax", base, ["ps/daax"])).toBe(
      true,
    );
  });

  it("hides descendants when an ancestor folder is disabled (cascade)", () => {
    expect(isProjectPathDisabled("/workspace/ps/daax", base, ["ps"])).toBe(
      true,
    );
    expect(
      isProjectPathDisabled("/workspace/jp/practice/go", base, ["jp"]),
    ).toBe(true);
  });

  it("keeps projects that are not under any disabled folder", () => {
    expect(isProjectPathDisabled("/workspace/jp/nova", base, ["ps"])).toBe(
      false,
    );
  });

  it("does not match on a shared string prefix (boundary-safe)", () => {
    // "ps" must not hide "psx"
    expect(isProjectPathDisabled("/workspace/psx/app", base, ["ps"])).toBe(
      false,
    );
  });

  it("treats the base project itself and out-of-base paths as visible", () => {
    expect(isProjectPathDisabled("/workspace", base, ["ps"])).toBe(false);
    expect(isProjectPathDisabled("/elsewhere/x", base, ["x"])).toBe(false);
  });

  it("fail-open when base is null or the disabled set is empty", () => {
    expect(isProjectPathDisabled("/workspace/ps/daax", null, ["ps"])).toBe(
      false,
    );
    expect(isProjectPathDisabled("/workspace/ps/daax", base, [])).toBe(false);
  });
});
