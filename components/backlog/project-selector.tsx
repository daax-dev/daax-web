"use client";

import { useMemo } from "react";
import { useBacklog } from "./backlog-context";
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
    isLoadingProjects,
    isLoadingTasks,
  } = useBacklog();

  // Group projects by subfolder, with base project first
  const { groupedProjects, baseProjectPath } = useMemo(() => {
    if (projects.length === 0)
      return { groupedProjects: [], baseProjectPath: null };

    // Find the base project (shortest path)
    let basePath: string | null = null;
    let minLength = Infinity;

    for (const p of projects) {
      if (p.path.length < minLength) {
        minLength = p.path.length;
        basePath = p.path;
      }
    }

    // Group projects by subfolder
    const groups = new Map<string | null, BacklogProject[]>();

    for (const project of projects) {
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
  }, [projects]);

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

  const effectiveSelectedProject = selectedProject ?? allProjects[0];

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
