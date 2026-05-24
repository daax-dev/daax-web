/**
 * Container Sidebar Component
 *
 * Persistent sidebar showing running containers with quick actions.
 */

"use client";

import { useState } from "react";
import {
  Container,
  Play,
  Square,
  Trash2,
  FileText,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  Copy,
  MoreHorizontal,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useContainers } from "../hooks";
import type { TestContainer, ContainerAction, ContainerStatus } from "../types";
import { STATUS_COLORS } from "../constants";

interface ContainerSidebarProps {
  className?: string;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

interface ContainerItemProps {
  container: TestContainer;
  onAction: (action: ContainerAction, id: string) => Promise<void>;
  compact?: boolean;
}

function StatusDot({ status }: { status: ContainerStatus }) {
  const isRunning = status === "running";
  const colorClass = STATUS_COLORS[status] || STATUS_COLORS.dead;

  return (
    <span
      className={cn(
        "h-2 w-2 rounded-full shrink-0",
        isRunning && "animate-pulse",
        colorClass.includes("green")
          ? "bg-green-500"
          : colorClass.includes("yellow")
            ? "bg-yellow-500"
            : colorClass.includes("red")
              ? "bg-red-500"
              : "bg-gray-500",
      )}
    />
  );
}

function ContainerItem({ container, onAction, compact }: ContainerItemProps) {
  const [loading, setLoading] = useState<ContainerAction | null>(null);

  const handleAction = async (action: ContainerAction) => {
    setLoading(action);
    try {
      await onAction(action, container.id);
    } finally {
      setLoading(null);
    }
  };

  const copyPort = (port: number) => {
    navigator.clipboard.writeText(`localhost:${port}`);
    toast.success("Port copied");
  };

  const isRunning = container.status === "running";
  const isStopped =
    container.status === "exited" || container.status === "dead";
  const primaryPort =
    container.ports[0]?.hostPort || container.ports[0]?.containerPort;

  if (compact) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className="flex items-center gap-2 w-full px-2 py-1.5 rounded hover:bg-muted/50 transition-colors text-left"
            onClick={() => handleAction("inspect")}
          >
            <StatusDot status={container.status} />
            <span className="truncate text-sm">{container.name}</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">
          <div>
            <p className="font-medium">{container.name}</p>
            <p className="text-xs text-muted-foreground">{container.image}</p>
            {primaryPort && <p className="text-xs">Port: {primaryPort}</p>}
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div className="group flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 transition-colors">
      <StatusDot status={container.status} />
      <div className="flex-1 min-w-0">
        <p className="text-sm truncate font-medium">{container.name}</p>
        <p className="text-xs text-muted-foreground truncate">
          {container.image}
        </p>
      </div>

      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        {primaryPort && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => copyPort(primaryPort)}
              >
                <Copy className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Copy port {primaryPort}</TooltipContent>
          </Tooltip>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-6 w-6">
              <MoreHorizontal className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {isRunning && (
              <DropdownMenuItem
                onClick={() => handleAction("stop")}
                disabled={loading !== null}
              >
                <Square className="h-4 w-4 mr-2" />
                Stop
              </DropdownMenuItem>
            )}
            {isStopped && (
              <DropdownMenuItem
                onClick={() => handleAction("start")}
                disabled={loading !== null}
              >
                <Play className="h-4 w-4 mr-2" />
                Start
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={() => handleAction("logs")}
              disabled={loading !== null}
            >
              <FileText className="h-4 w-4 mr-2" />
              Logs
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => handleAction("remove")}
              disabled={loading !== null}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Remove
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

export function ContainerSidebar({
  className,
  collapsed = false,
}: ContainerSidebarProps) {
  const [runningOpen, setRunningOpen] = useState(true);
  const [stoppedOpen, setStoppedOpen] = useState(false);

  const {
    containers,
    loading,
    error,
    dockerStatus,
    refresh,
    startContainer,
    stopContainer,
    removeContainer,
  } = useContainers({
    autoRefresh: true,
    refreshInterval: 30000, // 30s refresh for sidebar (avoids rate limiting)
  });

  const handleAction = async (action: ContainerAction, id: string) => {
    switch (action) {
      case "start":
        await startContainer(id);
        toast.success("Container started");
        break;
      case "stop":
        await stopContainer(id);
        toast.success("Container stopped");
        break;
      case "remove":
        await removeContainer(id, true);
        toast.success("Container removed");
        break;
      case "logs":
        window.open(`/testcontainers/${id}/logs`, "_blank");
        break;
      case "inspect":
        window.location.href = `/testcontainers/${id}`;
        break;
    }
  };

  const runningContainers = containers.filter((c) => c.status === "running");
  const stoppedContainers = containers.filter(
    (c) =>
      c.status === "exited" || c.status === "dead" || c.status === "created",
  );

  // Docker not connected
  if (dockerStatus && !dockerStatus.connected) {
    return (
      <div className={cn("flex flex-col border-r bg-background", className)}>
        <div className="p-4 flex flex-col items-center gap-2 text-center">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <p className="text-sm text-muted-foreground">Docker not available</p>
          <Button variant="outline" size="sm" onClick={refresh}>
            <RefreshCw className="h-3 w-3 mr-1" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (collapsed) {
    return (
      <div
        className={cn("flex flex-col border-r bg-background w-10", className)}
      >
        <div className="p-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={refresh}
              >
                <Container className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              {containers.length} containers ({runningContainers.length}{" "}
              running)
            </TooltipContent>
          </Tooltip>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {runningContainers.map((container) => (
            <ContainerItem
              key={container.id}
              container={container}
              onAction={handleAction}
              compact
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col border-r bg-background w-64", className)}>
      {/* Header */}
      <div className="p-3 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Container className="h-4 w-4" />
          <span className="font-medium text-sm">Containers</span>
          <span className="text-xs text-muted-foreground">
            ({containers.length})
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={refresh}
          disabled={loading}
        >
          <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
        </Button>
      </div>

      {/* Container lists */}
      <div className="flex-1 overflow-y-auto">
        {error && (
          <div className="p-2 m-2 rounded bg-destructive/10 text-destructive text-xs">
            {error}
          </div>
        )}

        {/* Running containers */}
        <Collapsible open={runningOpen} onOpenChange={setRunningOpen}>
          <CollapsibleTrigger className="flex items-center gap-1 w-full px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground">
            {runningOpen ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
            Running ({runningContainers.length})
          </CollapsibleTrigger>
          <CollapsibleContent className="px-1 pb-2">
            {runningContainers.length === 0 ? (
              <p className="text-xs text-muted-foreground px-3 py-2">
                No running containers
              </p>
            ) : (
              runningContainers.map((container) => (
                <ContainerItem
                  key={container.id}
                  container={container}
                  onAction={handleAction}
                />
              ))
            )}
          </CollapsibleContent>
        </Collapsible>

        {/* Stopped containers */}
        <Collapsible open={stoppedOpen} onOpenChange={setStoppedOpen}>
          <CollapsibleTrigger className="flex items-center gap-1 w-full px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground">
            {stoppedOpen ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            <span className="h-1.5 w-1.5 rounded-full bg-gray-500" />
            Stopped ({stoppedContainers.length})
          </CollapsibleTrigger>
          <CollapsibleContent className="px-1 pb-2">
            {stoppedContainers.length === 0 ? (
              <p className="text-xs text-muted-foreground px-3 py-2">
                No stopped containers
              </p>
            ) : (
              stoppedContainers.map((container) => (
                <ContainerItem
                  key={container.id}
                  container={container}
                  onAction={handleAction}
                />
              ))
            )}
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* Footer stats */}
      <div className="p-2 border-t text-xs text-muted-foreground">
        <div className="flex justify-between">
          <span>Running</span>
          <span className="font-medium text-green-500">
            {runningContainers.length}
          </span>
        </div>
        <div className="flex justify-between">
          <span>Stopped</span>
          <span>{stoppedContainers.length}</span>
        </div>
      </div>
    </div>
  );
}
