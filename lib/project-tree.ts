// Shared project-directory tree helpers.
//
// The workspace API (`/api/workspace`) returns a FLAT list of directories, each
// keyed by its full path relative to the workspace base (e.g. "dx-src/daax-web",
// "kb", "kb/src/terragen"). These helpers turn that flat list into an N-level
// nested tree for the project selector and settings visibility controls, and
// apply the user's per-directory enable/disable choices.
//
// `type` keeps the historical union so existing consumers (shell, ai-coding,
// code-server, settings default-project dropdown) are unaffected:
//   - "git"      → the directory is itself a git repo (switchable)
//   - "planning" → not a repo, but has a repo somewhere beneath it
//   - "folder"   → plain directory with no repo beneath it

export type ProjectDirType = "git" | "planning" | "folder";

export interface ProjectDir {
  name: string; // full path relative to workspace base
  type: ProjectDirType;
}

export interface ProjectTreeNode {
  name: string; // full relative path, e.g. "dx-src/daax-web"
  segment: string; // last path segment, for display
  type: ProjectDirType;
  children: ProjectTreeNode[];
}

/**
 * Build an N-level nested tree from a flat directory list. Intermediate
 * ancestors that are not present in the list are synthesized as "folder" nodes
 * so the hierarchy is always fully connected. A directory that is a git repo
 * AND has repo descendants (repo-in-repo) keeps its "git" type while still
 * gaining children — it is both switchable and expandable.
 */
export function buildProjectTree(dirs: ProjectDir[]): ProjectTreeNode[] {
  const roots: ProjectTreeNode[] = [];
  const map = new Map<string, ProjectTreeNode>();

  // Sort by path so parents are always processed before their children.
  const sorted = [...dirs].sort((a, b) => a.name.localeCompare(b.name));

  for (const dir of sorted) {
    const segments = dir.name.split("/").filter(Boolean);
    let path = "";
    let siblings = roots;

    for (let i = 0; i < segments.length; i++) {
      path = path ? `${path}/${segments[i]}` : segments[i];
      let node = map.get(path);
      if (!node) {
        node = {
          name: path,
          segment: segments[i],
          type: "folder",
          children: [],
        };
        map.set(path, node);
        siblings.push(node);
      }
      // The final segment of this entry carries its real (API-provided) type.
      if (i === segments.length - 1) {
        node.type = dir.type;
      }
      siblings = node.children;
    }
  }

  sortTree(roots);
  return roots;
}

// Directories with children (containers) first, then alphabetical by segment.
function sortTree(nodes: ProjectTreeNode[]): void {
  nodes.sort((a, b) => {
    const aHas = a.children.length > 0 ? 0 : 1;
    const bHas = b.children.length > 0 ? 0 : 1;
    if (aHas !== bHas) return aHas - bHas;
    return a.segment.localeCompare(b.segment);
  });
  for (const node of nodes) sortTree(node.children);
}

/**
 * True if `name` is disabled directly, or lives under a disabled ancestor.
 * The trailing-slash boundary prevents "foo" from matching "foobar".
 */
export function isDirDisabled(
  name: string,
  disabled: Iterable<string>,
): boolean {
  for (const d of disabled) {
    if (name === d || name.startsWith(`${d}/`)) return true;
  }
  return false;
}

/**
 * Longest common ancestor DIRECTORY of a set of absolute paths, split on "/".
 * e.g. ["/workspace", "/workspace/ps/daax", "/workspace/jp/nova"] -> "/workspace".
 * Returns null for an empty list.
 *
 * Used to recover the workspace root from the backlog project paths themselves,
 * so the disabled-dirs filter operates entirely within the backlog path
 * namespace — robust when the backlog API and the workspace API report absolute
 * paths under different roots (e.g. "/workspace/..." vs "~/prj/..."), and it
 * covers nested projects that never appear in the shallower directory scan.
 */
export function commonAncestorDir(paths: readonly string[]): string | null {
  if (paths.length === 0) return null;
  let prefix = paths[0].split("/");
  for (let i = 1; i < paths.length; i++) {
    const segs = paths[i].split("/");
    let j = 0;
    while (j < prefix.length && j < segs.length && prefix[j] === segs[j]) j++;
    prefix = prefix.slice(0, j);
    if (prefix.length === 0) break;
  }
  return prefix.join("/") || null;
}

/**
 * True if an absolute project path is hidden by the disabled-dirs filter,
 * relative to the workspace `base` (see commonAncestorDir). The base project
 * itself (path === base) and any path outside the base are treated as visible
 * (fail-open) so unknown layouts never silently vanish.
 */
export function isProjectPathDisabled(
  absPath: string,
  base: string | null,
  disabled: Iterable<string>,
): boolean {
  if (!base) return false;
  if (absPath === base) return false;
  if (!absPath.startsWith(`${base}/`)) return false;
  const relative = absPath.slice(base.length + 1);
  return isDirDisabled(relative, disabled);
}

