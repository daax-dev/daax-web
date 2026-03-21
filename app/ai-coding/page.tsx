"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  Play,
  Square,
  Container,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Plus,
  X,
  Bot,
  Sparkles,
  Code,
  Wand2,
  Terminal,
  FolderOpen,
  ShieldOff,
  ShieldCheck,
  Monitor,
  Cloud,
  VideoOff,
  Circle,
  Menu,
  PanelLeftClose,
  GitBranch,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getSettings, isSubFeatureVisible } from "@/lib/settings";
import { VoiceInput } from "@/components/ui/voice-input";
import {
  useTerminalManager,
  type AIToolId,
} from "@/components/terminal/TerminalManager";
import type { TerminalRef } from "@/components/terminal/Terminal";
import { useProject } from "@/lib/project-context";
import { tailscaleHosts } from "@/lib/tailscale-hosts";
import { OsIcon } from "@/components/icons/OsIcons";
import { TailscaleIcon } from "@/components/icons/TailscaleIcon";
import { CloudProviderIcon } from "@/components/icons/CloudProviderIcons";
import { TerminalRecordingsPanel } from "@/plugins/terminal-recorder";
import { AgentTabsLayout } from "./AgentTabsLayout";

// AI Tools available in the container
// Ordered: Claude, OpenCode, Copilot, Codex, Gemini
const AI_TOOLS = [
  {
    id: "claude" as AIToolId,
    name: "Claude Code",
    icon: Bot,
    command: "claude",
    description: "Anthropic Claude CLI",
  },
  {
    id: "opencode" as AIToolId,
    name: "OpenCode",
    icon: Terminal,
    command: "opencode",
    description: "Multi-provider AI CLI (Copilot/Grok)",
  },
  {
    id: "copilot" as AIToolId,
    name: "GitHub Copilot",
    icon: Code,
    command: "copilot",
    description: "GitHub Copilot CLI (@github/copilot)",
  },
  {
    id: "codex" as AIToolId,
    name: "Codex CLI",
    icon: Wand2,
    command: "codex",
    description: "OpenAI Codex CLI",
  },
  {
    id: "gemini" as AIToolId,
    name: "Gemini CLI",
    icon: Sparkles,
    command: "gemini",
    description: "Google Gemini CLI",
  },
] as const;

// Cloud providers - use real icons via CloudProviderIcon component
const CLOUD_PROVIDERS = [
  { id: "aws" as const, name: "AWS" },
  { id: "azure" as const, name: "Azure" },
  { id: "gcp" as const, name: "GCP" },
];

export default function AICodingPage() {
  // Check layout setting - render Agent Tabs or Agent Tree
  const settings = typeof window !== "undefined" ? getSettings() : null;
  const layout = settings?.aiCodingLayout || "tree";

  if (layout === "tabs") {
    return <AgentTabsLayout />;
  }

  return <AgentTreeLayout />;
}

