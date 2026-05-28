"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Bot,
  Plus,
  X,
  Mic,
  ChevronDown,
  Sparkles,
  Github,
  Stars,
  Braces,
  Code2,
  MonitorSmartphone,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useProject } from "@/lib/project-context";
import {
  useTerminalManager,
  type AIToolId as ManagerAIToolId,
} from "@/components/terminal/TerminalManager";

export type AIToolId = "claude" | "opencode" | "copilot" | "gemini" | "codex";

// Tool icon + accent color mapping. Each AI tool gets an associated Lucide
// glyph (some are brand marks, e.g. GitHub for Copilot) and a fixed accent
// color that serves as the tool's per-tool BRAND identity in the tab strip.
const TOOL_META: Record<
  AIToolId,
  {
    Icon: React.ComponentType<{ className?: string }>;
    accent: string;
    label: string;
  }
> = {
  // Intentional fixed palette: these accents are per-tool BRAND identity for the
  // five AI tools, not theme state. They are deliberately exempt from the
  // semantic-token rule — collapsing them to one token would erase the visual
  // distinction between tools. Brand hues stay constant across light/dark.
  claude: { Icon: Sparkles, accent: "text-orange-500", label: "Claude" },
  copilot: { Icon: Github, accent: "text-emerald-500", label: "Copilot" },
  gemini: { Icon: Stars, accent: "text-blue-500", label: "Gemini" },
  codex: { Icon: Braces, accent: "text-violet-500", label: "Codex" },
  opencode: { Icon: Code2, accent: "text-cyan-500", label: "OpenCode" },
};

