"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
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
  Cloud,
  Network,
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
import { getSettings } from "@/lib/settings";
import { useProject } from "@/lib/project-context";
import { buildTerminalWsUrl } from "@/lib/websocket-utils";

const Terminal = dynamic(
  () => import("@/components/terminal/Terminal").then((mod) => mod.Terminal),
  { ssr: false },
);

export type AIToolId = "claude" | "opencode" | "copilot" | "gemini" | "codex";
export type LocationType = "local" | "tailscale" | "cloud";

interface AgentTab {
  id: string;
  name: string;
  key: number;
  tool: AIToolId;
  location: LocationType;
  locationName: string;
  recording: boolean;
  status: "running" | "stopped";
  startTime: number;
  // Server-assigned docker container name (`daax-<8>`), captured when
  // the Terminal forwards the first session message. Used to detect
  // "stray/lost" tabs when the container disappears from `docker ps`.
  containerName?: string;
}

// Tool icon + accent color mapping. We intentionally use generic Lucide
// glyphs (not brand marks) to keep this dependency-free and on-theme.
const TOOL_META: Record<
  AIToolId,
  {
    Icon: React.ComponentType<{ className?: string }>;
    accent: string;
    label: string;
  }
> = {
  claude: { Icon: Sparkles, accent: "text-orange-500", label: "Claude" },
  copilot: { Icon: Github, accent: "text-emerald-500", label: "Copilot" },
  gemini: { Icon: Stars, accent: "text-blue-500", label: "Gemini" },
  codex: { Icon: Braces, accent: "text-violet-500", label: "Codex" },
  opencode: { Icon: Code2, accent: "text-cyan-500", label: "OpenCode" },
};

const LOCATION_META: Record<
  LocationType,
  { Icon: React.ComponentType<{ className?: string }>; label: string }
> = {
  local: { Icon: MonitorSmartphone, label: "Local" },
  tailscale: { Icon: Network, label: "Tailscale" },
  cloud: { Icon: Cloud, label: "Cloud" },
};

const ACTIVE_SESSIONS_POLL_MS = 7_000;

