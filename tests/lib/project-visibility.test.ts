/**
 * Tests for the project-visibility helpers used by the Backlog project picker
 * (components/backlog/project-selector.tsx) so it applies the same
 * `disabledProjectDirs` filter as Settings / the Titlebar tree.
 *
 * Approach: derive the workspace root as the common ancestor of the backlog
 * project paths, then filter each path relative to that root. Everything stays
 * within the backlog path namespace, so it is robust when the backlog API and
 * the workspace API report absolute paths under different roots (e.g.
 * "/workspace/..." vs "~/prj/..."), and it covers nested projects that the
 * shallower workspace directory scan never lists — the live-container bug.
 */

import { describe, it, expect } from "vitest";
import { commonAncestorDir, isProjectPathDisabled } from "@/lib/project-tree";

// Real-shaped backlog project paths (absolute, incl. nested worktree projects).
const PATHS = [
  "/workspace",
  "/workspace/jp/nova",
  "/workspace/ps/daax",
  "/workspace/ps/hawkeye",
  "/workspace/ps/daax/hawkeye", // nested project under ps/daax
  "/workspace/dx/src/daax-web",
  "/workspace/psx/app", // sibling that must NOT match "ps"
];

describe("commonAncestorDir", () => {
  it("derives the workspace root from the project paths", () => {
    expect(commonAncestorDir(PATHS)).toBe("/workspace");
  });

  it("handles a single path and an empty list", () => {
    expect(commonAncestorDir(["/workspace/ps/daax"])).toBe(
      "/workspace/ps/daax",
    );
    expect(commonAncestorDir([])).toBeNull();
  });

  it("stops at the real common directory, not a shared string prefix", () => {
    // "/a/ps" and "/a/psx" share the string "ps" but only the dir "/a".
    expect(commonAncestorDir(["/a/ps", "/a/psx"])).toBe("/a");
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
    expect(isProjectPathDisabled("/workspace/ps/hawkeye", base, ["ps"])).toBe(
      true,
    );
  });

  it("hides NESTED projects under a disabled folder (the live-container bug)", () => {
    // These deep paths never appear in the workspace directory scan, so a
    // name-suffix approach missed them; relative-to-root catches them.
    expect(
      isProjectPathDisabled("/workspace/ps/daax/hawkeye", base, ["ps"]),
    ).toBe(true);
  });

  it("keeps projects not under any disabled folder", () => {
    expect(isProjectPathDisabled("/workspace/jp/nova", base, ["ps"])).toBe(
      false,
    );
    expect(
      isProjectPathDisabled("/workspace/dx/src/daax-web", base, ["ps"]),
    ).toBe(false);
  });

  it("is boundary-safe: disabling 'ps' does not hide 'psx'", () => {
    expect(isProjectPathDisabled("/workspace/psx/app", base, ["ps"])).toBe(
      false,
    );
  });

  it("treats the root project and out-of-base paths as visible (fail-open)", () => {
    expect(isProjectPathDisabled("/workspace", base, ["ps"])).toBe(false);
    expect(isProjectPathDisabled("/elsewhere/ps/x", base, ["ps"])).toBe(false);
    expect(isProjectPathDisabled("/workspace/ps/daax", null, ["ps"])).toBe(
      false,
    );
  });

  it("end-to-end: root derived from paths, filter hides the whole ps subtree", () => {
    const derived = commonAncestorDir(PATHS);
    const hidden = PATHS.filter((p) =>
      isProjectPathDisabled(p, derived, ["ps"]),
    );
    expect(hidden).toEqual([
      "/workspace/ps/daax",
      "/workspace/ps/hawkeye",
      "/workspace/ps/daax/hawkeye",
    ]);
    // psx/app and the jp/dx projects remain visible.
    expect(hidden).not.toContain("/workspace/psx/app");
  });
});
