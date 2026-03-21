"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
  useMemo,
  useRef,
} from "react";
import dynamic from "next/dynamic";
import { getSettings } from "@/lib/settings";
import type { TerminalRef } from "./Terminal";
import { getProjectInfo } from "@/lib/project-utils";
import {
  TerminalErrorBoundary,
  TERMINAL_CONTAINER_STYLES,
} from "./TerminalErrorBoundary";
import { cn } from "@/lib/utils";

/**
 * Normalizes a path for comparison to ensure deduplication works correctly
 * regardless of path format differences (trailing slashes, relative vs absolute, etc.)
 */
function normalizePath(path: string): string {
  if (!path) return "";
  // Remove trailing slashes
  let normalized = path.replace(/\/+$/, "");
  // Normalize multiple consecutive slashes to single slash
  normalized = normalized.replace(/\/+/g, "/");
  // Convert to lowercase for case-insensitive comparison (macOS/Windows)
  // Note: This may cause issues on case-sensitive Linux filesystems with
  // intentionally different-cased directories, but those are rare in practice
  normalized = normalized.toLowerCase();
  return normalized;
}

// Dynamic import with loading fallback to handle Turbopack chunk loading issues
// Uses min-h-[400px] to ensure loading state is visible even when parent has no explicit height
const Terminal = dynamic(
  () => import("@/components/terminal/Terminal").then((mod) => mod.Terminal),
  {
    ssr: false,
    loading: () => (
      <div
        className={cn(
          "flex items-center justify-center h-full p-4",
          TERMINAL_CONTAINER_STYLES.minHeight,
          TERMINAL_CONTAINER_STYLES.background,
          TERMINAL_CONTAINER_STYLES.textColor,
        )}
      >
        <div className="flex flex-col items-center gap-2">
          <div className="animate-spin h-6 w-6 border-2 border-current border-t-transparent rounded-full" />
          <span className="text-sm">Loading terminal...</span>
        </div>
      </div>
    ),
  },
);

