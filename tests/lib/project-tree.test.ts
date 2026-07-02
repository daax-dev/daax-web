/**
 * Tests for the project-selector tree helpers: building an N-level tree from a
 * flat directory list (including repo-in-repo and synthesized intermediates)
 * and applying the cascading enable/disable filter.
 */
import { describe, it, expect } from "vitest";
import {
  buildProjectTree,
  filterDisabledTree,
  isDirDisabled,
  ancestorPaths,
  type ProjectDir,
  type ProjectTreeNode,
} from "@/lib/project-tree";

function names(nodes: ProjectTreeNode[]): string[] {
  return nodes.map((n) => n.name);
}

function find(
  nodes: ProjectTreeNode[],
  name: string,
): ProjectTreeNode | undefined {
  for (const n of nodes) {
    if (n.name === name) return n;
    const hit = find(n.children, name);
    if (hit) return hit;
  }
  return undefined;
}

describe("buildProjectTree", () => {
  it("nests entries by path at arbitrary depth", () => {
    const dirs: ProjectDir[] = [
      { name: "dx-src", type: "planning" },
      { name: "dx-src/daax-web", type: "git" },
      { name: "kb", type: "git" },
      { name: "kb/src", type: "planning" },
      { name: "kb/src/terragen", type: "git" },
      { name: "standalone", type: "git" },
    ];
    const tree = buildProjectTree(dirs);

    const dxSrc = find(tree, "dx-src");
    expect(dxSrc?.type).toBe("planning");
    expect(names(dxSrc!.children)).toEqual(["dx-src/daax-web"]);

    // Repo-in-repo: kb is a git repo AND has children (kb/src/terragen).
    const kb = find(tree, "kb");
    expect(kb?.type).toBe("git");
    expect(find(kb!.children, "kb/src")).toBeDefined();
    expect(find(tree, "kb/src/terragen")?.type).toBe("git");
  });

  it("synthesizes missing intermediate ancestors as folders", () => {
    const tree = buildProjectTree([{ name: "a/b/c", type: "git" }]);
    const a = find(tree, "a");
    expect(a).toBeDefined();
    expect(a!.type).toBe("folder");
    expect(find(tree, "a/b")?.type).toBe("folder");
    expect(find(tree, "a/b/c")?.type).toBe("git");
  });

  it("orders directories-with-children before leaves, then alphabetically", () => {
    const tree = buildProjectTree([
      { name: "zeta", type: "git" }, // leaf
      { name: "alpha", type: "planning" }, // has child
      { name: "alpha/repo", type: "git" },
      { name: "beta", type: "git" }, // leaf
    ]);
    expect(names(tree)).toEqual(["alpha", "beta", "zeta"]);
  });
});

describe("isDirDisabled", () => {
  it("matches self and descendants but respects path boundaries", () => {
    const disabled = ["foo"];
    expect(isDirDisabled("foo", disabled)).toBe(true);
    expect(isDirDisabled("foo/bar", disabled)).toBe(true);
    // "foobar" must NOT be caught by a "foo" prefix.
    expect(isDirDisabled("foobar", disabled)).toBe(false);
    expect(isDirDisabled("other", disabled)).toBe(false);
  });
});

describe("filterDisabledTree", () => {
  it("removes a disabled directory together with its whole subtree", () => {
    const tree = buildProjectTree([
      { name: "keep", type: "git" },
      { name: "drop", type: "planning" },
      { name: "drop/child-repo", type: "git" },
      { name: "drop/child-repo/nested", type: "git" },
    ]);
    const filtered = filterDisabledTree(tree, new Set(["drop"]));
    expect(names(filtered)).toEqual(["keep"]);
    expect(find(filtered, "drop/child-repo")).toBeUndefined();
  });

  it("keeps siblings of a disabled directory", () => {
    const tree = buildProjectTree([
      { name: "group", type: "planning" },
      { name: "group/a", type: "git" },
      { name: "group/b", type: "git" },
    ]);
    const filtered = filterDisabledTree(tree, new Set(["group/a"]));
    const group = find(filtered, "group");
    expect(names(group!.children)).toEqual(["group/b"]);
  });
});

describe("ancestorPaths", () => {
  it("returns every ancestor prefix excluding the leaf itself", () => {
    expect(ancestorPaths("a/b/c")).toEqual(["a", "a/b"]);
    expect(ancestorPaths("top")).toEqual([]);
  });
});
