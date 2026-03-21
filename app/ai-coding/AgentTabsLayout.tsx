"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import { Bot, Plus, X, Mic, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  locationName: string; // e.g., "muckross", "kinsale", "AWS"
  recording: boolean;
  status: "running" | "stopped";
  startTime: number;
}

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
  const inputRef = useRef<HTMLInputElement>(null);
  const { activeProject, directories, basePath } = useProject();

  // Determine location type from location name
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

      const toolNames = {
        claude: "Claude",
        opencode: "OpenCode",
        copilot: "Copilot",
        gemini: "Gemini",
        codex: "Codex",
      };

      const newTab: AgentTab = {
        id: newId,
        name: `${toolNames[tool]} ${newCounter}`,
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

  const buildWsUrl = useCallback(
    (tab: AgentTab) => {
      const params = new URLSearchParams();
      const settings = getSettings();

      params.set("mode", "container");
      // Use AI Coding settings for container image, fall back to legacy containerImage setting
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

      // Set command based on tool - CRITICAL for launching the right AI tool
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

  const getToolIcon = (tool: AIToolId) => {
    // Placeholder - will use proper icons
    return "◆";
  };

  const getLocationIcon = (location: LocationType) => {
    // Placeholder - will use proper icons
    switch (location) {
      case "local":
        return "⌂";
      case "cloud":
        return "☁";
      case "tailscale":
        return "🌐";
    }
  };

  const formatUptime = (startTime: number) => {
    const seconds = Math.floor((Date.now() - startTime) / 1000);
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  };

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
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
          <div className="flex items-center gap-1 overflow-x-auto py-1">
            {tabs.map((tab) => (
              <div
                key={tab.id}
                className={cn(
                  "flex items-center gap-1 px-3 py-1.5 rounded-t-md border-b-2 transition-colors cursor-pointer group",
                  activeTabId === tab.id
                    ? "bg-background border-primary"
                    : "bg-transparent border-transparent hover:bg-muted",
                )}
                onClick={() => setActiveTabId(tab.id)}
              >
                <span className="text-xs opacity-60">
                  {getToolIcon(tab.tool)} {getLocationIcon(tab.location)}
                </span>
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
                  <>
                    <span
                      className="text-sm font-medium"
                      onDoubleClick={(e) => startEditing(tab.id, tab.name, e)}
                    >
                      {tab.name}
                    </span>
                    <button
                      onClick={(e) => toggleInfoPanel(tab.id, e)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <ChevronDown
                        className={cn(
                          "h-3 w-3 transition-transform",
                          expandedTabId === tab.id && "rotate-180",
                        )}
                      />
                    </button>
                  </>
                )}
                <button
                  onClick={(e) => closeTab(tab.id, e)}
                  className="ml-1 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => setLaunchDialogOpen(true)}
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
                  <span className="font-medium capitalize">{tab.tool}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Location:</span>{" "}
                  <span className="font-medium">{tab.locationName}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Status:</span>{" "}
                  <span className="font-medium text-green-600">
                    ● Running ({formatUptime(tab.startTime)})
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Recording:</span>{" "}
                  <span className="font-medium">
                    {tab.recording ? "● Enabled" : "○ Disabled"}
                  </span>
                </div>
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
                  <Button size="sm" variant="outline">
                    Settings
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
              className={cn(
                "absolute inset-0",
                activeTabId === tab.id ? "block" : "hidden",
              )}
            >
              <Terminal wsUrl={buildWsUrl(tab)} />
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
                {[
                  { id: "claude" as const, label: "Claude Code" },
                  { id: "opencode" as const, label: "OpenCode" },
                  { id: "copilot" as const, label: "GitHub Copilot" },
                  { id: "gemini" as const, label: "Gemini CLI" },
                  { id: "codex" as const, label: "Codex CLI" },
                ].map(({ id, label }) => (
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
                    <span>{label}</span>
                  </label>
                ))}
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