export function AgentTabsLayout() {
  const [tabs, setTabs] = useState<AgentTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [tabCounter, setTabCounter] = useState(0);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [expandedTabId, setExpandedTabId] = useState<string | null>(null);
  const [launchDialogOpen, setLaunchDialogOpen] = useState(false);
  const [selectedTool, setSelectedTool] = useState<AIToolId>("claude");
  const [selectedLocationName, setSelectedLocationName] = useState("muckross");
  // Sets of `daax-*` container names from /api/ai/active-sessions (which
  // queries `docker ps -a`, so it includes stopped/exited containers).
  // `knownContainers` holds every session container regardless of state — a
  // tab whose containerName is missing from it has truly disappeared (stray).
  // `runningContainers` holds only `state === "running"` ones and drives the
  // running/stopped status UI without conflating "stopped" with "gone".
  const [knownContainers, setKnownContainers] = useState<Set<string>>(
    new Set(),
  );
  const [runningContainers, setRunningContainers] = useState<Set<string>>(
    new Set(),
  );
  const [draggingTabId, setDraggingTabId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Tab DOM nodes by tab id, so arrow-key navigation can move focus to the
  // newly selected tab (roving tabindex / WAI-ARIA tabs pattern).
  const tabRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const { activeProject, directories, basePath } = useProject();

  const getLocationType = (locationName: string): LocationType => {
    if (locationName === "muckross") return "local";
    if (["kinsale", "galway", "adare"].includes(locationName))
      return "tailscale";
    return "cloud";
  };

  const addTab = useCallback(
    (tool: AIToolId, location: LocationType, locationName: string) => {
      const newId = `agent-${Date.now()}`;
      const newCounter = tabCounter + 1;
      setTabCounter(newCounter);

      const newTab: AgentTab = {
        id: newId,
        name: `${TOOL_META[tool].label} ${newCounter}`,
        key: newCounter,
        tool,
        location,
        locationName,
        recording: true,
        status: "running",
        startTime: Date.now(),
      };

      setTabs((prev) => [...prev, newTab]);
      setActiveTabId(newId);
      setLaunchDialogOpen(false);
    },
    [tabCounter],
  );

  const closeTab = useCallback(
    (tabId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setTabs((prev) => {
        const newTabs = prev.filter((t) => t.id !== tabId);
        if (activeTabId === tabId && newTabs.length > 0) {
          setActiveTabId(newTabs[newTabs.length - 1].id);
        } else if (newTabs.length === 0) {
          setActiveTabId(null);
        }
        return newTabs;
      });
      if (expandedTabId === tabId) {
        setExpandedTabId(null);
      }
    },
    [activeTabId, expandedTabId],
  );

  const startEditing = useCallback(
    (tabId: string, currentName: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setEditingTabId(tabId);
      setEditingName(currentName);
    },
    [],
  );

  const finishEditing = useCallback(() => {
    if (editingTabId && editingName.trim()) {
      setTabs((prev) =>
        prev.map((tab) =>
          tab.id === editingTabId ? { ...tab, name: editingName.trim() } : tab,
        ),
      );
    }
    setEditingTabId(null);
    setEditingName("");
  }, [editingTabId, editingName]);

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
    (tabId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setExpandedTabId(expandedTabId === tabId ? null : tabId);
    },
    [expandedTabId],
  );

  useEffect(() => {
    if (editingTabId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingTabId]);

  // Keyboard shortcuts: Cmd/Ctrl + 1..9 to switch tabs. We bind on the
  // window so this works even when focus is inside the xterm canvas
  // (xterm.js wraps a textarea but still surfaces metaKey/ctrlKey).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key < "1" || e.key > "9") return;
      const idx = Number(e.key) - 1;
      if (idx >= tabs.length) return;
      e.preventDefault();
      setActiveTabId(tabs[idx].id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tabs]);

  // Poll for live container names so tabs can flag strays/lost sessions.
  // Skipped entirely when there are no tabs to avoid pointless network.
  useEffect(() => {
    if (tabs.length === 0) return;
    let cancelled = false;
    const fetchNow = async () => {
      try {
        const res = await fetch("/api/ai/active-sessions", {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled || !data?.success) return;
        const sessions: { state: string; containerName: string }[] =
          data.sessions ?? [];
        setKnownContainers(new Set(sessions.map((s) => s.containerName)));
        setRunningContainers(
          new Set(
            sessions
              .filter((s) => s.state === "running")
              .map((s) => s.containerName),
          ),
        );
      } catch {
        // Best-effort — leave previous state on failure.
      }
    };
    fetchNow();
    const id = setInterval(fetchNow, ACTIVE_SESSIONS_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [tabs.length]);

  const buildWsUrl = useCallback(
    (tab: AgentTab) => {
      const params = new URLSearchParams();
      const settings = getSettings();

      params.set("mode", "container");
      const containerImage =
        settings.aiCoding?.defaultContainerImage || settings.containerImage;
      params.set("image", containerImage);

      if (activeProject) {
        params.set("project", activeProject);
        params.set("basePath", basePath);

        const projectInfo = directories.find((d) => d.name === activeProject);
        if (projectInfo?.type) {
          params.set("projectType", projectInfo.type);
        }
      } else {
        params.set("mount", basePath);
      }

      params.set("sessionType", `ai-${tab.tool}`);
      if (tab.recording) {
        params.set("record", "true");
      }

      const toolCommands = {
        claude: "claude",
        opencode: "opencode",
        copilot: "copilot",
        gemini: "gemini",
        codex: "codex",
      };

      const command = toolCommands[tab.tool];
      if (tab.tool === "claude" && settings.claudeSkipPermissions) {
        params.set("command", `${command} --dangerously-skip-permissions`);
      } else {
        params.set("command", command);
      }

      return buildTerminalWsUrl(params);
    },
    [activeProject, directories, basePath],
  );

  const formatUptime = (startTime: number) => {
    const seconds = Math.floor((Date.now() - startTime) / 1000);
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  };

  // Capture server-assigned container name when the Terminal first
  // reports it via the session message — feeds the stray check.
  const handleSessionStart = useCallback(
    (
      tabId: string,
      _sessionId: string,
      _mode: string,
      containerName?: string,
    ) => {
      if (!containerName) return;
      setTabs((prev) =>
        prev.map((t) => (t.id === tabId ? { ...t, containerName } : t)),
      );
    },
    [],
  );

  // Drag-to-reorder using native HTML5 drag-and-drop — no new deps. We
  // don't bother with reorder animations; this is a low-frequency action.
  const onDragStart = (tabId: string) => (e: React.DragEvent) => {
    setDraggingTabId(tabId);
    e.dataTransfer.effectAllowed = "move";
    // Required for the drag to actually start in Firefox/Safari
    e.dataTransfer.setData("text/plain", tabId);
  };
  const onDragOver = (overTabId: string) => (e: React.DragEvent) => {
    if (!draggingTabId || draggingTabId === overTabId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    // Position-aware insert: only move when the pointer is past the target's
    // horizontal midpoint, on the side it's heading toward. Without this the
    // tab oscillates — a plain "swap on every dragover" reinserts the dragged
    // tab on the far side of the target, which the next dragover undoes.
    const rect = e.currentTarget.getBoundingClientRect();
    const insertAfter = e.clientX > rect.left + rect.width / 2;
    setTabs((prev) => {
      const fromIdx = prev.findIndex((t) => t.id === draggingTabId);
      const overIdx = prev.findIndex((t) => t.id === overTabId);
      if (fromIdx < 0 || overIdx < 0) return prev;
      let toIdx = insertAfter ? overIdx + 1 : overIdx;
      // Removing the dragged tab first shifts every later index down by one.
      if (fromIdx < toIdx) toIdx -= 1;
      if (toIdx === fromIdx) return prev; // already in place — no-op
      const next = prev.slice();
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next;
    });
  };
  const onDragEnd = () => setDraggingTabId(null);

  // Stray = the tab had a container assigned but it no longer exists in any
  // state. A known-but-stopped container is NOT stray.
  const isStray = (tab: AgentTab) =>
    Boolean(tab.containerName) && !knownContainers.has(tab.containerName!);

  // Running status reflects the live container state once one is assigned;
  // before a container name arrives we fall back to the tab's initial status.
  const isRunning = (tab: AgentTab) =>
    tab.containerName
      ? runningContainers.has(tab.containerName)
      : tab.status === "running";

  const activeTab = useMemo(
    () => tabs.find((t) => t.id === activeTabId) ?? null,
    [tabs, activeTabId],
  );
  const activeStray = activeTab ? isStray(activeTab) : false;

  // WAI-ARIA tabs keyboard handler (roving tabindex). Enter/Space activate
  // the focused tab; Left/Right move selection AND focus to the adjacent tab
  // (with wraparound). The target guard keeps these keys from hijacking the
  // rename input and the info/close buttons nested inside the tab.
  const onTabKeyDown = (tabId: string) => (e: React.KeyboardEvent) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault(); // suppress page scroll on Space
      setActiveTabId(tabId);
      return;
    }
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const idx = tabs.findIndex((t) => t.id === tabId);
    if (idx < 0) return;
    e.preventDefault();
    const delta = e.key === "ArrowRight" ? 1 : -1;
    const nextIdx = (idx + delta + tabs.length) % tabs.length;
    const nextId = tabs[nextIdx].id;
    setActiveTabId(nextId);
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
                const isActive = activeTabId === tab.id;
                const stray = isStray(tab);
                const { Icon: ToolIcon, accent } = TOOL_META[tab.tool];
                const { Icon: LocIcon, label: locLabel } =
                  LOCATION_META[tab.location];
                return (
                  <Tooltip key={tab.id}>
                    <TooltipTrigger asChild>
                      <div
                        ref={(el) => {
                          if (el) tabRefs.current.set(tab.id, el);
                          else tabRefs.current.delete(tab.id);
                        }}
                        draggable={editingTabId !== tab.id}
                        onDragStart={onDragStart(tab.id)}
                        onDragOver={onDragOver(tab.id)}
                        onDragEnd={onDragEnd}
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
                          draggingTabId === tab.id && "opacity-60",
                          stray && "text-warning",
                        )}
                        onClick={() => setActiveTabId(tab.id)}
                      >
                        {/* Status / stray dot */}
                        <span
                          className={cn(
                            "inline-block h-2 w-2 rounded-full shrink-0",
                            stray
                              ? "bg-warning"
                              : isRunning(tab)
                                ? "bg-success"
                                : "bg-muted-foreground/50",
                          )}
                          aria-hidden
                        />
                        {/* Tool + location icons */}
                        <ToolIcon
                          className={cn("h-3.5 w-3.5 shrink-0", accent)}
                        />
                        <LocIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
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
                            aria-label="Container missing"
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
                        <span>
                          {TOOL_META[tab.tool].label} · {locLabel} (
                          {tab.locationName})
                        </span>
                        {stray ? (
                          <span className="text-warning">
                            Container not found — session ended
                          </span>
                        ) : (
                          <span className="text-muted-foreground">
                            {isRunning(tab) ? "● Running" : "○ Stopped"}
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

      {/* Stray banner — visible when the active tab's container has
          disappeared from docker ps. Points users at the Sessions page. */}
      {activeStray && (
        <div className="border-b bg-warning/10 text-warning px-4 py-2 text-xs flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5" />
          <span>
            This session&apos;s container is no longer running. Close this tab
            or visit{" "}
            <Link className="underline" href="/ai-coding/sessions">
              Sessions
            </Link>{" "}
            to review.
          </span>
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
                  <span className="font-medium capitalize">{tab.tool}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Location:</span>{" "}
                  <span className="font-medium">{tab.locationName}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Status:</span>{" "}
                  <span
                    className={cn(
                      "font-medium",
                      isStray(tab)
                        ? "text-warning"
                        : isRunning(tab)
                          ? "text-success"
                          : "text-muted-foreground",
                    )}
                  >
                    {isStray(tab)
                      ? "● Stray (container missing)"
                      : isRunning(tab)
                        ? `● Running (${formatUptime(tab.startTime)})`
                        : "○ Stopped"}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Recording:</span>{" "}
                  <span className="font-medium">
                    {tab.recording ? "● Enabled" : "○ Disabled"}
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
                  <span className="text-muted-foreground">Project:</span>{" "}
                  <span className="font-medium">
                    {activeProject || basePath}
                  </span>
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

      {/* Terminal Area */}
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
          tabs.map((tab) => (
            <div
              key={tab.id}
              role="tabpanel"
              id={`agent-tabpanel-${tab.id}`}
              aria-labelledby={`agent-tab-${tab.id}`}
              className={cn(
                "absolute inset-0",
                activeTabId === tab.id ? "block" : "hidden",
              )}
            >
              <Terminal
                wsUrl={buildWsUrl(tab)}
                className="h-full w-full"
                onSessionStart={(sessionId, mode, containerName) =>
                  handleSessionStart(tab.id, sessionId, mode, containerName)
                }
              />
            </div>
          ))
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

            <div>
              <label className="text-sm font-medium mb-3 block">
                Location:
              </label>
              <div className="space-y-2">
                {[
                  { name: "muckross", label: "Local (muckross)" },
                  { name: "kinsale", label: "kinsale" },
                  { name: "galway", label: "galway" },
                  { name: "AWS", label: "AWS" },
                  { name: "Azure", label: "Azure" },
                  { name: "GCP", label: "GCP" },
                ].map(({ name, label }) => (
                  <label
                    key={name}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <input
                      type="radio"
                      name="location"
                      value={name}
                      checked={selectedLocationName === name}
                      onChange={(e) => setSelectedLocationName(e.target.value)}
                      className="text-primary"
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setLaunchDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  const locationType = getLocationType(selectedLocationName);
                  addTab(selectedTool, locationType, selectedLocationName);
                }}
              >
                Launch
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