// Agent Tree layout component - separated to avoid conditional hook calls
function AgentTreeLayout() {
  // Use global terminal manager for session persistence
  const {
    aiSessions,
    activeAISessionId,
    setActiveAISessionId,
    createAISession,
    stopAISession,
    restartAISession,
    removeAISession,
    renameAISession,
    getAISessionRef,
  } = useTerminalManager();

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<AIToolId>>(
    new Set(),
  );
  const [localAgentsCollapsed, setLocalAgentsCollapsed] = useState(false);
  const [cloudAgentsCollapsed, setCloudAgentsCollapsed] = useState(true); // Closed by default
  const [hostsCollapsed, setHostsCollapsed] = useState(true); // Closed by default
  const [selectedHostId, setSelectedHostId] = useState<string | null>(null);
  const [expandedHosts, setExpandedHosts] = useState<Set<string>>(new Set());
  const [expandedCloudProviders, setExpandedCloudProviders] = useState<
    Set<string>
  >(new Set());
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const claudeSkipPermissions =
    typeof window !== "undefined" ? getSettings().claudeSkipPermissions : true;

  // Sub-feature visibility checks
  // Feature visibility - use state to avoid hydration mismatch
  const [showLocalAgents, setShowLocalAgents] = useState(true);
  const [showTailscaleAgents, setShowTailscaleAgents] = useState(true);
  const [showCloudAgents, setShowCloudAgents] = useState(true);

  // Check visibility after hydration
  useEffect(() => {
    setShowLocalAgents(isSubFeatureVisible("ai-coding", "local-agents"));
    setShowTailscaleAgents(
      isSubFeatureVisible("ai-coding", "tailscale-agents"),
    );
    setShowCloudAgents(isSubFeatureVisible("ai-coding", "cloud-agents"));

    // Set initial sidebar state based on screen size
    const handleResize = () => {
      if (window.innerWidth < 768) {
        setSidebarOpen(false);
      }
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  const inputRef = useRef<HTMLInputElement>(null);
  const terminalRef = useRef<TerminalRef>(null);
  const [voiceReady, setVoiceReady] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  // Use ref for lock to prevent stale closure issues in async callbacks
  const isCreatingSessionRef = useRef(false);
  const { activeProject, getProjectPath, basePath, directories } = useProject();

  const activeSession = aiSessions.find((s) => s.id === activeAISessionId);
  const terminalContainerRef = useRef<HTMLDivElement>(null);

  // Position terminal over display area using CSS (no DOM movement)
  // Terminal stays in TerminalManager, we position it to overlay terminalContainerRef
  useEffect(() => {
    if (!activeSession?.active || !terminalContainerRef.current) return;

    const terminalEl = document.getElementById(
      `ai-terminal-${activeSession.id}`,
    );
    const container = terminalContainerRef.current;
    if (!terminalEl) return;

    let isCleanedUp = false;
    let rafId: number | null = null;

    const updatePosition = () => {
      if (isCleanedUp || !terminalEl.isConnected) return;
      try {
        const rect = container.getBoundingClientRect();
        terminalEl.style.visibility = "visible";
        terminalEl.style.pointerEvents = "auto";
        terminalEl.style.position = "fixed";
        terminalEl.style.left = `${rect.left}px`;
        terminalEl.style.top = `${rect.top}px`;
        terminalEl.style.width = `${rect.width}px`;
        terminalEl.style.height = `${rect.height}px`;
      } catch {
        // Ignore errors if element is being unmounted
      }
    };

    // Debounced version using requestAnimationFrame to limit updates
    // Note: rafId is set to null inside the callback. If cleanup runs between
    // requestAnimationFrame call and callback execution, isCleanedUp guard
    // in updatePosition() prevents any issues.
    const debouncedUpdatePosition = () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      rafId = requestAnimationFrame(() => {
        rafId = null;
        updatePosition();
      });
    };

    // Initial position (no debounce for first render)
    updatePosition();

    // Update on resize with debouncing
    const resizeObserver = new ResizeObserver(debouncedUpdatePosition);
    resizeObserver.observe(container);
    window.addEventListener("resize", debouncedUpdatePosition);

    return () => {
      // Guard against multiple cleanup calls
      if (isCleanedUp) return;
      isCleanedUp = true;

      // Cancel any pending animation frame
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }

      resizeObserver.disconnect();
      window.removeEventListener("resize", debouncedUpdatePosition);

      // Reset styles - no DOM movement
      try {
        if (terminalEl && terminalEl.isConnected) {
          terminalEl.style.visibility = "hidden";
          terminalEl.style.pointerEvents = "none";
          terminalEl.style.position = "";
          terminalEl.style.left = "";
          terminalEl.style.top = "";
          terminalEl.style.width = "";
          terminalEl.style.height = "";
        }
      } catch {
        // Ignore cleanup errors
      }
    };
  }, [activeSession?.id, activeSession?.active]);

  // Keep terminalRef in sync with the active session's terminal ref
  // Use polling since the ref may not be immediately available after mount
  // Also track recording state from the terminal ref
  useEffect(() => {
    if (!activeSession?.active) {
      (terminalRef as React.MutableRefObject<TerminalRef | null>).current =
        null;
      setVoiceReady(false);
      setIsRecording(false);
      return;
    }

    // Poll for the ref since Terminal component may not have set it yet
    const checkRef = () => {
      const ref = getAISessionRef(activeSession.id);
      if (ref) {
        (terminalRef as React.MutableRefObject<TerminalRef | null>).current =
          ref;
        setVoiceReady(true);
        setIsRecording(ref.isRecording);
        return true;
      }
      return false;
    };

    // Constants for polling configuration
    const REF_POLL_INTERVAL_MS = 100;
    const REF_POLL_MAX_ATTEMPTS = 30; // 3 seconds total

    // Try immediately
    const foundImmediately = checkRef();

    // Poll every 100ms until we get the ref (max 3 seconds) - only if not found immediately
    let interval: NodeJS.Timeout | null = null;
    if (!foundImmediately) {
      let attempts = 0;
      interval = setInterval(() => {
        attempts++;
        if (checkRef() || attempts >= REF_POLL_MAX_ATTEMPTS) {
          clearInterval(interval!);
        }
      }, REF_POLL_INTERVAL_MS);
    }

    // Note: Recording state is managed by Terminal component via WebSocket messages
    // The Terminal receives recordingStarted/recordingStopped messages and updates its state
    // We capture the initial state when ref is found, but rely on WebSocket for live updates

    return () => {
      if (interval) clearInterval(interval);
      setVoiceReady(false);
      setIsRecording(false);
    };
  }, [activeSession?.id, activeSession?.active, getAISessionRef]);

  // Wrapper to close sidebar on mobile when switching sessions
  const handleSetActiveSession = useCallback(
    (sessionId: string) => {
      setActiveAISessionId(sessionId);
      if (window.innerWidth < 768) {
        setSidebarOpen(false);
      }
    },
    [setActiveAISessionId],
  );

  const handleCreateSession = useCallback(
    async (toolId: AIToolId) => {
      // Prevent concurrent session creation using ref (not state) to avoid stale closure issues
      if (isCreatingSessionRef.current) {
        console.log(
          "[AI Coding] Session creation already in progress, ignoring",
        );
        return;
      }

      isCreatingSessionRef.current = true;

      try {
        // Capture current state values to avoid race conditions from state changes during async operations
        const currentActiveProject = activeProject;
        const currentDirectories = directories;
        const settings = getSettings();
        const projectPath = getProjectPath();

        // Find project info in directories to get the type
        const projectDirInfo = currentActiveProject
          ? currentDirectories.find((d) => d.name === currentActiveProject)
          : null;
        const projectType =
          projectDirInfo?.type === "folder" ? undefined : projectDirInfo?.type;

        // Check if we should create a worktree
        let worktreeInfo: { path: string; branch: string } | null = null;

        const shouldCreateWorktree =
          settings.autoWorktreeEnabled &&
          currentActiveProject &&
          projectType === "git";

        if (shouldCreateWorktree) {
          // Check if the project is a git repo
          try {
            const statusRes = await fetch(
              `/api/git/status?path=${encodeURIComponent(projectPath)}`,
            );
            const statusData = await statusRes.json();

            if (statusData.isGitRepo) {
              // Create the worktree
              const createRes = await fetch("/api/git/worktree", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ projectPath }),
              });

              if (createRes.ok) {
                worktreeInfo = await createRes.json();
              } else {
                // Notify user of worktree creation failure
                let errorDetails = "";
                try {
                  const errorData = await createRes.json();
                  errorDetails = errorData.error || "";
                } catch {
                  // Ignore parse error
                }
                console.error(
                  "[AI Coding] Worktree creation responded with non-OK status:",
                  {
                    status: createRes.status,
                    statusText: createRes.statusText,
                    errorDetails,
                  },
                );
                // Show user-visible notification (avoid exposing raw error details to prevent XSS)
                toast.error("Failed to create Git worktree", {
                  description:
                    "The session will use the main repository instead. See console for details.",
                });
              }
            }
          } catch (error) {
            console.error("[AI Coding] Failed to create worktree:", error);
            // Show user-visible notification for exceptions
            toast.error("Error creating Git worktree", {
              description: "The session will use the main repository instead.",
            });
          }
        }

        // Create the session
        if (currentActiveProject) {
          createAISession(toolId, {
            projectName: currentActiveProject,
            projectType,
            mountPath: worktreeInfo?.path || projectPath,
            // Worktree options
            worktreePath: worktreeInfo?.path,
            worktreeBranch: worktreeInfo?.branch,
            originalProjectPath: worktreeInfo ? projectPath : undefined,
          });
        } else {
          // No active project, use base path
          createAISession(toolId, { mountPath: basePath });
        }

        // Expand the group
        setCollapsedGroups((prev) => {
          const next = new Set(prev);
          next.delete(toolId);
          return next;
        });

        // Close sidebar on mobile after creating session
        if (window.innerWidth < 768) {
          setSidebarOpen(false);
        }
      } finally {
        isCreatingSessionRef.current = false;
      }
    },
    [
      createAISession,
      activeProject,
      getProjectPath,
      basePath,
      directories,
      // Note: isCreatingSessionRef is NOT in dependency array - refs don't trigger re-renders
      // Note: getSettings is intentionally NOT in the dependency array.
      // It's a stable module-level function that reads fresh values from localStorage
      // at call time, so including it would be misleading and unnecessary.
    ],
  );

  const toggleGroup = useCallback((toolId: AIToolId) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(toolId)) {
        next.delete(toolId);
      } else {
        next.add(toolId);
      }
      return next;
    });
  }, []);

  const toggleHostExpanded = useCallback((hostId: string) => {
    setExpandedHosts((prev) => {
      const next = new Set(prev);
      if (next.has(hostId)) {
        next.delete(hostId);
      } else {
        next.add(hostId);
      }
      return next;
    });
  }, []);

  const toggleCloudProviderExpanded = useCallback((providerId: string) => {
    setExpandedCloudProviders((prev) => {
      const next = new Set(prev);
      if (next.has(providerId)) {
        next.delete(providerId);
      } else {
        next.add(providerId);
      }
      return next;
    });
  }, []);

  // Rename session handlers
  const startEditing = useCallback(
    (sessionId: string, currentName: string, e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      setEditingSessionId(sessionId);
      setEditingName(currentName);
    },
    [],
  );

  const finishEditing = useCallback(() => {
    if (editingSessionId && editingName.trim()) {
      renameAISession(editingSessionId, editingName.trim());
    }
    setEditingSessionId(null);
    setEditingName("");
  }, [editingSessionId, editingName, renameAISession]);

  const handleEditKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        finishEditing();
      } else if (e.key === "Escape") {
        setEditingSessionId(null);
        setEditingName("");
      }
    },
    [finishEditing],
  );

  // Focus input when editing starts
  useEffect(() => {
    if (editingSessionId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingSessionId]);

  // Handle voice transcript - send to active terminal
  const handleVoiceTranscript = useCallback(
    (text: string) => {
      // Get ref directly from manager (more reliable than cached ref)
      const ref = activeSession ? getAISessionRef(activeSession.id) : null;

      if (ref) {
        // Send text, then Enter after short delay
        ref.sendInput(text);
        setTimeout(() => {
          const currentRef = activeSession
            ? getAISessionRef(activeSession.id)
            : null;
          currentRef?.sendInput("\r");
        }, 100);
      } else {
        console.warn("Voice: No terminal ref for session", activeSession?.id);
      }
    },
    [activeSession, getAISessionRef],
  );

  // Handle stop recording
  const handleStopRecording = useCallback(() => {
    if (!activeSession) return;

    const ref = getAISessionRef(activeSession.id);
    if (ref && ref.stopRecording) {
      try {
        ref.stopRecording();
        // Update state optimistically for responsive UI, server will confirm
        setIsRecording(false);
      } catch (error) {
        console.error("Failed to stop recording:", error);
        // Keep UI in sync even if stop fails
        setIsRecording(false);
      }
    }
  }, [activeSession, getAISessionRef]);

  // Group sessions by tool
  const sessionsByTool = AI_TOOLS.map((tool) => ({
    tool,
    sessions: aiSessions.filter((s) => s.toolId === tool.id),
  }));

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)]">
      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Mobile backdrop */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-20 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <div
          className={cn(
            "w-72 border-r bg-muted/30 flex flex-col transition-transform duration-300 z-30",
            "fixed top-0 bottom-0 left-0 md:top-24",
            sidebarOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          {/* Sidebar Header */}
          <div className="flex items-center justify-between px-4 py-2 border-b">
            <span className="text-sm font-semibold">AI Agents</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setSidebarOpen(false)}
            >
              <PanelLeftClose className="h-4 w-4" />
            </Button>
          </div>

          {/* Agent Sections */}
          <div className="flex-1 overflow-y-auto p-2">
            {/* Local Agents Section */}
            {showLocalAgents && (
              <div className="mb-2">
                <button
                  type="button"
                  className="w-full flex items-center justify-between px-2 py-2 rounded-md hover:bg-muted cursor-pointer h-9 border-0 bg-transparent text-left"
                  onClick={(e) => {
                    e.stopPropagation();
                    setLocalAgentsCollapsed(!localAgentsCollapsed);
                  }}
                >
                  <div className="flex items-center gap-2">
                    {localAgentsCollapsed ? (
                      <ChevronRight className="h-4 w-4 shrink-0" />
                    ) : (
                      <ChevronDown className="h-4 w-4 shrink-0" />
                    )}
                    <Monitor className="h-4 w-4 shrink-0" />
                    <span className="text-sm font-semibold whitespace-nowrap">
                      Local Agents
                    </span>
                  </div>
                </button>

                {!localAgentsCollapsed && (
                  <div className="ml-2 mt-1">
                    {sessionsByTool.map(({ tool, sessions: toolSessions }) => {
                      const Icon = tool.icon;
                      const isCollapsed = collapsedGroups.has(tool.id);
                      const hasActiveSessions = toolSessions.some(
                        (s) => s.active,
                      );
                      const showFolder = toolSessions.length >= 2;

                      return (
                        <div key={tool.id} className="mb-1">
                          {/* Agent Header - highlight entire name green if running */}
                          <div
                            className={cn(
                              "flex items-center justify-between px-2 py-1.5 rounded-md cursor-pointer",
                              hasActiveSessions
                                ? "bg-green-500/20"
                                : "hover:bg-muted",
                            )}
                            onClick={() =>
                              showFolder
                                ? toggleGroup(tool.id)
                                : toolSessions.length === 1
                                  ? handleSetActiveSession(toolSessions[0].id)
                                  : handleCreateSession(tool.id)
                            }
                          >
                            <div className="flex items-center gap-2">
                              {showFolder ? (
                                <button className="p-0.5">
                                  {isCollapsed ? (
                                    <ChevronRight className="h-4 w-4" />
                                  ) : (
                                    <ChevronDown className="h-4 w-4" />
                                  )}
                                </button>
                              ) : (
                                <span className="w-5" /> /* spacer */
                              )}
                              <Icon className="h-4 w-4" />
                              <span
                                className={cn(
                                  "text-sm font-medium",
                                  hasActiveSessions && "text-green-400",
                                )}
                              >
                                {tool.name}
                              </span>
                              {toolSessions.length > 0 && (
                                <span className="text-xs text-muted-foreground">
                                  ({toolSessions.length})
                                </span>
                              )}
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCreateSession(tool.id);
                              }}
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>

                          {/* Sessions - only show as nested list if 2+ sessions and not collapsed */}
                          {showFolder && !isCollapsed && (
                            <div className="ml-4 mt-1 space-y-1">
                              {toolSessions.map((session) => (
                                <div
                                  key={session.id}
                                  className={cn(
                                    "flex items-center justify-between px-2 py-1.5 rounded-md text-sm cursor-pointer group",
                                    activeAISessionId === session.id
                                      ? "bg-primary/10 text-primary"
                                      : "hover:bg-muted",
                                  )}
                                  onClick={() =>
                                    handleSetActiveSession(session.id)
                                  }
                                >
                                  <div className="flex items-center gap-2 min-w-0 flex-1">
                                    <span
                                      className={cn(
                                        "h-2 w-2 rounded-full shrink-0",
                                        session.active
                                          ? "bg-green-500"
                                          : "bg-gray-400",
                                      )}
                                    />
                                    {editingSessionId === session.id ? (
                                      <input
                                        ref={inputRef}
                                        type="text"
                                        value={editingName}
                                        onChange={(e) =>
                                          setEditingName(e.target.value)
                                        }
                                        onBlur={finishEditing}
                                        onKeyDown={handleEditKeyDown}
                                        onClick={(e) => e.stopPropagation()}
                                        className="bg-transparent border-b border-primary outline-none text-sm w-full min-w-0"
                                      />
                                    ) : (
                                      <span
                                        className="truncate"
                                        onContextMenu={(e) =>
                                          startEditing(
                                            session.id,
                                            session.name,
                                            e,
                                          )
                                        }
                                      >
                                        {session.name}
                                      </span>
                                    )}
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-5 w-5 opacity-0 group-hover:opacity-100"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      removeAISession(session.id);
                                    }}
                                  >
                                    <X className="h-3 w-3" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Single session shown inline (no folder) */}
                          {!showFolder && toolSessions.length === 1 && (
                            <div className="ml-6 mt-1">
                              <div
                                className={cn(
                                  "flex items-center justify-between px-2 py-1 rounded-md text-sm cursor-pointer group",
                                  activeAISessionId === toolSessions[0].id
                                    ? "bg-primary/10 text-primary"
                                    : "hover:bg-muted",
                                )}
                                onClick={() =>
                                  handleSetActiveSession(toolSessions[0].id)
                                }
                              >
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  <span
                                    className={cn(
                                      "h-2 w-2 rounded-full shrink-0",
                                      toolSessions[0].active
                                        ? "bg-green-500"
                                        : "bg-gray-400",
                                    )}
                                  />
                                  <span className="truncate text-xs">
                                    {toolSessions[0].name}
                                  </span>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-5 w-5 opacity-0 group-hover:opacity-100"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeAISession(toolSessions[0].id);
                                  }}
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Tailscale Hosts Section */}
            {showTailscaleAgents && (
              <div className="mb-2">
                <button
                  type="button"
                  className="w-full flex items-center justify-between px-2 py-2 rounded-md hover:bg-muted cursor-pointer h-9 border-0 bg-transparent text-left"
                  onClick={(e) => {
                    e.stopPropagation();
                    setHostsCollapsed(!hostsCollapsed);
                  }}
                >
                  <div className="flex items-center gap-2">
                    {hostsCollapsed ? (
                      <ChevronRight className="h-4 w-4 shrink-0" />
                    ) : (
                      <ChevronDown className="h-4 w-4 shrink-0" />
                    )}
                    <TailscaleIcon size={16} className="shrink-0" />
                    <span className="text-sm font-semibold whitespace-nowrap">
                      Tailscale Hosts
                    </span>
                    <span className="text-xs text-muted-foreground">
                      ({tailscaleHosts.length})
                    </span>
                  </div>
                </button>

                {!hostsCollapsed && (
                  <div className="ml-2 mt-1 space-y-0.5">
                    {tailscaleHosts.map((host) => {
                      const isExpanded = expandedHosts.has(host.id);
                      const isSelected = selectedHostId === host.id;
                      // Placeholder: In future, this will show agents on this host
                      const hostAgents: string[] = host.agents || [];

                      return (
                        <div key={host.id}>
                          <div
                            className={cn(
                              "flex items-center justify-between px-2 py-1.5 rounded-md cursor-pointer group",
                              isSelected
                                ? "bg-primary/10 text-primary"
                                : "hover:bg-muted",
                            )}
                            onClick={() => {
                              setSelectedHostId(isSelected ? null : host.id);
                              if (!isExpanded) {
                                toggleHostExpanded(host.id);
                              }
                            }}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <button
                                className="p-0.5"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleHostExpanded(host.id);
                                }}
                              >
                                {isExpanded ? (
                                  <ChevronDown className="h-3 w-3" />
                                ) : (
                                  <ChevronRight className="h-3 w-3" />
                                )}
                              </button>
                              <OsIcon os={host.os} size={16} />
                              <span className="text-sm truncate">
                                {host.displayName}
                              </span>
                            </div>
                            <span className="text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                              {host.ip}
                            </span>
                          </div>

                          {/* Host agents (expandable) - show running agents and launch options */}
                          {isExpanded && (
                            <div className="ml-6 mt-0.5 space-y-0.5">
                              {/* Running agents */}
                              {hostAgents.length > 0 && (
                                <div className="mb-1">
                                  {hostAgents.map((agent, idx) => (
                                    <div
                                      key={idx}
                                      className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground"
                                    >
                                      <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                                      {agent}
                                    </div>
                                  ))}
                                </div>
                              )}
                              {/* Launch agent options */}
                              {AI_TOOLS.map((tool) => {
                                const ToolIcon = tool.icon;
                                return (
                                  <div
                                    key={tool.id}
                                    className="flex items-center justify-between px-2 py-1 rounded-md hover:bg-muted cursor-pointer group"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      // TODO: Launch agent on remote host via SSH/Tailscale
                                      console.log(
                                        `Launch ${tool.name} on ${host.displayName} (${host.ip})`,
                                      );
                                    }}
                                  >
                                    <div className="flex items-center gap-2">
                                      <ToolIcon className="h-3 w-3 text-muted-foreground" />
                                      <span className="text-xs">
                                        {tool.name}
                                      </span>
                                    </div>
                                    <Plus className="h-3 w-3 opacity-0 group-hover:opacity-100 text-muted-foreground" />
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Cloud Agents Section */}
            {showCloudAgents && (
              <div className="mb-2">
                <button
                  type="button"
                  className="w-full flex items-center justify-between px-2 py-2 rounded-md hover:bg-muted cursor-pointer h-9 border-0 bg-transparent text-left"
                  onClick={(e) => {
                    e.stopPropagation();
                    setCloudAgentsCollapsed(!cloudAgentsCollapsed);
                  }}
                >
                  <div className="flex items-center gap-2">
                    {cloudAgentsCollapsed ? (
                      <ChevronRight className="h-4 w-4 shrink-0" />
                    ) : (
                      <ChevronDown className="h-4 w-4 shrink-0" />
                    )}
                    <Cloud className="h-4 w-4 shrink-0" />
                    <span className="text-sm font-semibold whitespace-nowrap">
                      Cloud Agents
                    </span>
                  </div>
                </button>

                {!cloudAgentsCollapsed && (
                  <div className="ml-2 mt-1 space-y-0.5">
                    {CLOUD_PROVIDERS.map((provider) => {
                      const isExpanded = expandedCloudProviders.has(
                        provider.id,
                      );

                      return (
                        <div key={provider.id}>
                          <div
                            className="flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-muted cursor-pointer"
                            onClick={() =>
                              toggleCloudProviderExpanded(provider.id)
                            }
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <button className="p-0.5">
                                {isExpanded ? (
                                  <ChevronDown className="h-3 w-3" />
                                ) : (
                                  <ChevronRight className="h-3 w-3" />
                                )}
                              </button>
                              <CloudProviderIcon
                                provider={provider.id}
                                size={16}
                              />
                              <span className="text-sm">{provider.name}</span>
                            </div>
                          </div>

                          {/* Provider agents (expandable) */}
                          {isExpanded && (
                            <div className="ml-6 mt-0.5 space-y-0.5">
                              {AI_TOOLS.map((tool) => {
                                const ToolIcon = tool.icon;
                                return (
                                  <div
                                    key={tool.id}
                                    className="flex items-center justify-between px-2 py-1 rounded-md hover:bg-muted cursor-pointer group"
                                    onClick={() => {
                                      // TODO: Launch cloud agent on this provider
                                      console.log(
                                        `Launch ${tool.name} on ${provider.name}`,
                                      );
                                    }}
                                  >
                                    <div className="flex items-center gap-2">
                                      <ToolIcon className="h-3 w-3 text-muted-foreground" />
                                      <span className="text-xs">
                                        {tool.name}
                                      </span>
                                    </div>
                                    <Plus className="h-3 w-3 opacity-0 group-hover:opacity-100 text-muted-foreground" />
                                  </div>
                                );
                              })}
                              <p className="text-xs text-muted-foreground px-2 py-1 italic">
                                Coming soon
                              </p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Current Project Indicator */}
          {activeProject && (
            <div className="p-2 border-t">
              <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground">
                <FolderOpen className="h-3 w-3" />
                <span className="truncate">{activeProject}</span>
              </div>
            </div>
          )}
        </div>

        {/* Main Content */}
        <div
          className={cn(
            "flex-1 flex flex-col transition-all duration-300",
            sidebarOpen && "md:ml-72",
          )}
        >
          {activeSession ? (
            <>
              {/* Terminal Header */}
              <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
                <div className="flex items-center gap-3">
                  {/* Sidebar toggle button - show on mobile always, on desktop when sidebar closed */}
                  {!sidebarOpen && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setSidebarOpen(true)}
                    >
                      <Menu className="h-5 w-5" />
                    </Button>
                  )}
                  <div
                    className={cn(
                      "h-2 w-2 rounded-full",
                      activeSession.active ? "bg-green-500" : "bg-gray-400",
                    )}
                  />
                  <div>
                    <h3 className="font-medium text-sm">
                      {activeSession.name}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {
                        AI_TOOLS.find((t) => t.id === activeSession.toolId)
                          ?.description
                      }
                    </p>
                  </div>
                  {activeSession.toolId === "claude" && (
                    <div
                      className={cn(
                        "flex items-center gap-1 px-2 py-0.5 rounded text-xs",
                        claudeSkipPermissions
                          ? "bg-orange-500/20 text-orange-500"
                          : "bg-green-500/20 text-green-500",
                      )}
                      title={
                        claudeSkipPermissions
                          ? "Auto-approve enabled"
                          : "Permission prompts enabled"
                      }
                    >
                      {claudeSkipPermissions ? (
                        <>
                          <ShieldOff className="h-3 w-3" />
                          <span>Auto</span>
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="h-3 w-3" />
                          <span>Safe</span>
                        </>
                      )}
                    </div>
                  )}
                  {activeSession.isWorktree && activeSession.worktreeBranch && (
                    <div
                      className="flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-green-500/20 text-green-400"
                      title={`Git worktree: ${activeSession.worktreeBranch}`}
                    >
                      <GitBranch className="h-3 w-3" />
                      <span>{activeSession.worktreeBranch}</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {/* Terminal Recordings */}
                  <TerminalRecordingsPanel />

                  {/* Recording indicator and stop button */}
                  {activeSession.active && isRecording && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleStopRecording}
                      className="gap-2 border-red-500/50 text-red-500 hover:bg-red-500/10 hover:text-red-500"
                    >
                      <Circle className="h-3 w-3 fill-red-500 animate-pulse" />
                      Recording
                      <VideoOff className="h-4 w-4" />
                    </Button>
                  )}

                  {activeSession.active && (
                    <div className="flex items-center gap-1 mr-2">
                      <VoiceInput
                        onTranscript={handleVoiceTranscript}
                        disabled={!voiceReady}
                      />
                      {!voiceReady && (
                        <span className="text-xs text-muted-foreground animate-pulse">
                          connecting...
                        </span>
                      )}
                    </div>
                  )}
                  {activeSession.active ? (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => restartAISession(activeSession.id)}
                      >
                        <RefreshCw className="h-4 w-4 mr-1" />
                        Restart
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => stopAISession(activeSession.id)}
                      >
                        <Square className="h-4 w-4 mr-1" />
                        Stop
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => restartAISession(activeSession.id)}
                    >
                      <Play className="h-4 w-4 mr-1" />
                      Start
                    </Button>
                  )}
                </div>
              </div>

              {/* Terminal - Display container, terminal moved here from manager */}
              <div className="flex-1 bg-[#1a1b26]">
                {activeSession.active ? (
                  <div ref={terminalContainerRef} className="h-full" />
                ) : (
                  <div className="h-full flex items-center justify-center text-gray-500">
                    <div className="text-center">
                      <Container className="h-16 w-16 mx-auto mb-4 opacity-30" />
                      <p>Session stopped</p>
                      <Button
                        className="mt-4"
                        onClick={() => restartAISession(activeSession.id)}
                      >
                        <Play className="h-4 w-4 mr-2" />
                        Restart Session
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col">
              {/* Empty state header with menu button - show when sidebar closed */}
              {!sidebarOpen && (
                <div className="flex items-center px-4 py-2 border-b bg-muted/30">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setSidebarOpen(true)}
                  >
                    <Menu className="h-5 w-5" />
                  </Button>
                </div>
              )}

              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                <div className="text-center max-w-md px-4">
                  <Bot className="h-16 w-16 mx-auto mb-4 opacity-30" />
                  <h3 className="text-lg font-medium mb-2">Coding Agents</h3>
                  <p className="text-sm mb-6">
                    Launch AI coding assistants in isolated containers. Each
                    session runs independently with access to your workspace.
                    <br />
                    <span className="text-xs text-muted-foreground mt-2 block">
                      Sessions persist across page navigation!
                    </span>
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {AI_TOOLS.map((tool) => {
                      const Icon = tool.icon;
                      return (
                        <Button
                          key={tool.id}
                          variant="outline"
                          className="h-auto py-3 flex-col gap-1"
                          onClick={() => handleCreateSession(tool.id)}
                        >
                          <Icon className="h-5 w-5" />
                          <span className="text-xs">{tool.name}</span>
                        </Button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
