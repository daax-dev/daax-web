"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useBacklog } from "./backlog-context";
import {
  getSettings,
  subscribeToSettings,
  type DaaxSettings,
} from "@/lib/settings";
import {
  ancestorPaths,
  buildBacklogProjectTree,
  commonAncestorDir,
  isProjectPathDisabled,
  type BacklogTreeNode,
} from "@/lib/project-tree";
import { Button } from "@/components/ui/button";
import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderTree,
  Loader2,
  SquareKanban,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Label for the container workspace root: the basename of the configured base
// path (e.g. ~/jarvis -> "jarvis"), so the tree reflects the real workspace
// instead of a hardcoded "prj". Pure — derived from a basePath value the caller
// holds in component state, never by reading settings during render.
function basePathLabel(basePath: string): string {
  const name = basePath.replace(/\/+$/, "").split("/").pop();
  return name || "workspace";
}

// Extract last directory segment from a path. Handles container mode where
// /workspace maps to the configured workspace root label (passed in from state).
function getDirectoryName(path: string, workspaceLabel: string): string {
  const cleaned = path.replace(/\/+$/, "");
  if (cleaned === "/workspace") return workspaceLabel;
  const segments = cleaned.split("/");
  return segments[segments.length - 1] || path;
}

// Display label for a node: the root project shows the friendly base name.
function nodeLabel(node: BacklogTreeNode, workspaceLabel: string): string {
  if (node.name === "" && node.project)
    return getDirectoryName(node.project.path, workspaceLabel);
  return node.segment;
}