export function AgentTabsLayout() {
  // The tab bar is a thin view over the TerminalManager singleton. The
  // manager renders the actual <Terminal> instances in a fixed-position
  // container OUTSIDE any page (TerminalManagerProvider), so a session's
  // WebSocket + container survive client-side navigation. This component
  // therefore NEVER renders its own <Terminal> — it derives tabs from
  // `aiSessions` and overlays the manager's persistent terminal onto the
  // tab panel via getBoundingClientRect (same technique as AgentTreeLayout).
  // On remount (e.g. nav away + back) the tabs repopulate automatically
  // because they are computed from the still-live `aiSessions`.
  const {
    aiSessions,
    activeAISessionId,
    setActiveAISessionId,
    createAISession,
    removeAISession,
    renameAISession,
  } = useTerminalManager();

  const { activeProject, getProjectPath, basePath } = useProject();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [expandedTabId, setExpandedTabId] = useState<string | null>(null);
  const [launchDialogOpen, setLaunchDialogOpen] = useState(false);
  const [selectedTool, setSelectedTool] = useState<AIToolId>("claude");
  const inputRef = useRef<HTMLInputElement>(null);
  // Tab DOM nodes by session id, so arrow-key navigation can move focus to the
  // newly selected tab (roving tabindex / WAI-ARIA tabs pattern).
  const tabRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const terminalContainerRef = useRef<HTMLDivElement>(null);

  const tabs = aiSessions;
  const activeSession = useMemo(
    () => aiSessions.find((s) => s.id === activeAISessionId) ?? null,
    [aiSessions, activeAISessionId],
  );

  // If no tab is active but sessions exist (e.g. after returning from another
  // page where activeAISessionId was cleared), select the most recent one so
  // the tab bar always shows a live selection.
  useEffect(() => {
    if (!activeAISessionId && aiSessions.length > 0) {
      setActiveAISessionId(aiSessions[aiSessions.length - 1].id);
    }
  }, [activeAISessionId, aiSessions, setActiveAISessionId]);

  // Issue 2: deep-link "return to session" from the Sessions page.
  // /ai-coding?session=<containerName> selects the matching live session.
  useEffect(() => {
    const target = searchParams.get("session");
    if (!target) return;
    const match = aiSessions.find((s) => s.containerName === target);
    if (match) {
      setActiveAISessionId(match.id);
    }
    // Clear the param so a refresh doesn't re-trigger selection.
    router.replace("/ai-coding");
  }, [searchParams, aiSessions, setActiveAISessionId, router]);

  const launchSession = useCallback(
    (tool: AIToolId) => {
      const projectPath = getProjectPath();
      if (activeProject) {
        createAISession(tool as ManagerAIToolId, {
          projectName: activeProject,
          mountPath: projectPath,
        });
      } else {
        createAISession(tool as ManagerAIToolId, { mountPath: basePath });
      }
      setLaunchDialogOpen(false);
    },
    [activeProject, getProjectPath, basePath, createAISession],
  );

  const closeTab = useCallback(
    (sessionId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      // removeAISession handles active-session reselection and worktree
      // cleanup, and stops the underlying terminal/container.
      void removeAISession(sessionId);
      if (expandedTabId === sessionId) {
        setExpandedTabId(null);
      }
    },
    [removeAISession, expandedTabId],
  );

  const startEditing = useCallback(
    (sessionId: string, currentName: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setEditingTabId(sessionId);
      setEditingName(currentName);
    },
    [],
  );

  const finishEditing = useCallback(() => {
    if (editingTabId && editingName.trim()) {
      renameAISession(editingTabId, editingName.trim());
    }
    setEditingTabId(null);
    setEditingName("");
  }, [editingTabId, editingName, renameAISession]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        finishEditing();
      } else if (e.key === "Escape") {
        setEditingTabId(null);
        setEditingName("");
      }
    },
    [finishEditing],
  );

  const toggleInfoPanel = useCallback(
    (sessionId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setExpandedTabId(expandedTabId === sessionId ? null : sessionId);
    },
    [expandedTabId],
  );

  useEffect(() => {
    if (editingTabId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingTabId]);

  // Keyboard shortcuts: Cmd/Ctrl + 1..9 to switch tabs. Bound on the window
  // so it works even when focus is inside the xterm canvas.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editingTabId !== null) return;
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key < "1" || e.key > "9") return;
      const idx = Number(e.key) - 1;
      if (idx >= tabs.length) return;
      e.preventDefault();
      setActiveAISessionId(tabs[idx].id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tabs, editingTabId, setActiveAISessionId]);

  // Overlay the manager's persistent terminal (#ai-terminal-<id>) onto the
  // tab panel by syncing its fixed position to terminalContainerRef. Same
  // approach AgentTreeLayout uses — the terminal element lives in the
  // TerminalManagerProvider tree and we only move/position it via CSS.
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

    const debouncedUpdatePosition = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        rafId = null;
        updatePosition();
      });
    };

    updatePosition();

    const resizeObserver = new ResizeObserver(debouncedUpdatePosition);
    resizeObserver.observe(container);
    window.addEventListener("resize", debouncedUpdatePosition);

    return () => {
      if (isCleanedUp) return;
      isCleanedUp = true;
      if (rafId !== null) cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      window.removeEventListener("resize", debouncedUpdatePosition);
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

  const formatUptime = (startTime: number) => {
    const seconds = Math.floor((Date.now() - startTime) / 1000);
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  };

  // Map a session's toolId to the tab's brand glyph/accent. Falls back to
  // Claude metadata for any unexpected tool id so the tab still renders.
  const metaFor = (toolId: string) =>
    TOOL_META[
      (toolId as AIToolId) in TOOL_META ? (toolId as AIToolId) : "claude"
    ];

  // WAI-ARIA tabs keyboard handler (roving tabindex).
  const onTabKeyDown = (sessionId: string) => (e: React.KeyboardEvent) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setActiveAISessionId(sessionId);
      return;
    }
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const idx = tabs.findIndex((t) => t.id === sessionId);
    if (idx < 0) return;
    e.preventDefault();
    const delta = e.key === "ArrowRight" ? 1 : -1;
    const nextIdx = (idx + delta + tabs.length) % tabs.length;
    const nextId = tabs[nextIdx].id;
    setActiveAISessionId(nextId);
    tabRefs.current.get(nextId)?.focus();
  };

  return (
    // Subtract both the main titlebar (h-14 = 3.5rem) and the AI Coding
    // sub-nav (h-10 = 2.5rem) so the terminal area runs to the viewport
    // bottom. Use dvh so mobile browser chrome doesn't clip the bottom.
    <div className="flex flex-col h-[calc(100dvh-6rem)]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            <h1 className="text-xl font-bold">AI Coding</h1>
          </div>
          {activeProject && (
            <span className="text-sm text-muted-foreground">
              {activeProject}
            </span>
          )}
        </div>
        <Button variant="ghost" size="icon">
          <Mic className="h-4 w-4" />
        </Button>
      </div>

      {/* Tab Bar */}
      {tabs.length > 0 && (
        <div className="flex items-center border-b bg-muted/30 px-2">
          <div
            role="tablist"
            aria-label="AI agent sessions"
            className="flex items-center gap-0.5 overflow-x-auto py-1 flex-1"
          >
            <TooltipProvider delayDuration={400}>
              {tabs.map((tab, idx) => {
                const isActive = activeAISessionId === tab.id;
                const stray = !tab.active;
                const { Icon: ToolIcon, accent, label } = metaFor(tab.toolId);
                return (
                  <Tooltip key={tab.id}>
                    <TooltipTrigger asChild>
                      <div
                        ref={(el) => {
                          if (el) tabRefs.current.set(tab.id, el);
                          else tabRefs.current.delete(tab.id);
                        }}
                        role="tab"
                        id={`agent-tab-${tab.id}`}
                        aria-selected={isActive}
                        aria-controls={`agent-tabpanel-${tab.id}`}
                        tabIndex={isActive ? 0 : -1}
                        onKeyDown={onTabKeyDown(tab.id)}
                        className={cn(
                          "flex items-center gap-1.5 pl-2.5 pr-1 py-1.5 rounded-t-md border-b-2 -mb-px transition-colors cursor-pointer group select-none min-w-0",
                          isActive
                            ? "bg-background border-primary shadow-[0_-1px_0_0_var(--border)_inset,1px_0_0_0_var(--border),_-1px_0_0_0_var(--border)]"
                            : "bg-transparent border-transparent hover:bg-muted",
                          stray && "text-warning",
                        )}
                        onClick={() => setActiveAISessionId(tab.id)}
                      >
                        {/* Status / stray dot */}
                        <span
                          className={cn(
                            "inline-block h-2 w-2 rounded-full shrink-0",
                            stray ? "bg-warning" : "bg-success",
                          )}
                          aria-hidden
                        />
                        {/* Tool icon */}
                        <ToolIcon
                          className={cn("h-3.5 w-3.5 shrink-0", accent)}
                        />
                        <MonitorSmartphone className="h-3 w-3 shrink-0 text-muted-foreground" />
                        {editingTabId === tab.id ? (
                          <input
                            ref={inputRef}
                            type="text"
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            onBlur={finishEditing}
                            onKeyDown={handleKeyDown}
                            className="w-24 px-1 text-sm bg-background border rounded"
                          />
                        ) : (
                          <span
                            className="text-sm font-medium truncate max-w-[14ch]"
                            onDoubleClick={(e) =>
                              startEditing(tab.id, tab.name, e)
                            }
                          >
                            {tab.name}
                          </span>
                        )}
                        {stray && (
                          <AlertTriangle
                            className="h-3 w-3 shrink-0 text-warning"
                            aria-label="Session ended"
                          />
                        )}
                        {/* Tab-number hint shows on hover for tabs 1..9 */}
                        {idx < 9 && (
                          <kbd className="hidden md:inline-block ml-0.5 text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity font-mono">
                            ⌘{idx + 1}
                          </kbd>
                        )}
                        <button
                          onClick={(e) => toggleInfoPanel(tab.id, e)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-muted"
                          aria-label="Show details"
                        >
                          <ChevronDown
                            className={cn(
                              "h-3 w-3 transition-transform",
                              expandedTabId === tab.id && "rotate-180",
                            )}
                          />
                        </button>
                        <button
                          onClick={(e) => closeTab(tab.id, e)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-destructive/20 hover:text-destructive"
                          aria-label="Close tab"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">
                      <div className="flex flex-col gap-0.5">
                        <span>{label} · Local</span>
                        {stray ? (
                          <span className="text-warning">Session ended</span>
                        ) : (
                          <span className="text-muted-foreground">
                            ● Running
                            {tab.containerName ? ` · ${tab.containerName}` : ""}
                          </span>
                        )}
                        {idx < 9 && (
                          <span className="text-muted-foreground">
                            Switch: ⌘/Ctrl + {idx + 1}
                          </span>
                        )}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </TooltipProvider>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLaunchDialogOpen(true)}
            aria-label="Launch new agent"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Fold-down Info Panel */}
      {expandedTabId && (
        <div className="border-b bg-muted/20 p-4">
          {tabs
            .filter((t) => t.id === expandedTabId)
            .map((tab) => (
              <div
                key={tab.id}
                className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm"
              >
                <div>
                  <span className="text-muted-foreground">Agent:</span>{" "}
                  <span className="font-medium capitalize">{tab.toolId}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Status:</span>{" "}
                  <span
                    className={cn(
                      "font-medium",
                      tab.active ? "text-success" : "text-warning",
                    )}
                  >
                    {tab.active
                      ? `● Running (${formatUptime(tab.createdAt)})`
                      : "○ Ended"}
                  </span>
                </div>
                {tab.containerName && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Container:</span>{" "}
                    <code className="font-mono text-xs">
                      {tab.containerName}
                    </code>
                  </div>
                )}
                <div className="col-span-2">
                  <span className="text-muted-foreground">Mount:</span>{" "}
                  <span className="font-medium">{tab.mountPath}</span>
                </div>
                <div className="col-span-2 flex gap-2 mt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => startEditing(tab.id, tab.name, e)}
                  >
                    Rename
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => closeTab(tab.id, e)}
                  >
                    Stop
                  </Button>
                  <Button size="sm" variant="outline" asChild>
                    <Link href="/ai-coding/sessions">Manage sessions</Link>
                  </Button>
                </div>
              </div>
            ))}
        </div>
      )}

      {/* Terminal Area — the active session's persistent terminal (rendered by
          TerminalManagerProvider) is positioned over this container. This
          component renders NO <Terminal> of its own. */}
      <div className="flex-1 relative overflow-hidden">
        {tabs.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Bot className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground mb-4">No active agents</p>
              <Button onClick={() => setLaunchDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Launch Agent
              </Button>
            </div>
          </div>
        ) : (
          <div
            ref={terminalContainerRef}
            role="tabpanel"
            id={`agent-tabpanel-${activeAISessionId ?? "none"}`}
            aria-labelledby={`agent-tab-${activeAISessionId ?? "none"}`}
            className="absolute inset-0"
          />
        )}
      </div>

      {/* Launch Agent Dialog */}
      <Dialog open={launchDialogOpen} onOpenChange={setLaunchDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Launch New Agent</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div>
              <label className="text-sm font-medium mb-3 block">Agent:</label>
              <div className="space-y-2">
                {(
                  [
                    { id: "claude", label: "Claude Code" },
                    { id: "opencode", label: "OpenCode" },
                    { id: "copilot", label: "GitHub Copilot" },
                    { id: "gemini", label: "Gemini CLI" },
                    { id: "codex", label: "Codex CLI" },
                  ] as { id: AIToolId; label: string }[]
                ).map(({ id, label }) => {
                  const { Icon, accent } = TOOL_META[id];
                  return (
                    <label
                      key={id}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <input
                        type="radio"
                        value={id}
                        checked={selectedTool === id}
                        onChange={(e) =>
                          setSelectedTool(e.target.value as AIToolId)
                        }
                        className="text-primary"
                      />
                      <Icon className={cn("h-4 w-4", accent)} />
                      <span>{label}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setLaunchDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button onClick={() => launchSession(selectedTool)}>
                Launch
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
