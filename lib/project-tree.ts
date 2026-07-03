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
 * Map an absolute project path to its workspace-root-relative path using the
 * workspace directory listing's `name` fields (already root-relative, e.g.
 * "ps/daax"). Returns the LONGEST directory name that is a path-suffix of
 * `absPath`, or null if none matches.
 *
 * Crucially this compares only the relative NAMES, never the absolute roots,
 * so it is robust when the backlog API and the workspace API express absolute
 * paths under different roots — e.g. backlog "/workspace/ps/daax" while the
 * workspace listing reports "~/prj/ps/daax". Both still carry name "ps/daax".
 */
export function relativeProjectPath(
  absPath: string,
  dirNames: Iterable<string>,
): string | null {
  let best: string | null = null;
  for (const name of dirNames) {
    if (!name) continue;
    if (
      absPath.endsWith(`/${name}`) &&
      (best === null || name.length > best.length)
    ) {
      best = name;
    }
  }
  return best;
}

/**
 * True if an absolute project path is hidden by the disabled-dirs filter,
 * resolved through the workspace directory names. Fail-open (visible) when the
 * path maps to no known relative directory, so unknown layouts never silently
 * vanish. The workspace root project (no matching relative name) stays visible.
 */
export function isProjectDisabled(
  absPath: string,
  dirNames: Iterable<string>,
  disabled: Iterable<string>,
): boolean {
  const relative = relativeProjectPath(absPath, dirNames);
  if (relative === null) return false;
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