/**
 * Prune nodes whose path is in the disabled set. Because a pruned parent is
 * removed with its whole subtree, cascade-to-children is automatic.
 */
export function filterDisabledTree(
  nodes: ProjectTreeNode[],
  disabled: Set<string>,
): ProjectTreeNode[] {
  const result: ProjectTreeNode[] = [];
  for (const node of nodes) {
    if (disabled.has(node.name)) continue;
    result.push({
      ...node,
      children: filterDisabledTree(node.children, disabled),
    });
  }
  return result;
}

/** All ancestor prefixes of a path: "a/b/c" → ["a", "a/b"]. */
export function ancestorPaths(name: string): string[] {
  const segments = name.split("/").filter(Boolean);
  const prefixes: string[] = [];
  let path = "";
  for (let i = 0; i < segments.length - 1; i++) {
    path = path ? `${path}/${segments[i]}` : segments[i];
    prefixes.push(path);
  }
  return prefixes;
}

// ---------------------------------------------------------------------------
// Backlog project tree
//
// The Backlog project picker shows a foldable folder tree (like the Titlebar
// project chooser) whose leaves are the active backlog projects, each with its
// task count. Intermediate folders are foldable; a node can be BOTH a project
// and a folder (e.g. "ps/daax" is a project that also contains nested
// projects). The tree is built from the (already visibility-filtered) backlog
// projects and the workspace root derived via commonAncestorDir().
// ---------------------------------------------------------------------------

export interface BacklogProjectRef {
  path: string; // absolute project path
  name: string; // backlog project display name
  taskCount: number;
}

export interface BacklogTreeNode {
  name: string; // workspace-root-relative path, e.g. "ps/daax" ("" = root)
  segment: string; // last path segment, for display
  // The backlog project living exactly at this node, or null for a pure folder.
  project: BacklogProjectRef | null;
  children: BacklogTreeNode[];
}

/**
 * Build the foldable backlog tree from a flat project list. Each project's path
 * is made relative to `base` (the workspace root) and split into folder
 * segments; the deepest segment is marked as the project (carrying its task
 * count). Missing intermediate folders are synthesized so the hierarchy is
 * fully connected. The root project (path === base) is attached to a synthetic
 * root node whose segment is the base directory name.
 */
export function buildBacklogProjectTree(
  projects: readonly BacklogProjectRef[],
  base: string | null,
): BacklogTreeNode[] {
  const roots: BacklogTreeNode[] = [];
  const map = new Map<string, BacklogTreeNode>();

  const toRelative = (p: string): string => {
    if (!base) return p;
    if (p === base) return "";
    if (p.startsWith(`${base}/`)) return p.slice(base.length + 1);
    return p; // outside base (unexpected after filtering) — keep as-is
  };

  const lastSegment = (p: string): string => {
    const cleaned = p.replace(/\/+$/, "");
    const segs = cleaned.split("/").filter(Boolean);
    return segs[segs.length - 1] || cleaned;
  };

  // Sort by relative path so parents are created before their children.
  const items = projects
    .map((p) => ({ project: p, rel: toRelative(p.path) }))
    .sort((a, b) => a.rel.localeCompare(b.rel));

  for (const { project, rel } of items) {
    const ref: BacklogProjectRef = {
      path: project.path,
      name: project.name,
      taskCount: project.taskCount,
    };

    if (rel === "") {
      // Root project — synthesize a root node keyed by "".
      let node = map.get("");
      if (!node) {
        node = {
          name: "",
          segment: lastSegment(project.path),
          project: null,
          children: [],
        };
        map.set("", node);
        roots.push(node);
      }
      node.project = ref;
      continue;
    }

    const segments = rel.split("/").filter(Boolean);
    let path = "";
    let siblings = roots;
    for (let i = 0; i < segments.length; i++) {
      path = path ? `${path}/${segments[i]}` : segments[i];
      let node = map.get(path);
      if (!node) {
        node = {
          name: path,
          segment: segments[i],
          project: null,
          children: [],
        };
        map.set(path, node);
        siblings.push(node);
      }
      if (i === segments.length - 1) node.project = ref;
      siblings = node.children;
    }
  }

  sortBacklogTree(roots);
  return roots;
}

// Folders (nodes with children) first, then alphabetical by segment — matching
// the Titlebar project tree ordering.
function sortBacklogTree(nodes: BacklogTreeNode[]): void {
  nodes.sort((a, b) => {
    const aHas = a.children.length > 0 ? 0 : 1;
    const bHas = b.children.length > 0 ? 0 : 1;
    if (aHas !== bHas) return aHas - bHas;
    return a.segment.localeCompare(b.segment);
  });
  for (const node of nodes) sortBacklogTree(node.children);
}