// A single row in the backlog project tree, rendered recursively for nesting.
// Mirrors the Titlebar project chooser: a chevron to expand folders, a folder
// icon for pure folders, and a board icon + task count for backlog projects.
function BacklogTreeItem({
  node,
  depth,
  selectedPath,
  expandedFolders,
  workspaceLabel,
  onToggle,
  onSelect,
}: {
  node: BacklogTreeNode;
  depth: number;
  selectedPath: string | null;
  expandedFolders: Set<string>;
  workspaceLabel: string;
  onToggle: (name: string) => void;
  onSelect: (path: string) => void;
}) {
  const hasChildren = node.children.length > 0;
  const isProject = node.project !== null;
  const isExpanded = expandedFolders.has(node.name);
  const isActive = isProject && node.project!.path === selectedPath;

  const Icon = isProject ? SquareKanban : hasChildren ? FolderTree : Folder;

  const handleClick = () => {
    // A project selects on click; a pure folder toggles its children.
    if (isProject) onSelect(node.project!.path);
    else if (hasChildren) onToggle(node.name);
  };

  return (
    <div>
      <div
        className={cn(
          "flex w-full items-center gap-1 rounded-sm pr-2 py-1.5 text-sm hover:bg-accent",
          isActive && "bg-accent",
        )}
        style={{ paddingLeft: `${0.5 + depth * 0.75}rem` }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => onToggle(node.name)}
            className="shrink-0 text-muted-foreground hover:text-foreground"
            aria-expanded={isExpanded}
            aria-label={isExpanded ? "Collapse" : "Expand"}
          >
            {isExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </button>
        ) : (
          <span className="w-3 shrink-0" />
        )}
        <button
          type="button"
          onClick={handleClick}
          disabled={!isProject && !hasChildren}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <Icon
            className={cn(
              "h-4 w-4 shrink-0",
              isProject ? "text-muted-foreground" : "text-folder",
            )}
          />
          <span className={cn("flex-1 truncate", isActive && "font-medium")}>
            {nodeLabel(node, workspaceLabel)}
          </span>
          {isProject && (
            <span className="shrink-0 text-xs text-muted-foreground">
              {node.project!.taskCount} tasks
            </span>
          )}
        </button>
      </div>

      {hasChildren && isExpanded && (
        <div className="border-l border-border/50 ml-3">
          {node.children.map((child) => (
            <BacklogTreeItem
              key={child.name}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              expandedFolders={expandedFolders}
              workspaceLabel={workspaceLabel}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function ProjectSelector() {
  const {
    projects,
    selectedProject,
    setSelectedProject,
    clearSelectedProject,
    isLoadingProjects,
    isLoadingTasks,
  } = useBacklog();

  const [isOpen, setIsOpen] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set(),
  );
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Track the Settings folder-visibility filter (disabledProjectDirs) and stay
  // in sync when it changes, so hiding a folder in Settings updates the Backlog
  // project picker live — matching the Titlebar/Settings tree behavior.
  const [disabledDirs, setDisabledDirs] = useState<string[]>(() =>
    typeof window === "undefined"
      ? []
      : (getSettings().disabledProjectDirs ?? []),
  );
  useEffect(() => {
    setDisabledDirs(getSettings().disabledProjectDirs ?? []);
    return subscribeToSettings((s) =>
      setDisabledDirs(s.disabledProjectDirs ?? []),
    );
  }, []);

  // Seed the container workspace-root label once from settings, then keep it in
  // sync via subscribeToSettings. Deriving it here (not in render) keeps the
  // tree/trigger label render-pure: getSettings() reads localStorage and can
  // write during migrations, so it must not run per-node during a paint.
  const [workspaceLabel, setWorkspaceLabel] = useState<string>(() =>
    typeof window === "undefined"
      ? "workspace"
      : basePathLabel(getSettings().basePath ?? ""),
  );
  useEffect(() => {
    setWorkspaceLabel(basePathLabel(getSettings().basePath ?? ""));
    return subscribeToSettings((s: DaaxSettings) =>
      setWorkspaceLabel(basePathLabel(s.basePath ?? "")),
    );
  }, []);

  // Apply the same visibility filter Settings uses. Fail-open when nothing is
  // disabled, so behavior is unchanged unless folders have actually been hidden.
  // Derive the workspace root from the backlog project paths themselves so the
  // filter is robust to path-namespace differences and covers nested projects.
  const workspaceBase = useMemo(
    () => commonAncestorDir(projects.map((p) => p.path)),
    [projects],
  );
  const visibleProjects = useMemo(() => {
    if (disabledDirs.length === 0) return projects;
    return projects.filter(
      (p) => !isProjectPathDisabled(p.path, workspaceBase, disabledDirs),
    );
  }, [projects, workspaceBase, disabledDirs]);

  // Foldable folder tree of the active backlog projects (leaves carry task
  // counts), mirroring the Titlebar project chooser.
  const tree = useMemo(
    () =>
      buildBacklogProjectTree(
        visibleProjects.map((p) => ({
          path: p.path,
          name: p.name,
          taskCount: p.taskCount ?? 0,
        })),
        workspaceBase,
      ),
    [visibleProjects, workspaceBase],
  );

  // If the folder filter hides the *currently selected* project, actually
  // switch the selection to the first visible project (not just the label);
  // clear it when every project is hidden, so the board never operates on a
  // hidden project.
  const selectedIsVisible =
    selectedProject != null &&
    visibleProjects.some((p) => p.path === selectedProject.path);
  useEffect(() => {
    if (
      isLoadingProjects ||
      isLoadingTasks ||
      selectedProject == null ||
      selectedIsVisible
    ) {
      return;
    }
    if (visibleProjects.length > 0) {
      setSelectedProject(visibleProjects[0].path);
    } else {
      clearSelectedProject();
    }
  }, [
    isLoadingProjects,
    isLoadingTasks,
    selectedProject,
    selectedIsVisible,
    visibleProjects,
    setSelectedProject,
    clearSelectedProject,
  ]);

  // Auto-expand every folder on the path to the selected project so it shows.
  useEffect(() => {
    if (!selectedProject || !workspaceBase) return;
    const rel =
      selectedProject.path === workspaceBase
        ? ""
        : selectedProject.path.startsWith(`${workspaceBase}/`)
          ? selectedProject.path.slice(workspaceBase.length + 1)
          : "";
    if (!rel) return;
    const prefixes = [...ancestorPaths(rel), rel];
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      for (const p of prefixes) next.add(p);
      return next;
    });
  }, [selectedProject, workspaceBase]);

  // Close the dropdown when clicking outside.
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleFolder = (name: string) =>
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const selectProject = (path: string) => {
    setSelectedProject(path);
    setIsOpen(false);
  };

  if (isLoadingProjects) {
    return (
      <div className="flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">
          Loading projects...
        </span>
      </div>
    );
  }

  if (visibleProjects.length === 0) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">
          No backlog projects found
        </span>
      </div>
    );
  }

  // Display fallback for the paint before the switch effect runs, so the
  // trigger never shows a dangling value for a hidden project.
  const effectiveSelectedProject = selectedIsVisible
    ? selectedProject
    : visibleProjects[0];
  const triggerLabel = effectiveSelectedProject
    ? effectiveSelectedProject.path === workspaceBase
      ? getDirectoryName(effectiveSelectedProject.path, workspaceLabel)
      : effectiveSelectedProject.name
    : "Select a project";

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">Project:</span>
      <div className="relative" ref={dropdownRef}>
        <Button
          variant="outline"
          onClick={() => setIsOpen((o) => !o)}
          disabled={isLoadingTasks}
          className="w-[300px] justify-between font-normal"
        >
          {isLoadingTasks ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Switching project...
            </span>
          ) : (
            <span className="flex items-center gap-2 truncate">
              <SquareKanban className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{triggerLabel}</span>
            </span>
          )}
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>

        {isOpen && (
          <div className="absolute left-0 top-full mt-1 w-[320px] rounded-md border bg-popover p-1 shadow-md z-[70]">
            <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
              Select Project
            </div>
            <div className="my-1 h-px bg-border" />
            <div className="max-h-80 overflow-y-auto">
              {tree.map((node) => (
                <BacklogTreeItem
                  key={node.name}
                  node={node}
                  depth={0}
                  selectedPath={effectiveSelectedProject?.path ?? null}
                  expandedFolders={expandedFolders}
                  workspaceLabel={workspaceLabel}
                  onToggle={toggleFolder}
                  onSelect={selectProject}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
