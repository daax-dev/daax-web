"use client";

import { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from "react";
import type {
  BacklogProject,
  BacklogProjectsResponse,
  BacklogTasksResponse,
  Task
} from "@/types/backlog";
import { fetchWithRetry } from "@/lib/fetch-with-retry";
// getServerStatus API removed - multi-store uses in-process backend

/** Map HTTP status codes to user-friendly error messages */
function describeHttpError(status: number, action: string): string {
  switch (status) {
    case 401:
      return `Session expired. Please log in again to ${action}.`;
    case 429:
      return `Server is busy (rate limited). Failed to ${action} after retries.`;
    default:
      return `Failed to ${action} (HTTP ${status}).`;
  }
}

interface BacklogContextValue {
  // Multi-project support
  projects: BacklogProject[];
  selectedProject: BacklogProject | null;
  setSelectedProject: (projectPath: string) => Promise<void>;
  isLoadingProjects: boolean;
  
  // Tasks for selected project
  tasks: Task[];
  isLoadingTasks: boolean;
  refreshTasks: () => Promise<void>;

  // Config
  statuses: string[];

  // Selected task for modal
  selectedTask: Task | null;
  setSelectedTask: (task: Task | null) => void;

  // Create mode
  isCreating: boolean;
  setIsCreating: (creating: boolean) => void;

  // Error handling
  error: string | null;
}

const BacklogContext = createContext<BacklogContextValue | undefined>(undefined);

export function BacklogProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<BacklogProject[]>([]);
  const [selectedProject, setSelectedProjectState] = useState<BacklogProject | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Use ref to avoid recreating refreshTasks callback on every selectedProject change
  const selectedProjectRef = useRef<BacklogProject | null>(null);
  
  // Keep ref in sync with state
  useEffect(() => {
    selectedProjectRef.current = selectedProject;
  }, [selectedProject]);

  // Load all projects on mount
  useEffect(() => {
    async function loadProjects() {
      try {
        setIsLoadingProjects(true);
        setError(null);
        
        const response = await fetchWithRetry('/api/backlog/projects');
        if (!response.ok) throw new Error(describeHttpError(response.status, 'load projects'));

        const data: BacklogProjectsResponse = await response.json();
        setProjects(data.projects);

        // Set first project as active if none selected
        if (data.projects.length > 0 && !selectedProject) {
          const firstProject = data.projects[0];

          // Set active project on backend
          const activeResponse = await fetchWithRetry('/api/backlog/active-project', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectPath: firstProject.path }),
          });

          if (activeResponse.ok) {
            setSelectedProjectState(firstProject);
            localStorage.setItem('backlog:selectedProject', firstProject.path);

            // Load tasks for initial project
            const tasksResponse = await fetchWithRetry(`/api/backlog/tasks?project=${encodeURIComponent(firstProject.path)}`);
            if (tasksResponse.ok) {
              const tasksData: BacklogTasksResponse = await tasksResponse.json();
              setTasks(tasksData.tasks);
            } else {
              setError(describeHttpError(tasksResponse.status, 'load tasks'));
            }
          } else {
            // Backend could not record active project; continue locally but inform the user
            setSelectedProjectState(firstProject);
            localStorage.setItem('backlog:selectedProject', firstProject.path);
            let errorMessage = describeHttpError(activeResponse.status, 'set active project') + ' Working locally only.';

            // Still attempt to load tasks so the UI is usable
            const tasksResponse = await fetchWithRetry(`/api/backlog/tasks?project=${encodeURIComponent(firstProject.path)}`);
            if (tasksResponse.ok) {
              const tasksData: BacklogTasksResponse = await tasksResponse.json();
              setTasks(tasksData.tasks);
            } else {
              errorMessage += ' Additionally, failed to load tasks for the project.';
            }
            setError(errorMessage);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load projects');
      } finally {
        setIsLoadingProjects(false);
      }
    }

    loadProjects();
  }, []); // Run only once on mount - selectedProject causes infinite loop

  // Refresh tasks for current project
  const refreshTasks = useCallback(async (projectPath?: string) => {
    const targetProject = projectPath || selectedProjectRef.current?.path;
    if (!targetProject) return;

    try {
      setIsLoadingTasks(true);
      setError(null);

      const response = await fetchWithRetry(`/api/backlog/tasks?project=${encodeURIComponent(targetProject)}`);
      if (!response.ok) throw new Error(describeHttpError(response.status, 'load tasks'));

      const data: BacklogTasksResponse = await response.json();
      setTasks(data.tasks);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tasks');
    } finally {
      setIsLoadingTasks(false);
    }
  }, []); // No dependencies - uses ref instead

  // Switch to a different project
  const setSelectedProject = useCallback(async (projectPath: string) => {
    try {
      setIsLoadingTasks(true);
      setError(null);

      // Set active project on backend
      const activeResponse = await fetchWithRetry('/api/backlog/active-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath }),
      });

      if (!activeResponse.ok) throw new Error(describeHttpError(activeResponse.status, 'set active project'));

      // Find project in list
      const project = projects.find(p => p.path === projectPath);
      if (!project) throw new Error('Project not found');

      setSelectedProjectState(project);

      // Load tasks for this project
      await refreshTasks(projectPath);

      // Store in localStorage for persistence
      localStorage.setItem('backlog:selectedProject', projectPath);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to switch project');
    } finally {
      setIsLoadingTasks(false);
    }
  }, [projects]); // refreshTasks omitted - it uses refs internally and has no deps

  // Get statuses from selected project config
  const statuses = selectedProject?.config?.statuses ??
                   ["Open", "In Progress", "Review", "Done"];

  return (
    <BacklogContext.Provider
      value={{
        projects,
        selectedProject,
        setSelectedProject,
        isLoadingProjects,
        tasks,
        isLoadingTasks,
        refreshTasks,
        statuses,
        selectedTask,
        setSelectedTask,
        isCreating,
        setIsCreating,
        error,
      }}
    >
      {children}
    </BacklogContext.Provider>
  );
}

export function useBacklog() {
  const context = useContext(BacklogContext);
  if (context === undefined) {
    throw new Error("useBacklog must be used within a BacklogProvider");
  }
  return context;
}
