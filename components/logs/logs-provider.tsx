"use client";

import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from "react";
import { parseJsonlFile } from "@/lib/jsonl";
import type { ParsedJsonlFile } from "@/types/jsonl";

interface ProjectLogsData {
  path: string;
  files: Array<{
    name: string;
    path: string;
    recordCount: number;
    lastModified: string;
    content: string;
  }>;
  errors: Array<{ path: string; error: string }>;
}

interface LogsContextValue {
  // Projects data
  projects: Record<string, ProjectLogsData>;
  projectList: string[];
  isLoading: boolean;
  error: string | null;

  // Selection state
  selectedProject: string | null;
  selectedFile: string | null;

  // Computed data
  parsedFiles: ParsedJsonlFile[];

  // Actions
  setSelectedProject: (project: string | null) => void;
  setSelectedFile: (file: string | null) => void;
  refresh: () => Promise<void>;
}

const LogsContext = createContext<LogsContextValue | null>(null);

export function LogsProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Record<string, ProjectLogsData>>({});
  const [projectList, setProjectList] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  // Track whether initial load has completed to avoid stale closure issues
  const hasInitialized = useRef(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/files");
      const data = await res.json();

      if (data.error) {
        setError(data.error);
        return;
      }

      setProjects(data.projects || {});
      setProjectList(data.projectList || []);

      // Auto-select first project only on initial load (not on refresh)
      // This prevents the stale closure issue where selectedProject changes
      // but loadData still sees the old value
      if (!hasInitialized.current && data.projectList?.length > 0) {
        setSelectedProject(data.projectList[0]);
        hasInitialized.current = true;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load files");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Auto-select first file when project changes
  useEffect(() => {
    if (selectedProject && projects[selectedProject]) {
      const projectData = projects[selectedProject];
      const firstFile = projectData.files.find(f => f.recordCount > 0) || projectData.files[0];
      if (firstFile) {
        setSelectedFile(firstFile.path);
      } else {
        setSelectedFile(null);
      }
    }
  }, [selectedProject, projects]);

  // Parse files for the selected project
  const parsedFiles: ParsedJsonlFile[] = selectedProject && projects[selectedProject]
    ? projects[selectedProject].files.map(file => {
        const parsed = parseJsonlFile(file.name, file.content);
        return {
          ...parsed,
          file: {
            ...parsed.file,
            path: file.path,
            lastModified: new Date(file.lastModified),
          },
        };
      })
    : [];

  const value: LogsContextValue = {
    projects,
    projectList,
    isLoading,
    error,
    selectedProject,
    selectedFile,
    parsedFiles,
    setSelectedProject,
    setSelectedFile,
    refresh: loadData,
  };

  return <LogsContext.Provider value={value}>{children}</LogsContext.Provider>;
}

export function useLogs() {
  const context = useContext(LogsContext);
  if (!context) {
    throw new Error("useLogs must be used within a LogsProvider");
  }
  return context;
}