// Auto-detect WebSocket URL based on current page host
// Production: Uses path-based routing (/ws endpoint on same domain via Traefik)
// Development: Uses port-based routing (HTTP port + 1)
export function getTerminalServerUrl(): string {
  if (typeof window === "undefined") return "ws://localhost:4201";

  // Backward compatibility: allow explicit override via environment variable
  if (process.env.NEXT_PUBLIC_TERMINAL_WS_URL) {
    return process.env.NEXT_PUBLIC_TERMINAL_WS_URL;
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  // Explicit port detection: empty port string means standard port for the protocol
  const currentPort = window.location.port
    ? parseInt(window.location.port, 10)
    : protocol === "wss:"
      ? 443
      : 80;

  // Production (HTTPS on port 443): use path-based routing on same domain
  // This avoids CORS issues and simplifies Traefik configuration
  // Note: Only port 443 is standard for HTTPS; port 80 is HTTP's standard port
  if (protocol === "wss:" && currentPort === 443) {
    return `${protocol}//${window.location.host}/ws`;
  }

  // Development or non-standard: port-based routing (localhost:4200 -> localhost:4201)
  return `${protocol}//${window.location.hostname}:${currentPort + 1}`;
}

// Get container image from settings
// Prefers aiCoding.defaultContainerImage, falls back to legacy containerImage
function getContainerImage(): string {
  const settings = getSettings();
  return (
    settings.aiCoding?.defaultContainerImage ||
    settings.containerImage ||
    "jpoley/daax-agents:latest"
  );
}

type SessionType = "claude" | "btop" | "zsh";
type AIToolId = "claude" | "opencode" | "gemini" | "copilot" | "codex";

interface TerminalSession {
  id: string;
  type: SessionType;
  active: boolean;
  key: number;
  wsUrl: string;
}

// Extended session for AI coding with persistence across navigation
interface AISession {
  id: string;
  toolId: AIToolId;
  name: string;
  active: boolean;
  key: number;
  wsUrl: string;
  mountPath: string;
  projectName?: string;
  projectType?: "git" | "planning";
  // Timestamp when session was created (used for deduplication)
  createdAt: number;
  // Git worktree fields
  isWorktree?: boolean;
  worktreePath?: string;
  worktreeBranch?: string;
  originalProjectPath?: string;
}

interface TerminalManagerContextType {
  // Legacy session API
  sessions: Record<string, TerminalSession>;
  startSession: (
    type: SessionType,
    options?: { mountPath?: string; autoLaunchClaude?: boolean },
  ) => void;
  stopSession: (type: SessionType) => void;
  isSessionActive: (type: SessionType) => boolean;

  // AI session API - persists across navigation
  aiSessions: AISession[];
  activeAISessionId: string | null;
  setActiveAISessionId: (id: string | null) => void;
  createAISession: (
    toolId: AIToolId,
    options?: {
      mountPath?: string;
      name?: string;
      projectName?: string;
      projectType?: "git" | "planning";
      // Worktree options
      worktreePath?: string;
      worktreeBranch?: string;
      originalProjectPath?: string;
    },
  ) => string;
  stopAISession: (sessionId: string) => void;
  stopAllAISessions: () => void;
  restartAISession: (sessionId: string) => void;
  removeAISession: (sessionId: string) => Promise<void>;
  renameAISession: (sessionId: string, name: string) => void;
  getAISessionRef: (sessionId: string) => TerminalRef | null;
  setAISessionRef: (sessionId: string, ref: TerminalRef | null) => void;
}

const TerminalManagerContext = createContext<TerminalManagerContextType | null>(
  null,
);

export function useTerminalManager() {
  const context = useContext(TerminalManagerContext);
  if (!context) {
    throw new Error(
      "useTerminalManager must be used within TerminalManagerProvider",
    );
  }
  return context;
}

// AI tool definitions - must match what's in jpoley/daax-agents container
const AI_TOOLS: Record<AIToolId, { name: string; command: string }> = {
  claude: { name: "Claude Code", command: "claude" },
  opencode: { name: "OpenCode", command: "opencode" },
  gemini: { name: "Gemini CLI", command: "gemini" },
  copilot: { name: "GitHub Copilot", command: "copilot" },
  codex: { name: "Codex CLI", command: "codex" },
};

export function TerminalManagerProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<Record<string, TerminalSession>>({});

  // AI session state - persists across page navigation
  const [aiSessions, setAISessions] = useState<AISession[]>([]);
  const [activeAISessionId, setActiveAISessionId] = useState<string | null>(
    null,
  );
  const aiTerminalRefs = useRef<Map<string, TerminalRef>>(new Map());
  const aiExitHandlersRef = useRef<Map<string, () => void>>(new Map());

  const buildWsUrl = useCallback(
    (
      type: SessionType,
      options?: {
        mountPath?: string;
        autoLaunchClaude?: boolean;
        clientSessionId?: string;
      },
    ) => {
      const params = new URLSearchParams();
      const settings = getSettings();
      params.set("sessionType", type);

      // Add recording parameter based on settings
      if (settings.terminalRecordingEnabled) {
        params.set("record", "true");
        // Use provided clientSessionId for server-side recording deduplication
        // This prevents duplicate recordings from React Strict Mode double-mounts
        // The caller must provide a stable ID generated once per logical session
        if (options?.clientSessionId) {
          params.set("clientSessionId", options.clientSessionId);
        }
      }

      if (type === "claude") {
        params.set("mode", "container");
        params.set("image", getContainerImage());
        if (options?.mountPath) {
          params.set("mount", options.mountPath);
        }
        if (options?.autoLaunchClaude !== false) {
          params.set("command", "claude");
        }
      } else if (type === "btop") {
        params.set("mode", "local");
        params.set("command", "btop");
      } else if (type === "zsh") {
        params.set("mode", "local");
        // No command - just plain shell
      }

      return `${getTerminalServerUrl()}?${params.toString()}`;
    },
    [],
  );

  // Build WebSocket URL for AI sessions
  // Spawns AI tools (claude, opencode, etc.) in container mode
  const buildAIWsUrl = useCallback(
    (
      toolId: AIToolId,
      options: {
        mountPath?: string;
        projectName?: string;
        projectType?: "git" | "planning";
        basePath: string;
        clientSessionId?: string;
      },
    ) => {
      const params = new URLSearchParams();
      const settings = getSettings();
      const tool = AI_TOOLS[toolId];

      // Container mode for AI tools
      params.set("mode", "container");
      params.set("image", getContainerImage());
      params.set("sessionType", `ai-${toolId}`);

      // Use project-based mounting if project info is provided
      if (options.projectName) {
        params.set("project", options.projectName);
        params.set("basePath", options.basePath);
        if (options.projectType) {
          params.set("projectType", options.projectType);
        }
        // If a specific mountPath is provided (e.g., worktree), pass it
        if (options.mountPath) {
          params.set("mount", options.mountPath);
        }
      } else if (options.mountPath) {
        params.set("mount", options.mountPath);
      }

      // For Claude, add --dangerously-skip-permissions if enabled in settings
      if (toolId === "claude" && settings.claudeSkipPermissions) {
        params.set("command", `${tool.command} --dangerously-skip-permissions`);
      } else {
        params.set("command", tool.command);
      }

      // For OpenCode, add model param (format: "provider:model", e.g., "copilot:gpt-4o")
      if (toolId === "opencode") {
        params.set("opencodeModel", settings.opencodeModel || "copilot:gpt-4o");
      }

      // Add recording parameter based on settings
      if (settings.terminalRecordingEnabled) {
        params.set("record", "true");
        // Use provided clientSessionId for server-side recording deduplication
        // This prevents duplicate recordings from React Strict Mode double-mounts
        // The caller must provide a stable ID generated once per logical session
        if (options.clientSessionId) {
          params.set("clientSessionId", options.clientSessionId);
        }
      }

      return `${getTerminalServerUrl()}?${params.toString()}`;
    },
    [],
  );

  const startSession = useCallback(
    (
      type: SessionType,
      options?: { mountPath?: string; autoLaunchClaude?: boolean },
    ) => {
      // Generate stable clientSessionId once per logical session for recording deduplication
      const clientSessionId = crypto.randomUUID();
      setSessions((prev) => ({
        ...prev,
        [type]: {
          id: type,
          type,
          active: true,
          key: (prev[type]?.key || 0) + 1,
          wsUrl: buildWsUrl(type, { ...options, clientSessionId }),
        },
      }));
    },
    [buildWsUrl],
  );

  const stopSession = useCallback((type: SessionType) => {
    setSessions((prev) => ({
      ...prev,
      [type]: prev[type] ? { ...prev[type], active: false } : prev[type],
    }));
  }, []);

  const isSessionActive = useCallback(
    (type: SessionType) => {
      return sessions[type]?.active || false;
    },
    [sessions],
  );

  const handleExit = useCallback((type: SessionType) => {
    setSessions((prev) => ({
      ...prev,
      [type]: prev[type] ? { ...prev[type], active: false } : prev[type],
    }));
  }, []);

  // AI Session handlers
  const handleAISessionExit = useCallback((sessionId: string) => {
    setAISessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, active: false } : s)),
    );
  }, []);

  const createAISession = useCallback(
    (
      toolId: AIToolId,
      options?: {
        mountPath?: string;
        name?: string;
        projectName?: string;
        projectType?: "git" | "planning";
        // Worktree options
        worktreePath?: string;
        worktreeBranch?: string;
        originalProjectPath?: string;
      },
    ): string => {
      const settings = getSettings();
      const tool = AI_TOOLS[toolId];

      // Use worktree path if provided, otherwise fall back to mountPath or basePath
      const isWorktree = !!options?.worktreePath;
      const mountPath =
        options?.worktreePath || options?.mountPath || settings.basePath;

      // Deduplication: Check for existing session with same tool and mount path
      // created in the last 2 seconds (to prevent React Strict Mode double-mount issues)
      // Uses the explicit createdAt field for robust deduplication (avoids parsing session ID)
      // Path normalization ensures consistent comparison regardless of trailing slashes, etc.
      const now = Date.now();
      const DEDUP_WINDOW_MS = 2000;
      const normalizedMountPath = normalizePath(mountPath);
      const existingSession = aiSessions.find(
        (s) =>
          s.toolId === toolId &&
          normalizePath(s.mountPath) === normalizedMountPath &&
          s.active &&
          now - s.createdAt < DEDUP_WINDOW_MS,
      );

      if (existingSession) {
        console.log(
          `[TerminalManager] Dedup: returning existing session ${existingSession.id} for ${toolId} at ${mountPath}`,
        );
        setActiveAISessionId(existingSession.id);
        return existingSession.id;
      }

      const sessionId = `${toolId}-${now}`;
      // Generate stable clientSessionId once per logical session for recording deduplication
      const clientSessionId = crypto.randomUUID();
      const existingCount = aiSessions.filter(
        (s) => s.toolId === toolId,
      ).length;
      // Use worktree branch name if available, otherwise use default naming
      const name =
        options?.name ||
        options?.worktreeBranch ||
        `${tool.name} ${existingCount + 1}`;

      const newSession: AISession = {
        id: sessionId,
        toolId,
        name,
        active: true,
        key: 1,
        wsUrl: buildAIWsUrl(toolId, {
          mountPath,
          projectName: options?.projectName,
          projectType: options?.projectType,
          basePath: settings.basePath,
          clientSessionId,
        }),
        mountPath,
        projectName: options?.projectName,
        projectType: options?.projectType,
        createdAt: now,
        // Worktree fields
        isWorktree,
        worktreePath: options?.worktreePath,
        worktreeBranch: options?.worktreeBranch,
        originalProjectPath: options?.originalProjectPath,
      };

      setAISessions((prev) => [...prev, newSession]);
      setActiveAISessionId(sessionId);

      return sessionId;
    },
    [aiSessions, buildAIWsUrl],
  );

  const stopAISession = useCallback((sessionId: string) => {
    setAISessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, active: false } : s)),
    );
  }, []);

  const stopAllAISessions = useCallback(() => {
    setAISessions((prev) =>
      prev.map((s) => (s.active ? { ...s, active: false } : s)),
    );
  }, []);

  const restartAISession = useCallback(
    (sessionId: string) => {
      // Generate new clientSessionId for the restarted session
      const clientSessionId = crypto.randomUUID();
      setAISessions((prev) =>
        prev.map((s) => {
          if (s.id === sessionId) {
            return {
              ...s,
              active: true,
              key: s.key + 1,
              wsUrl: buildAIWsUrl(s.toolId, {
                mountPath: s.mountPath,
                projectName: s.projectName,
                projectType: s.projectType,
                basePath: getSettings().basePath,
                clientSessionId,
              }),
            };
          }
          return s;
        }),
      );
    },
    [buildAIWsUrl],
  );

  /**
   * Removes an AI session and optionally cleans up its associated worktree.
   *
   * This function is async because it may perform worktree cleanup operations.
   * Callers may choose to not await the result for fire-and-forget semantics,
   * as the UI state will update regardless via the setAiSessions call at the end.
   *
   * @param sessionId - The ID of the session to remove
   */
  const removeAISession = useCallback(
    async (sessionId: string) => {
      const session = aiSessions.find((s) => s.id === sessionId);
      // Note: getSettings() is intentionally NOT in the dependency array because:
      // 1. It reads from localStorage which always returns fresh values at call time
      // 2. Worktree settings changes do NOT need to affect already-mounted sessions
      // 3. The callback is only invoked when removing a session, so fresh settings are read then
      // This is a deliberate design choice, not a violation of React's rules of hooks.
      const settings = getSettings();

      // Cleanup worktree if applicable - fire-and-forget with defensive error handling
      // This should never crash the UI even if the API is unavailable
      if (
        session?.isWorktree &&
        session.worktreePath &&
        session.originalProjectPath &&
        settings.autoWorktreeCleanup
      ) {
        // Fire-and-forget pattern: don't await, schedule cleanup asynchronously
        // This prevents fetch failures from blocking session removal
        (async () => {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

          try {
            const response = await fetch("/api/git/worktree", {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                projectPath: session.originalProjectPath,
                worktreePath: session.worktreePath,
                pushBeforeCleanup: settings.autoWorktreePushBeforeCleanup,
              }),
              signal: controller.signal,
            });

            if (response.ok) {
              const result = await response.json();
              if (result.kept) {
                console.log(
                  `[TerminalManager] Worktree "${session.worktreeBranch}" has uncommitted changes and was preserved.`,
                );
              } else if (result.success) {
                console.log(
                  `[TerminalManager] Worktree "${session.worktreeBranch}" cleaned up successfully.`,
                );
              }
            } else {
              console.error(
                "[TerminalManager] Failed to cleanup worktree - response not ok:",
                response.status,
              );
            }
          } catch (error) {
            // Silently log - don't crash the UI
            if (error instanceof Error && error.name === "AbortError") {
              console.warn("[TerminalManager] Worktree cleanup timed out");
            } else {
              console.error(
                "[TerminalManager] Failed to cleanup worktree:",
                error,
              );
            }
          } finally {
            // Always clear timeout to avoid calling abort() on completed/failed request
            clearTimeout(timeoutId);
          }
        })();
      }

      // Remove session from state
      setAISessions((prev) => prev.filter((s) => s.id !== sessionId));
      aiTerminalRefs.current.delete(sessionId);
      aiExitHandlersRef.current.delete(sessionId);
      if (activeAISessionId === sessionId) {
        setActiveAISessionId(null);
      }
    },
    [activeAISessionId],
  );

  const renameAISession = useCallback((sessionId: string, name: string) => {
    setAISessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, name } : s)),
    );
  }, []);

  const getAISessionRef = useCallback(
    (sessionId: string): TerminalRef | null => {
      return aiTerminalRefs.current.get(sessionId) || null;
    },
    [],
  );

  const setAISessionRef = useCallback(
    (sessionId: string, ref: TerminalRef | null) => {
      if (ref) {
        aiTerminalRefs.current.set(sessionId, ref);
      } else {
        aiTerminalRefs.current.delete(sessionId);
      }
    },
    [],
  );

  // Get or create a stable exit handler for an AI session
  const getAIExitHandler = useCallback(
    (sessionId: string) => {
      let handler = aiExitHandlersRef.current.get(sessionId);
      if (!handler) {
        handler = () => handleAISessionExit(sessionId);
        aiExitHandlersRef.current.set(sessionId, handler);
      }
      return handler;
    },
    [handleAISessionExit],
  );

  // Memoized callbacks for each session type to prevent re-renders
  const handleClaudeExit = useCallback(
    () => handleExit("claude"),
    [handleExit],
  );
  const handleBtopExit = useCallback(() => handleExit("btop"), [handleExit]);
  const handleZshExit = useCallback(() => handleExit("zsh"), [handleExit]);

  const exitHandlers = useMemo(
    () => ({
      claude: handleClaudeExit,
      btop: handleBtopExit,
      zsh: handleZshExit,
    }),
    [handleClaudeExit, handleBtopExit, handleZshExit],
  );

  // Stable error handler - suppress expected WebSocket close errors
  const handleError = useCallback((err: string) => {
    // WebSocket connection errors during session stops are expected, not actual errors
    if (err === "WebSocket connection error") {
      // Silent - this happens on intentional session stops
      return;
    }
    console.error("Terminal error:", err);
  }, []);

  const contextValue = useMemo(
    () => ({
      sessions,
      startSession,
      stopSession,
      isSessionActive,
      aiSessions,
      activeAISessionId,
      setActiveAISessionId,
      createAISession,
      stopAISession,
      stopAllAISessions,
      restartAISession,
      removeAISession,
      renameAISession,
      getAISessionRef,
      setAISessionRef,
    }),
    [
      sessions,
      startSession,
      stopSession,
      isSessionActive,
      aiSessions,
      activeAISessionId,
      createAISession,
      stopAISession,
      stopAllAISessions,
      restartAISession,
      removeAISession,
      renameAISession,
      getAISessionRef,
      setAISessionRef,
    ],
  );

  return (
    <TerminalManagerContext.Provider value={contextValue}>
      {children}

      {/* Persistent terminal containers - positioned above content when visible
          z-index: 50 matches Radix UI Dialog overlay level so terminals appear on top of page content
          but dialogs/modals can still overlay the terminals when opened */}
      <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 50 }}>
        {Object.values(sessions).map(
          (session) =>
            session.active && (
              <div key={`${session.type}-${session.key}`} className="hidden">
                <TerminalErrorBoundary
                  key={`error-boundary-${session.type}-${session.key}`}
                >
                  <Terminal
                    wsUrl={session.wsUrl}
                    onExit={exitHandlers[session.type]}
                    onError={handleError}
                  />
                </TerminalErrorBoundary>
              </div>
            ),
        )}

        {/* AI Sessions - only render wrapper when session is active to avoid extra DOM nodes */}
        {aiSessions
          .filter((session) => session.active)
          .map((session) => (
            <div
              key={`ai-${session.id}-${session.key}`}
              id={`ai-terminal-${session.id}`}
              className="absolute inset-0"
              style={{
                visibility: "hidden",
                pointerEvents: "none",
              }}
            >
              <TerminalErrorBoundary
                key={`error-boundary-${session.id}-${session.key}`}
              >
                <Terminal
                  ref={(ref) => setAISessionRef(session.id, ref)}
                  wsUrl={session.wsUrl}
                  onExit={getAIExitHandler(session.id)}
                  onError={handleError}
                  className="h-full"
                />
              </TerminalErrorBoundary>
            </div>
          ))}
      </div>
    </TerminalManagerContext.Provider>
  );
}

interface PersistentTerminalProps {
  type: SessionType;
  className?: string;
  onSessionStart?: (sessionId: string, mode: string) => void;
}

export type { SessionType, AIToolId, AISession };

export function PersistentTerminal({
  type,
  className = "",
  onSessionStart,
}: PersistentTerminalProps) {
  const { sessions, stopSession } = useTerminalManager();
  const session = sessions[type];

  // Memoized stable callbacks
  const handleExit = useCallback(() => stopSession(type), [stopSession, type]);
  const handleError = useCallback((err: string) => console.error(err), []);

  if (!session?.active) {
    return null;
  }

  return (
    <TerminalErrorBoundary key={`error-boundary-${type}-${session.key}`}>
      <Terminal
        key={session.key}
        wsUrl={session.wsUrl}
        onSessionStart={onSessionStart}
        onExit={handleExit}
        onError={handleError}
        className={className}
      />
    </TerminalErrorBoundary>
  );
}
