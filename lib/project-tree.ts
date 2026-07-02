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
 * Derive the absolute workspace base from a workspace-directory listing.
 * Each entry pairs a base-relative `name` (e.g. "ps/daax") with an absolute
 * `path` (e.g. "/workspace/ps/daax"); stripping the name off the path yields
 * the base ("/workspace"). Returns null if no entry lets us derive it.
 *
 * This is derived from the same listing that `disabledProjectDirs` is defined
 * against, so the relative paths line up exactly — more robust than assuming a
 * particular `basePath` string format (e.g. "~/prj" vs "/workspace").
 */
export function deriveWorkspaceBase(
  dirs: readonly { name: string; path: string }[],
): string | null {
  for (const d of dirs) {
    if (d.name && d.path.endsWith(`/${d.name}`)) {
      return d.path.slice(0, d.path.length - d.name.length - 1);
    }
  }
  return null;
}

/**
 * True if an absolute project path is hidden by the disabled-dirs filter.
 * The base project itself (path === base) and any path outside the base are
 * treated as visible (fail-open) so unknown layouts never silently vanish.
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
