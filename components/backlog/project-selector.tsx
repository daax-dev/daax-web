"use client";

import { useEffect, useMemo, useState } from "react";
import { useBacklog } from "./backlog-context";
import { useProject } from "@/lib/project-context";
import { getSettings, subscribeToSettings } from "@/lib/settings";
import { isProjectDisabled } from "@/lib/project-tree";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BacklogProject } from "@/types/backlog";

// Extract last directory segment from a path
// Handles container mode where /workspace maps to a default project directory
function getDirectoryName(path: string): string {
  const cleaned = path.replace(/\/+$/, "");

  // In container mode, /workspace is the base; use a stable default directory name.
  if (cleaned === "/workspace") {
    return "prj";
  }

  const segments = cleaned.split("/");
  return segments[segments.length - 1] || path;
}

// Get the subfolder relative to base path (e.g., "ps" or "jp")
function getSubfolder(projectPath: string, basePath: string): string | null {
  // Same project as base: no subfolder
  if (projectPath === basePath) return null;

  // Ensure projectPath is actually under basePath before slicing.
  // This avoids incorrect "relative" paths when the canonical projectPath
  // is outside the base or only shares a string prefix (e.g., "/foo-bar" vs "/foo").
  if (!projectPath.startsWith(basePath)) {
    return null;
  }

  const nextChar = projectPath.charAt(basePath.length);
  if (nextChar === "") {
    // No next character (end of string). This should already be covered by the
    // equality check above, but return null defensively for clarity.
    return null;
  }
  if (nextChar !== "/") {
    // basePath is only a partial prefix (e.g. "/foo" vs "/foo-bar")
    return null;
  }

  // Get the relative path from base
  const relative = projectPath.slice(basePath.length).replace(/^\/+/, "");
  const segments = relative.split("/");

  // Return first segment (top-level subfolder)
  return segments[0] || null;
}

interface ProjectGroup {
  name: string | null; // null = base project (no group)
  projects: BacklogProject[];
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
  const { directories } = useProject();

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

  // Apply the same visibility filter Settings uses. Fail-open when nothing is
  // disabled or the workspace base can't be derived, so behavior is unchanged
  // unless the operator has actually hidden folders.
  const visibleProjects = useMemo(() => {
    if (disabledDirs.length === 0) return projects;
    // Match on the workspace directory NAMES (root-relative), not absolute
    // paths — the backlog API and workspace API report absolute paths under
    // different roots (e.g. "/workspace/..." vs "~/prj/..."), but both share
    // the same relative names that disabledProjectDirs is defined against.
    const dirNames = directories.map((d) => d.name);
    if (dirNames.length === 0) return projects;
    return projects.filter(
      (p) => !isProjectDisabled(p.path, dirNames, disabledDirs),
    );
  }, [projects, directories, disabledDirs]);

  // Group projects by subfolder, with base project first
  const { groupedProjects, baseProjectPath } = useMemo(() => {
    if (visibleProjects.length === 0)
      return { groupedProjects: [], baseProjectPath: null };

    // Find the base project (shortest path)
    let basePath: string | null = null;
    let minLength = Infinity;

    for (const p of visibleProjects) {
      if (p.path.length < minLength) {
        minLength = p.path.length;
        basePath = p.path;
      }
    }

    // Group projects by subfolder
    const groups = new Map<string | null, BacklogProject[]>();

    for (const project of visibleProjects) {
      const subfolder = basePath ? getSubfolder(project.path, basePath) : null;
      const existing = groups.get(subfolder) || [];
      existing.push(project);
      groups.set(subfolder, existing);
    }

    // Sort projects within each group alphabetically
    for (const projectList of groups.values()) {
      projectList.sort((a, b) => a.name.localeCompare(b.name));
    }

    // Convert to array with base (null) first, then sorted group names
    const result: ProjectGroup[] = [];

    // Base project first (if exists)
    if (groups.has(null)) {
      result.push({ name: null, projects: groups.get(null)! });
      groups.delete(null);
    }

    // Then other groups sorted alphabetically
    const sortedGroupNames = Array.from(groups.keys()).sort((a, b) =>
      (a || "").localeCompare(b || ""),
    );

    for (const groupName of sortedGroupNames) {
      result.push({ name: groupName, projects: groups.get(groupName)! });
    }

    return { groupedProjects: result, baseProjectPath: basePath };
  }, [visibleProjects]);

  // Get display name for a project
  const getDisplayName = (project: { path: string; name: string }): string => {
    if (project.path === baseProjectPath) {
      return getDirectoryName(project.path);
    }
    return project.name;
  };

  // Flatten for finding effective selected project
  const allProjects = useMemo(
    () => groupedProjects.flatMap((g) => g.projects),
    [groupedProjects],
  );

  // If the folder filter hides the *currently selected* project, actually
  // switch the selection to the first visible project — not just the displayed
  // label. Otherwise the board, task loading, and create/update would keep
  // operating on the hidden project while the picker shows a different one.
  const selectedIsVisible =
    selectedProject != null &&
    allProjects.some((p) => p.path === selectedProject.path);
  useEffect(() => {
    if (
      isLoadingProjects ||
      isLoadingTasks ||
      selectedProject == null ||
      selectedIsVisible
    ) {
      return;
    }
    if (allProjects.length > 0) {
      // Switch to the first still-visible project.
      setSelectedProject(allProjects[0].path);
    } else {
      // Every project is hidden by the filter — clear the selection so the
      // board stops operating on the now-hidden project.
      clearSelectedProject();
    }
  }, [
    isLoadingProjects,
    isLoadingTasks,
    selectedProject,
    selectedIsVisible,
    allProjects,
    setSelectedProject,
    clearSelectedProject,
  ]);

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

  if (allProjects.length === 0) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">
          No backlog projects found
        </span>
      </div>
    );
  }

  // Display fallback for the paint before the switch effect above runs, so the
  // trigger never flashes a dangling value for a hidden project.
  const effectiveSelectedProject = selectedIsVisible
    ? selectedProject
    : allProjects[0];

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">Project:</span>
      <Select
        value={effectiveSelectedProject?.path || ""}
        onValueChange={(value) => setSelectedProject(value)}
        disabled={isLoadingTasks}
      >
        <SelectTrigger className="w-[300px]">
          {isLoadingTasks ? (
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Switching project...</span>
            </div>
          ) : (
            <SelectValue placeholder="Select a project">
              {effectiveSelectedProject
                ? getDisplayName(effectiveSelectedProject)
                : "Select a project"}
            </SelectValue>
          )}
        </SelectTrigger>
        <SelectContent
          position="popper"
          side="bottom"
          align="start"
          className="max-h-[300px] z-[70]"
        >
          {groupedProjects.map((group) => (
            <SelectGroup key={group.name ?? "__base__"}>
              {group.name !== null && (
                <SelectLabel className="text-xs text-muted-foreground font-normal px-2 py-1">
                  {group.name}/
                </SelectLabel>
              )}
              {group.projects.map((project) => {
                const isBaseProject = project.path === baseProjectPath;
                const displayName = getDisplayName(project);

                return (
                  <SelectItem key={project.path} value={project.path}>
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          isBaseProject && "text-green-500 font-medium",
                        )}
                      >
                        {displayName}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        ({project.taskCount || 0} tasks)
                      </span>
                    </div>
                  </SelectItem>
                );
              })}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
