"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import {
  getSettings,
  saveSettings,
  subscribeToSettings,
  DEFAULT_SETTINGS,
} from "./settings";
import {
  cleanupOnProjectSwitch,
  type CleanupCallbacks,
} from "./project-cleanup";

interface WorkspaceDirectory {
  name: string;
  path: string;
  type?: "git" | "planning" | "folder";
  hasSubprojects?: boolean;
}

interface ProjectContextType {
  // Current active project (directory name)
  activeProject: string;
  setActiveProject: (project: string) => Promise<void>;
  // Available projects
  directories: WorkspaceDirectory[];
  loadingDirs: boolean;
  refreshDirectories: (customBasePath?: string) => Promise<void>;
  // Computed paths
  getProjectPath: () => string;
  basePath: string;
  // Cleanup registration for project switch
  registerCleanupCallback: (callbacks: CleanupCallbacks) => void;
}

const ProjectContext = createContext<ProjectContextType | null>(null);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [activeProject, setActiveProjectState] = useState<string>("");
  const [directories, setDirectories] = useState<WorkspaceDirectory[]>([]);
  const [loadingDirs, setLoadingDirs] = useState(true);
  const [basePath, setBasePath] = useState(() => {
    // Initialize with default for SSR
    if (typeof window === "undefined") return DEFAULT_SETTINGS.basePath;
    return getSettings().basePath;
  });

  // Cleanup callbacks registered by other providers (e.g., TerminalManager)
  const cleanupCallbacksRef = useRef<CleanupCallbacks>({});

  // Monotonic counter to drop stale /api/workspace responses. Switching the
  // base path can trigger several overlapping fetches; the recursive workspace
  // walk means they can resolve out of order. Only the newest request is
  // allowed to write state, so the directory list always reflects the latest
  // requested path instead of whichever request happened to finish last.
  const fetchSeqRef = useRef(0);

  // Register cleanup callbacks from other providers
  const registerCleanupCallback = useCallback((callbacks: CleanupCallbacks) => {
    cleanupCallbacksRef.current = {
      ...cleanupCallbacksRef.current,
      ...callbacks,
    };
  }, []);

  // Fetch workspace directories - always use the passed path
  const refreshDirectories = useCallback(
    async (pathToFetch?: string) => {
      const seq = ++fetchSeqRef.current;
      setLoadingDirs(true);
      try {
        // Use the explicitly passed path, current basePath, or default
        const pathToUse = pathToFetch || basePath || DEFAULT_SETTINGS.basePath;
        const url = `/api/workspace?basePath=${encodeURIComponent(pathToUse)}`;

        console.log(`[ProjectContext] Fetching directories from: ${pathToUse}`);

        const response = await fetch(url);
        const data = await response.json();

        // A newer refresh started while this one was in flight — discard this
        // (stale) result so it cannot clobber the latest directory list.
        if (seq !== fetchSeqRef.current) return;

        console.log(`[ProjectContext] Response:`, data);

        if (data.success) {
          setDirectories(data.directories || []);
        } else {
          console.error(`[ProjectContext] Error: ${data.error}`);
          setDirectories([]);
        }
      } catch (error) {
        if (seq !== fetchSeqRef.current) return;
        console.error(`[ProjectContext] Fetch error:`, error);
        setDirectories([]);
      } finally {
        // Only the newest request controls the loading flag.
        if (seq === fetchSeqRef.current) setLoadingDirs(false);
      }
    },
    [basePath],
  );

  // Initialize and subscribe to settings changes
  useEffect(() => {
    // Load initial settings
    const settings = getSettings();
    console.log(
      "[ProjectContext] Initializing with basePath:",
      settings.basePath,
    );
    setBasePath(settings.basePath);
    setActiveProjectState(settings.defaultProject || "");

    // Initial directory fetch
    refreshDirectories(settings.basePath);

    // Subscribe to future settings changes
    const unsubscribe = subscribeToSettings((newSettings) => {
      console.log(
        "[ProjectContext] Settings changed, new basePath:",
        newSettings.basePath,
      );
      // Always update state when settings change
      setBasePath(newSettings.basePath);
      setActiveProjectState(newSettings.defaultProject || "");
      // Refresh directories with new basepath
      refreshDirectories(newSettings.basePath);
    });

    return unsubscribe;
  }, []); // Empty dependency array - only run once on mount

  // Set active project and persist to settings
  // Runs cleanup before switching based on user settings
  const setActiveProject = useCallback(
    async (project: string) => {
      // Only run cleanup if actually switching to a different project
      if (project !== activeProject) {
        await cleanupOnProjectSwitch(cleanupCallbacksRef.current);
      }

      setActiveProjectState(project);
      // Persist as default project
      saveSettings({ defaultProject: project });
    },
    [activeProject],
  );

  // Get full project path
  const getProjectPath = useCallback(() => {
    if (!activeProject) return basePath;
    const base = basePath.endsWith("/") ? basePath.slice(0, -1) : basePath;
    return `${base}/${activeProject}`;
  }, [basePath, activeProject]);

  return (
    <ProjectContext.Provider
      value={{
        activeProject,
        setActiveProject,
        directories,
        loadingDirs,
        refreshDirectories,
        getProjectPath,
        basePath,
        registerCleanupCallback,
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error("useProject must be used within a ProjectProvider");
  }
  return context;
}
