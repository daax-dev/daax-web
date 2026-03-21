"use client";

import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { useLogs } from "./logs-provider";
import {
  FolderOpen,
  ChevronRight,
  ChevronDown,
  FileJson,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface TreeNode {
  name: string;
  fullPath: string;
  children: Map<string, TreeNode>;
  isProject: boolean;
  fileCount: number;
}

function buildProjectTree(projectList: string[]): TreeNode {
  const root: TreeNode = {
    name: "",
    fullPath: "",
    children: new Map(),
    isProject: false,
    fileCount: 0,
  };

  for (const project of projectList) {
    const parts = project.split("/");
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const fullPath = parts.slice(0, i + 1).join("/");
      const isLast = i === parts.length - 1;

      if (!current.children.has(part)) {
        current.children.set(part, {
          name: part,
          fullPath,
          children: new Map(),
          isProject: false,
          fileCount: 0,
        });
      }

      current = current.children.get(part)!;
      if (isLast) {
        current.isProject = true;
      }
    }
  }

  return root;
}

function TreeItem({
  node,
  level,
  selectedProject,
  onSelect,
  projects,
}: {
  node: TreeNode;
  level: number;
  selectedProject: string | null;
  onSelect: (project: string) => void;
  projects: Record<string, { files: Array<{ recordCount: number }> }>;
}) {
  const [expanded, setExpanded] = useState(level < 2);
  const hasChildren = node.children.size > 0;
  const isSelected = selectedProject === node.fullPath;
  const projectData = node.isProject ? projects[node.fullPath] : null;
  const fileCount = projectData?.files.length || 0;
  const recordCount = projectData?.files.reduce((sum, f) => sum + f.recordCount, 0) || 0;

  // Check if any child is selected
  const hasSelectedChild = selectedProject?.startsWith(node.fullPath + "/") ?? false;

  // Auto-expand if child is selected
  const isExpanded = expanded || hasSelectedChild;

  if (!node.name) return null; // Skip root

  return (
    <div>
      <button
        onClick={() => {
          if (node.isProject) {
            onSelect(node.fullPath);
            // Also toggle expansion if the project has children
            if (hasChildren) {
              setExpanded(!isExpanded);
            }
          } else if (hasChildren) {
            setExpanded(!isExpanded);
          }
        }}
        className={cn(
          "flex items-center gap-1.5 w-full rounded-md px-2 py-1.5 text-sm transition-colors",
          "hover:bg-zinc-800 hover:text-foreground",
          isSelected ? "bg-zinc-800 text-foreground" : "text-zinc-400",
        )}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
      >
        {/* Chevron icon - purely visual, interaction handled by parent button */}
        {hasChildren ? (
          <span className="shrink-0">
            {isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </span>
        ) : (
          <span className="w-3.5" />
        )}

        {node.isProject ? (
          <FileJson className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <FolderOpen className="h-3.5 w-3.5 shrink-0" />
        )}

        <span className="truncate flex-1 text-left">{node.name}</span>

        {node.isProject && fileCount > 0 && (
          <span className="text-xs text-zinc-500 shrink-0">
            {fileCount}f/{recordCount}r
          </span>
        )}
      </button>

      {hasChildren && isExpanded && (
        <div>
          {Array.from(node.children.values())
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((child) => (
              <TreeItem
                key={child.fullPath}
                node={child}
                level={level + 1}
                selectedProject={selectedProject}
                onSelect={onSelect}
                projects={projects}
              />
            ))}
        </div>
      )}
    </div>
  );
}

export function LogsNav() {
  const { projectList, selectedProject, setSelectedProject, projects, isLoading, refresh } = useLogs();

  const tree = useMemo(() => buildProjectTree(projectList), [projectList]);

  const totalProjects = projectList.length;
  const totalFiles = Object.values(projects).reduce((sum, p) => sum + p.files.length, 0);

  return (
    <nav className="flex flex-col w-full border-r bg-zinc-900/50 h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800">
        <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
          Projects ({totalProjects})
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={refresh}
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>

      {/* All Projects option */}
      <div className="px-2 py-2 border-b border-zinc-800">
        <button
          onClick={() => setSelectedProject(null)}
          className={cn(
            "flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-sm transition-colors",
            "hover:bg-zinc-800 hover:text-foreground",
            selectedProject === null ? "bg-zinc-800 text-foreground" : "text-zinc-400",
          )}
        >
          <FolderOpen className="h-3.5 w-3.5" />
          <span>All Projects</span>
          <span className="text-xs text-zinc-500 ml-auto">{totalFiles} files</span>
        </button>
      </div>

      {/* Project tree */}
      <div className="flex-1 overflow-auto py-2 px-1">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
          </div>
        ) : tree.children.size === 0 ? (
          <div className="px-3 py-4 text-sm text-zinc-500 text-center">
            No projects with .logs directories found
          </div>
        ) : (
          Array.from(tree.children.values())
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((node) => (
              <TreeItem
                key={node.fullPath}
                node={node}
                level={0}
                selectedProject={selectedProject}
                onSelect={setSelectedProject}
                projects={projects}
              />
            ))
        )}
      </div>
    </nav>
  );
}
