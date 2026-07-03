/**
 * Tests for buildBacklogProjectTree — the foldable folder tree shown in the
 * Backlog project picker (components/backlog/project-selector.tsx). Folders are
 * foldable; project leaves carry task counts; a node can be both a project and
 * a folder (a project with nested projects beneath it).
 */

import { describe, it, expect } from "vitest";
import {
  buildBacklogProjectTree,
  commonAncestorDir,
  type BacklogTreeNode,
} from "@/lib/project-tree";

const PROJECTS = [
  { path: "/workspace", name: ".", taskCount: 29 }, // root project
  { path: "/workspace/ps/daax", name: "daax", taskCount: 124 },
  { path: "/workspace/ps/daax/hawkeye", name: "hawkeye", taskCount: 12 }, // nested under a project
  { path: "/workspace/ps/nanofuse", name: "NanoFuse", taskCount: 42 },
  { path: "/workspace/jp/nova", name: "nova", taskCount: 29 },
];

const base = commonAncestorDir(PROJECTS.map((p) => p.path)); // "/workspace"

function byName(nodes: BacklogTreeNode[], name: string): BacklogTreeNode {
  const found = nodes.find((n) => n.name === name);
  if (!found) throw new Error(`node ${name} not found`);
  return found;
}

describe("buildBacklogProjectTree", () => {
  const tree = buildBacklogProjectTree(PROJECTS, base);

  it("nests projects under foldable folder nodes", () => {
    // Top level has folders "jp" and "ps" plus the synthetic root node "".
    const names = tree.map((n) => n.name).sort();
    expect(names).toEqual(["", "jp", "ps"]);
    const ps = byName(tree, "ps");
    expect(ps.project).toBeNull(); // "ps" is a pure folder
    expect(ps.children.map((c) => c.name).sort()).toEqual([
      "ps/daax",
      "ps/nanofuse",
    ]);
  });

  it("attaches the root project to the synthetic root node with its count", () => {
    const root = byName(tree, "");
    expect(root.project?.path).toBe("/workspace");
    expect(root.project?.taskCount).toBe(29);
  });

  it("marks a node that is BOTH a project and a folder", () => {
    const daax = byName(byName(tree, "ps").children, "ps/daax");
    expect(daax.project?.taskCount).toBe(124); // it is a project
    expect(daax.children.map((c) => c.name)).toEqual(["ps/daax/hawkeye"]); // and a folder
    expect(daax.children[0].project?.taskCount).toBe(12);
  });

  it("carries task counts onto project leaves", () => {
    const nova = byName(byName(tree, "jp").children, "jp/nova");
    expect(nova.project?.taskCount).toBe(29);
    expect(nova.children).toHaveLength(0);
  });

  it("uses the last path segment for display", () => {
    expect(byName(tree, "ps").segment).toBe("ps");
    expect(byName(byName(tree, "ps").children, "ps/nanofuse").segment).toBe(
      "nanofuse",
    );
  });

  it("handles an empty project list", () => {
    expect(buildBacklogProjectTree([], base)).toEqual([]);
  });
});
