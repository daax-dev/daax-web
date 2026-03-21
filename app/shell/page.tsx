"use client";

import { useState, useCallback, useRef, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import {
  SquareTerminal,
  Plus,
  X,
  Container,
  Ghost,
  CircleDot,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getSettings } from "@/lib/settings";
import { useProject } from "@/lib/project-context";
import { buildTerminalWsUrl } from "@/lib/websocket-utils";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const Terminal = dynamic(
  () => import("@/components/terminal/Terminal").then((mod) => mod.Terminal),
  { ssr: false },
);

const GhosttyTerminal = dynamic(
  () =>
    import("@/components/terminal/GhosttyTerminal").then(
      (mod) => mod.GhosttyTerminal,
    ),
  { ssr: false },
);

type TerminalType = "xterm" | "ghostty";

interface ShellTab {
  id: string;
  name: string;
  key: number;
  type: TerminalType;
  recording: boolean;
  initialCommand?: string;
  // Stable session ID for recording deduplication (prevents double-recording from React Strict Mode)
  clientSessionId: string;
}

function ShellPageContent() {
  const searchParams = useSearchParams();
  const [tabs, setTabs] = useState<ShellTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [tabCounter, setTabCounter] = useState(0);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [defaultTerminalType, setDefaultTerminalType] =
    useState<TerminalType>("xterm");
  const [initialCmdHandled, setInitialCmdHandled] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { activeProject, directories, basePath } = useProject();

  const addTab = useCallback(
    (
      type?: TerminalType,
      options?: { name?: string; initialCommand?: string },
    ) => {
      const newId = `shell-${Date.now()}`;
      const newCounter = tabCounter + 1;
      setTabCounter(newCounter);

      const termType = type || defaultTerminalType;

      // Validate initialCommand if provided to prevent injection of malicious input
      let sanitizedCommand = options?.initialCommand;
      if (sanitizedCommand) {
        // Limit command length to prevent abuse
        if (sanitizedCommand.length > 2000) {
          console.warn("initialCommand exceeds max length (2000), truncating");
          sanitizedCommand = sanitizedCommand.slice(0, 2000);
        }
        // Remove control characters (including carriage return); the Terminal component will add any needed newlines
        sanitizedCommand = sanitizedCommand.replace(
          /[\x00-\x09\x0b-\x1f\x7f]/g,
          "",
        );
      }

      const newTab: ShellTab = {
        id: newId,
        name:
          options?.name ||
          `${termType === "ghostty" ? "Ghostty" : "Shell"} ${newCounter}`,
        key: newCounter,
        type: termType,
        recording: false,
        initialCommand: sanitizedCommand,
        // Generate stable clientSessionId once per tab for recording deduplication
        clientSessionId: crypto.randomUUID(),
      };

      setTabs((prev) => [...prev, newTab]);
      setActiveTabId(newId);
    },
    [tabCounter, defaultTerminalType],
  );

  // Handle cmd query parameter - open shell with command
  useEffect(() => {
    if (initialCmdHandled) return;

    const cmd = searchParams.get("cmd");
    if (cmd) {
      setInitialCmdHandled(true);
      // Validate cmd parameter to only allow expected patterns (MCP Inspector commands)
      // This prevents arbitrary command injection via crafted URLs
      if (!cmd.startsWith("npx @modelcontextprotocol/inspector")) {
        console.warn(
          "shell/page: cmd parameter rejected - must be an npx inspector command",
        );
        return;
      }
      // Extract MCP name from command for tab name
      const mcpMatch = cmd.match(/inspector\s+(\S+)/);
      const tabName = mcpMatch ? `Inspector: ${mcpMatch[1]}` : "MCP Inspector";
      addTab("xterm", { name: tabName, initialCommand: cmd });
    }
  }, [searchParams, initialCmdHandled, addTab]);

  const closeTab = useCallback(
    (tabId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setTabs((prev) => {
        const newTabs = prev.filter((t) => t.id !== tabId);
        // If closing active tab, switch to another
        if (activeTabId === tabId && newTabs.length > 0) {
          setActiveTabId(newTabs[newTabs.length - 1].id);
        } else if (newTabs.length === 0) {
          setActiveTabId(null);
        }
        return newTabs;
      });
    },
    [activeTabId],
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

  // Focus input when editing starts
  useEffect(() => {
    if (editingTabId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingTabId]);

  const buildWsUrl = useCallback(
    (enableRecording: boolean = false, clientSessionId?: string) => {
      const params = new URLSearchParams();
      const settings = getSettings();

      // Always use container mode now
      params.set("mode", "container");
      params.set("image", settings.containerImage);

      // Pass project name and basePath for proper mounting
      if (activeProject) {
        params.set("project", activeProject);
        params.set("basePath", basePath);

        // Find the project type
        const projectInfo = directories.find((d) => d.name === activeProject);
        if (projectInfo?.type) {
          params.set("projectType", projectInfo.type);
        }
      } else {
        // No project selected - mount the base path
        params.set("mount", basePath);
      }

      params.set("sessionType", "shell");
      if (enableRecording && clientSessionId) {
        params.set("record", "true");
        // Use the tab's stable clientSessionId for server-side recording deduplication
        // This prevents duplicate recordings from React Strict Mode double-mounts
        params.set("clientSessionId", clientSessionId);
      }

      return buildTerminalWsUrl(params);
    },
    [activeProject, directories, basePath],
  );

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <SquareTerminal className="h-5 w-5" />
            Shell
          </h1>
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Container className="h-3 w-3" />
            Container shells
            {activeProject && (
              <span className="text-xs bg-muted px-2 py-0.5 rounded">
                {activeProject}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ToggleGroup
            type="single"
            value={defaultTerminalType}
            onValueChange={(value) => {
              if (value) setDefaultTerminalType(value as TerminalType);
            }}
            className="border rounded-md p-1"
          >
            <ToggleGroupItem
              value="xterm"
              aria-label="Use xterm"
              size="sm"
              className="gap-1.5"
            >
              <SquareTerminal className="h-3.5 w-3.5" />
              <span className="text-xs">xterm</span>
            </ToggleGroupItem>
            <ToggleGroupItem
              value="ghostty"
              aria-label="Use Ghostty"
              size="sm"
              className="gap-1.5"
            >
              <Ghost className="h-3.5 w-3.5" />
              <span className="text-xs">Ghostty</span>
            </ToggleGroupItem>
          </ToggleGroup>
          <Button onClick={() => addTab()} size="sm">
            <Plus className="h-4 w-4 mr-1" />
            New {defaultTerminalType === "ghostty" ? "Ghostty" : "Shell"}
          </Button>
        </div>
      </div>

      {/* Tab Bar */}
      {tabs.length > 0 && (
        <div className="flex items-center border-b bg-muted/30 px-2">
          <div className="flex items-center gap-1 overflow-x-auto py-1">
            {tabs.map((tab) => (
              <div
                key={tab.id}
                onClick={() => setActiveTabId(tab.id)}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-t-md cursor-pointer text-sm transition-colors group min-w-[100px]",
                  activeTabId === tab.id
                    ? "bg-background border border-b-0 text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                )}
              >
                {tab.type === "ghostty" ? (
                  <Ghost className="h-3.5 w-3.5 shrink-0 text-purple-400" />
                ) : (
                  <SquareTerminal className="h-3.5 w-3.5 shrink-0" />
                )}
                {tab.recording && (
                  <CircleDot className="h-3 w-3 shrink-0 text-red-500 animate-pulse" />
                )}
                {editingTabId === tab.id ? (
                  <input
                    ref={inputRef}
                    type="text"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onBlur={finishEditing}
                    onKeyDown={handleKeyDown}
                    onClick={(e) => e.stopPropagation()}
                    className="bg-transparent border-b border-primary outline-none w-20 text-sm"
                  />
                ) : (
                  <span
                    className="truncate"
                    onContextMenu={(e) => {
                      e.preventDefault();
                      startEditing(tab.id, tab.name, e);
                    }}
                  >
                    {tab.name}
                  </span>
                )}
                <button
                  onClick={(e) => closeTab(tab.id, e)}
                  className="ml-auto opacity-0 group-hover:opacity-100 hover:bg-muted rounded p-0.5 transition-opacity"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Terminal Area */}
      <div className="flex-1 bg-[#1a1b26] relative">
        {tabs.length === 0 ? (
          <div className="h-full flex items-center justify-center text-gray-500">
            <div className="text-center">
              <SquareTerminal className="h-16 w-16 mx-auto mb-4 opacity-30" />
              <p>Click &quot;New Shell&quot; to open a terminal</p>
              <p className="text-sm mt-2 text-muted-foreground">
                Spawns a new Docker container with shell access
              </p>
            </div>
          </div>
        ) : (
          tabs.map((tab) => (
            <div
              key={tab.id}
              className={cn(
                "absolute inset-0",
                activeTabId === tab.id ? "visible" : "invisible",
              )}
            >
              {tab.type === "ghostty" ? (
                <GhosttyTerminal
                  key={`terminal-${tab.key}`}
                  wsUrl={buildWsUrl(tab.recording, tab.clientSessionId)}
                  onExit={() =>
                    closeTab(tab.id, {
                      stopPropagation: () => {},
                    } as React.MouseEvent)
                  }
                  onError={(err) => console.error(`Ghostty error:`, err)}
                  className="h-full"
                />
              ) : (
                <Terminal
                  key={`terminal-${tab.key}`}
                  wsUrl={buildWsUrl(tab.recording, tab.clientSessionId)}
                  onExit={() =>
                    closeTab(tab.id, {
                      stopPropagation: () => {},
                    } as React.MouseEvent)
                  }
                  onError={(err) => console.error(`Shell error:`, err)}
                  className="h-full"
                  initialCommand={tab.initialCommand}
                />
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function ShellPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-[calc(100vh-3.5rem)]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <ShellPageContent />
    </Suspense>
  );
}
