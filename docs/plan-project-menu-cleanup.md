# Plan: Clean up project-selector top menu + settings dir toggles

## Goal (operator directive)
1. Top "Select Project" menu: every dir that contains a repo (at any nesting depth) can be
   switched to and expanded/opened. Works with arbitrary nesting. Remove the confusing
   multi-color scheme (purple/gray/yellow) — unify styling.
2. Settings: enable/disable directories in the tree; disabling a dir cascades to all its
   children (they disappear from the selector too).
3. Move the Settings icon next to the user initials; icon-only gear (drop the "Settings"
   word). The gear must NOT be reorderable or hideable in the admin menu-changer.

## Root cause of the bug (dir-broke.png)
Both the API (`app/api/workspace/route.ts`) and the client tree builder (`Titlebar.tsx`)
classify/nest only ONE level deep. A repo nested 2+ levels down, or a container dir with no
direct `.git` child, is misclassified as a flat yellow "folder" that cannot be expanded or
reached. The one-level split is also the source of the purple/gray/yellow color divergence.

## Design

### New shared helper — `lib/project-tree.ts` (unit-tested)
- `ProjectDir = { name: string; type: "git" | "planning" | "folder" }` (name = full relative path)
- `buildProjectTree(dirs): ProjectTreeNode[]` — assembles an N-level nested tree by splitting
  `name` on `/`. Deterministic sort (dirs-with-children first, then by name).
- `isDirDisabled(name, disabled: Set<string>)` — true if `name` or any ancestor prefix is disabled.
- `filterDisabledTree(tree, disabled)` — prune disabled subtrees.

### API — `app/api/workspace/route.ts`
Replace one-level classification with a bounded recursive walk:
- `maxDepth = 5`; skip hidden dirs + heavy dirs (`node_modules`, `.git`, `.next`, `dist`,
  `build`, `vendor`, `target`, `coverage`).
- A dir with its own `.git` → `type: "git"` (repo); the walk continues descending so repo-in-repo stays reachable.
- A dir with a repo somewhere below → `type: "planning"`.
- A dir with no repo below → `type: "folder"`.
- Emit a flat list (unchanged response shape / `directories` array) of: every repo, every
  `planning` container, all TOP-LEVEL dirs, and prune deeper `folder`-only branches (noise).
- **Type union preserved** (`git|planning|folder`) so existing consumers
  (`shell`, `ai-coding`, `code-server`, `settings` default-project dropdown) keep working.
  `name` may now be a deeper path (`a/b/c`); `getProjectInfo` already joins safely.

### Settings model — `lib/settings.ts`
- Add `disabledProjectDirs: string[]` to `DaaxSettings` + default `[]`. (No migration: default
  merge covers absent key.)

### Titlebar — `components/layout/Titlebar.tsx`
- Remove `settings` from `filteredNavItems`.
- Render a fixed icon-only gear `<Link href="/settings">` immediately left of `<UserMenu/>`.
- Replace the ad-hoc 3-bucket tree with a recursive `<TreeNode>` built from
  `buildProjectTree` + `filterDisabledTree(disabledProjectDirs)`.
- Unified styling: single muted icon color for all nodes. Repos use `GitBranch`, containers
  `FolderTree`/`Folder`, all `text-muted-foreground`; active state uses `text-primary` +
  `bg-accent` only. Chevron to expand any node with children; click a repo to switch.
- Auto-expand ancestors of the active project (split full path).

### Settings page — `app/settings/page.tsx`
- Menu-changer (admin tab): exclude `settings` plugin from the reorder/hide list so it cannot
  be dragged or disabled.
- New card "Project Directory Visibility": reuse the already-fetched `directories`, build the
  tree, render each dir with an enable/disable toggle writing `settings.disabledProjectDirs`
  (parent toggle cascades to children via prefix logic).

## Verification
- `bun run typecheck`, `bun run lint`, `bun run format:check`.
- New unit test `tests/lib/project-tree.test.ts` (build + cascade-disable + prune).
- `bun run test`; `bun run build`.
- Manual: nested repo reachable+switchable; disabling a parent hides children; gear next to
  initials, icon-only, absent from menu-changer.

## Risk / reversibility
- API response shape and `type` union unchanged → low blast radius on consumers.
- Recursive walk bounded by depth + ignore-list → no runaway FS cost.
- Fully reversible (additive setting + isolated render change).
