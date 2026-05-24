"use client";

import { useState, useMemo, useEffect } from "react";
import {
  Search,
  RefreshCw,
  Plus,
  Filter,
  Loader2,
  AlertCircle,
  Pencil,
  Trash2,
  Package,
  ChevronDown,
  ChevronRight,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Globe,
  Terminal,
  Key,
  ExternalLink,
  Wrench,
  CheckCircle2,
  XCircle,
  CircleDot,
  Bug,
  RotateCcw,
} from "lucide-react";
import { McpIcon } from "@/components/icons/McpIcon";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  useMcpGateway,
  type McpServerConfig,
  type McpSecurityInfo,
  type McpState,
  type McpTool,
} from "@/hooks/use-mcp-gateway";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { McpEditor } from "@/components/mcp/McpEditor";
import { McpDeleteConfirm } from "@/components/mcp/McpDeleteConfirm";
import { McpSourcesPanel } from "@/components/mcp/McpSourcesPanel";
import { useMcp, useMcpSubmissions } from "@/hooks/use-mcp";
import { McpSubmitForm } from "@/components/mcp/McpSubmitForm";
import { McpSubmissionsPanel } from "@/components/mcp/McpSubmissionsPanel";

const CONTEXT_COLORS: Record<string, string> = {
  coding: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  research: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  git: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  testing: "bg-green-500/10 text-green-500 border-green-500/20",
  security: "bg-red-500/10 text-red-500 border-red-500/20",
  data: "bg-cyan-500/10 text-cyan-500 border-cyan-500/20",
  ui: "bg-pink-500/10 text-pink-500 border-pink-500/20",
  general: "bg-gray-500/10 text-gray-500 border-gray-500/20",
};

const SOURCE_LABELS: Record<string, string> = {
  "claude-code-global": "Global",
  "claude-desktop": "Desktop",
  "claude-code-project": "Project",
  "mcp-json": ".mcp.json",
  active: "Active",
};

function ContextTag({ tag }: { tag: string }) {
  return (
    <span
      className={cn(
        "text-[10px] px-1.5 py-0.5 rounded border",
        CONTEXT_COLORS[tag] || CONTEXT_COLORS.general,
      )}
    >
      {tag}
    </span>
  );
}

// Security badge component
function SecurityBadge({ security }: { security: McpSecurityInfo }) {
  const riskColors = {
    low: "bg-green-500/10 text-green-500 border-green-500/20",
    medium: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
    high: "bg-red-500/10 text-red-500 border-red-500/20",
  };

  const RiskIcon =
    security.riskLevel === "low"
      ? ShieldCheck
      : security.riskLevel === "medium"
        ? Shield
        : ShieldAlert;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "text-[10px] px-1.5 py-0.5 rounded border flex items-center gap-1",
              riskColors[security.riskLevel],
            )}
          >
            <RiskIcon className="h-3 w-3" />
            {security.riskLevel}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <div className="text-xs space-y-1">
            {security.riskReasons.length > 0 ? (
              security.riskReasons.map((reason, i) => (
                <div key={i}>{reason}</div>
              ))
            ) : (
              <div>Local official MCP</div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Transport badge (local/remote)
function TransportBadge({
  transport,
  isOfficial,
}: {
  transport: "local" | "remote";
  isOfficial: boolean;
}) {
  const isLocal = transport === "local";
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "text-[10px] px-1.5 py-0.5 rounded border flex items-center gap-1",
              isLocal
                ? "bg-blue-500/10 text-blue-500 border-blue-500/20"
                : "bg-orange-500/10 text-orange-500 border-orange-500/20",
            )}
          >
            {isLocal ? (
              <Terminal className="h-3 w-3" />
            ) : (
              <Globe className="h-3 w-3" />
            )}
            {isLocal ? "local" : "remote"}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">
          <div className="text-xs">
            {isLocal ? "Runs locally via stdio" : "Remote HTTP connection"}
            {isOfficial && " (Official MCP)"}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Auth badge
function AuthBadge({
  authType,
  authEnvVars,
}: {
  authType: string;
  authEnvVars: string[];
}) {
  if (authType === "none") return null;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="text-[10px] px-1.5 py-0.5 rounded border bg-purple-500/10 text-purple-500 border-purple-500/20 flex items-center gap-1">
            <Key className="h-3 w-3" />
            {authType}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">
          <div className="text-xs">
            Auth via: {authEnvVars.join(", ") || "configured"}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Health status type
type HealthStatus = "unknown" | "healthy" | "error" | "checking";

// MCP Card with collapsible config
function McpCard({
  mcp,
  onToggle,
  onEdit,
  onDelete,
  onInspect,
  onFetchTools,
  autoCheck = false,
}: {
  mcp: McpState;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onInspect: () => void;
  onFetchTools: () => Promise<{
    success: boolean;
    tools?: McpTool[];
    error?: string;
  }>;
  autoCheck?: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [tools, setTools] = useState<McpTool[] | null>(null);
  const [toolsLoading, setToolsLoading] = useState(false);
  const [toolsError, setToolsError] = useState<string | null>(null);
  const [healthStatus, setHealthStatus] = useState<HealthStatus>("unknown");

  const handleFetchTools = async () => {
    if (toolsLoading) return;
    setToolsLoading(true);
    setToolsError(null);
    setHealthStatus("checking");
    const result = await onFetchTools();
    setToolsLoading(false);
    if (result.success && result.tools) {
      setTools(result.tools);
      setHealthStatus("healthy");
    } else {
      setToolsError(result.error || "Failed to fetch tools");
      setHealthStatus("error");
    }
  };

  // Auto-check health on mount if autoCheck is true
  useEffect(() => {
    if (autoCheck && mcp.enabled && healthStatus === "unknown") {
      // Use deterministic staggered delay based on MCP ID hash to avoid thundering herd
      // This ensures consistent timing across re-renders while still spreading load
      const hashCode = mcp.id
        .split("")
        .reduce((acc, char) => ((acc << 5) - acc + char.charCodeAt(0)) | 0, 0);
      const delay = (Math.abs(hashCode) % 10) * 200; // 0 to 9 increments of 200ms (0-1800ms)
      const timer = setTimeout(() => {
        handleFetchTools();
      }, delay);
      return () => clearTimeout(timer);
    }
    // We intentionally omit handleFetchTools from the deps array because it is defined inline but only uses stable setState functions and the onFetchTools prop, and the effect is only used for a one-time auto health check.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoCheck, mcp.enabled, mcp.id, healthStatus]);

  // Fetch tools when expanded (for health check)
  const handleExpand = (open: boolean) => {
    setIsExpanded(open);
    if (open && tools === null && !toolsLoading && healthStatus === "unknown") {
      handleFetchTools();
    }
  };

  return (
    <Collapsible open={isExpanded} onOpenChange={handleExpand}>
      <div
        className={cn(
          "rounded-lg border transition-colors",
          mcp.enabled ? "bg-card" : "bg-muted/30 opacity-60",
        )}
      >
        {/* Main row */}
        <div className="flex items-center justify-between p-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <Switch checked={mcp.enabled} onCheckedChange={onToggle} />
            <CollapsibleTrigger asChild>
              <button className="flex items-center gap-1 hover:text-primary transition-colors">
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </button>
            </CollapsibleTrigger>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm truncate max-w-[200px]">
                  {mcp.id}
                </span>
                {tools !== null && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-500 border border-cyan-500/20 flex items-center gap-1">
                    <Wrench className="h-2.5 w-2.5" />
                    {tools.length}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                {mcp.security && (
                  <>
                    <TransportBadge
                      transport={mcp.security.transport}
                      isOfficial={mcp.security.isOfficialMcp}
                    />
                    <SecurityBadge security={mcp.security} />
                    <AuthBadge
                      authType={mcp.security.authType}
                      authEnvVars={mcp.security.authEnvVars}
                    />
                  </>
                )}
                {mcp.contextTags.map((tag) => (
                  <ContextTag key={tag} tag={tag} />
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Status indicator - fixed width for alignment */}
            <div className="flex items-center gap-1.5 text-[11px] w-[100px] justify-end">
              <span className="text-muted-foreground">Status:</span>
              {healthStatus === "unknown" && (
                <>
                  <CircleDot className="h-3 w-3 text-muted-foreground" />
                </>
              )}
              {healthStatus === "checking" && (
                <>
                  <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
                </>
              )}
              {healthStatus === "healthy" && (
                <>
                  <CheckCircle2 className="h-3 w-3 text-green-500" />
                  <span className="text-green-500">OK</span>
                </>
              )}
              {healthStatus === "error" && (
                <>
                  <XCircle className="h-3 w-3 text-red-500" />
                  <span className="text-red-500">Err</span>
                </>
              )}
            </div>

            <span
              className={cn(
                "text-xs px-2 py-0.5 rounded w-[32px] text-center",
                mcp.enabled
                  ? "bg-green-500/10 text-green-500"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {mcp.enabled ? "ON" : "OFF"}
            </span>

            {/* Troubleshoot button - appears when error */}
            {healthStatus === "error" && (
              <>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-orange-500 hover:text-orange-600 hover:bg-orange-500/10"
                        onClick={onInspect}
                      >
                        <Bug className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      Troubleshoot with MCP Inspector
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={handleFetchTools}
                        disabled={toolsLoading}
                      >
                        <RotateCcw
                          className={cn(
                            "h-3.5 w-3.5",
                            toolsLoading && "animate-spin",
                          )}
                        />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Retry connection</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </>
            )}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={onInspect}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Inspect in MCP Inspector</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onEdit}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:text-destructive"
              onClick={onDelete}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Collapsible config details */}
        <CollapsibleContent>
          <div className="px-3 pb-3 pt-0 space-y-3">
            {/* Config section */}
            <div className="bg-muted/50 rounded-md p-3 text-xs font-mono space-y-2">
              {mcp.config ? (
                <>
                  {mcp.config.command && (
                    <div className="flex gap-2">
                      <span className="text-muted-foreground">command:</span>
                      <span className="text-foreground">
                        {mcp.config.command}
                      </span>
                    </div>
                  )}
                  {mcp.config.args && mcp.config.args.length > 0 && (
                    <div className="flex gap-2">
                      <span className="text-muted-foreground">args:</span>
                      <span className="text-foreground break-all">
                        {mcp.config.args.join(" ")}
                      </span>
                    </div>
                  )}
                  {mcp.config.url && (
                    <div className="flex gap-2">
                      <span className="text-muted-foreground">url:</span>
                      <span className="text-foreground">{mcp.config.url}</span>
                    </div>
                  )}
                  {mcp.config.env && Object.keys(mcp.config.env).length > 0 && (
                    <div>
                      <span className="text-muted-foreground">env:</span>
                      <div className="ml-4 mt-1 space-y-1">
                        {Object.entries(mcp.config.env).map(([key, value]) => (
                          <div key={key} className="flex gap-2">
                            <span className="text-muted-foreground">
                              {key}:
                            </span>
                            <span className="text-foreground truncate max-w-[300px]">
                              {/\b(key|token|secret|password|pwd|auth|credential)\b/i.test(
                                key,
                              )
                                ? "••••••••"
                                : value}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <span className="text-muted-foreground">
                  No config available
                </span>
              )}
              {mcp.sourcePath && (
                <div className="flex gap-2 pt-2 border-t border-border/50">
                  <span className="text-muted-foreground">source:</span>
                  <span className="text-foreground truncate">
                    {mcp.sourcePath}
                  </span>
                </div>
              )}
            </div>

            {/* Tools section */}
            <div className="bg-muted/50 rounded-md p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium flex items-center gap-1.5">
                  <Wrench className="h-3.5 w-3.5" />
                  Tools {tools !== null && `(${tools.length})`}
                </span>
                {toolsLoading && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                )}
                {healthStatus === "healthy" && (
                  <span className="text-[10px] text-green-500 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Connected
                  </span>
                )}
                {healthStatus === "error" && (
                  <span className="text-[10px] text-red-500 flex items-center gap-1">
                    <XCircle className="h-3 w-3" />
                    Failed
                  </span>
                )}
              </div>
              {toolsError && (
                <div className="text-xs text-destructive flex items-center gap-1 mb-2 p-2 bg-destructive/10 rounded">
                  <AlertCircle className="h-3 w-3 shrink-0" />
                  <span className="truncate">{toolsError}</span>
                </div>
              )}
              {tools !== null && tools.length > 0 && (
                <div className="space-y-1.5 max-h-[250px] overflow-y-auto">
                  {tools.map((tool) => (
                    <div
                      key={tool.name}
                      className="text-xs px-2 py-1.5 rounded bg-background/50 border border-border/50"
                    >
                      <div className="font-mono text-primary">{tool.name}</div>
                      {tool.description && (
                        <div className="text-muted-foreground mt-0.5 text-[11px] line-clamp-2">
                          {tool.description}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {tools !== null && tools.length === 0 && (
                <div className="text-xs text-muted-foreground">
                  No tools exposed
                </div>
              )}
              {tools === null && !toolsLoading && !toolsError && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={handleFetchTools}
                >
                  <Wrench className="h-3 w-3 mr-1" />
                  Check Health & Load Tools
                </Button>
              )}
              {healthStatus === "error" && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs mt-2"
                  onClick={handleFetchTools}
                >
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Retry
                </Button>
              )}
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

export default function McpPage() {
  const [activeTab, setActiveTab] = useState("my-mcps");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterContext, setFilterContext] = useState<string | null>(null);
  const [showOnlyEnabled, setShowOnlyEnabled] = useState(false);

  // Editor dialog state
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<"add" | "edit">("add");
  const [editingMcp, setEditingMcp] = useState<{
    id: string;
    config?: McpServerConfig;
    sourcePath?: string;
  } | null>(null);

  // Delete dialog state
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingMcp, setDeletingMcp] = useState<{
    id: string;
    sourcePath: string;
  } | null>(null);

  // Hooks
  const {
    mcps,
    contexts,
    loading,
    error,
    discoverySources,
    diagnostics, // Available when no MCPs found (helps troubleshoot empty page)
    // tokenSavings is available but not currently displayed in the UI
    isDiscovering,
    discover,
    toggleMcp,
    resetAll,
    refetch,
    getEnabledCount,
    addMcp,
    updateMcp,
    deleteMcp,
    fetchTools,
  } = useMcpGateway();

  // Catalog data (for the Catalog tab)
  const {
    mcps: catalogMcps,
    loading: catalogLoading,
    refetch: refetchCatalog,
  } = useMcp();
  const { submissions: pendingSubmissions } = useMcpSubmissions("pending");

  // Filter MCPs
  const filteredMcps = useMemo(() => {
    return mcps.filter((mcp) => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        if (
          !mcp.id.toLowerCase().includes(query) &&
          !mcp.name.toLowerCase().includes(query) &&
          !mcp.contextTags.some((t) => t.toLowerCase().includes(query))
        ) {
          return false;
        }
      }

      // Context filter
      if (filterContext && !mcp.contextTags.includes(filterContext)) {
        return false;
      }

      // Enabled filter
      if (showOnlyEnabled && !mcp.enabled) {
        return false;
      }

      return true;
    });
  }, [mcps, searchQuery, filterContext, showOnlyEnabled]);

  // Group by source
  const mcpsBySource = useMemo(() => {
    const grouped: Record<string, typeof mcps> = {};
    for (const mcp of filteredMcps) {
      const source = mcp.source || "unknown";
      if (!grouped[source]) {
        grouped[source] = [];
      }
      grouped[source].push(mcp);
    }
    return grouped;
  }, [filteredMcps]);

  const handleAddMcp = () => {
    setEditorMode("add");
    setEditingMcp(null);
    setEditorOpen(true);
  };

  const handleEditMcp = (mcp: (typeof mcps)[0]) => {
    setEditorMode("edit");
    setEditingMcp({
      id: mcp.id,
      sourcePath: mcp.sourcePath,
      config: mcp.config,
    });
    setEditorOpen(true);
  };

  const handleDeleteMcp = (mcp: (typeof mcps)[0]) => {
    if (mcp.sourcePath) {
      setDeletingMcp({
        id: mcp.id,
        sourcePath: mcp.sourcePath,
      });
      setDeleteOpen(true);
    }
  };

  const handleSave = async (
    id: string,
    config: McpServerConfig,
    scope: "global" | "project",
    sourcePath?: string,
  ) => {
    if (editorMode === "add") {
      return addMcp(id, config, scope);
    } else {
      return updateMcp(id, config, sourcePath!);
    }
  };

  const handleConfirmDelete = async () => {
    if (deletingMcp) {
      return deleteMcp(deletingMcp.id, deletingMcp.sourcePath);
    }
    return { success: false, error: "No MCP selected" };
  };

  /**
   * Safely escape shell arguments for a POSIX shell by single-quoting each arg
   * and escaping any embedded single quotes.
   */
  const shellEscape = (args: string[]): string =>
    args
      .map((arg) => {
        // Skip null/undefined
        if (arg === null || arg === undefined) {
          return "";
        }
        // Validate argument is a string or convertible type (string, number, boolean)
        if (
          typeof arg !== "string" &&
          typeof arg !== "number" &&
          typeof arg !== "boolean"
        ) {
          console.warn(
            "shellEscape: skipping non-primitive argument:",
            typeof arg,
          );
          return "";
        }
        // Ensure we work with strings
        const str = String(arg);
        // Escape single quotes: ' => '\''
        const escaped = str.replace(/'/g, `'\\''`);
        return `'${escaped}'`;
      })
      .filter((s) => s !== "")
      .join(" ");

  const handleInspectMcp = (mcp: McpState) => {
    const config = mcp.config;
    if (!config) {
      console.error("handleInspectMcp: MCP has no config", mcp.id);
      return;
    }

    // Validate config has required fields for MCP Inspector
    if (!config.command && !config.url) {
      console.error(
        "handleInspectMcp: MCP config missing both command and url",
        mcp.id,
      );
      return;
    }

    // Build the npx command arguments for MCP Inspector
    let inspectorArgs: string[] = [];
    if (config.command) {
      // Validate command is a non-empty string
      if (typeof config.command !== "string" || !config.command.trim()) {
        console.error("handleInspectMcp: Invalid command in config", mcp.id);
        return;
      }
      // For stdio MCPs, pass the command and args as separate arguments
      const args = (config.args || []).map((arg) => String(arg));
      inspectorArgs = [String(config.command), ...args];
    } else if (config.url) {
      // Validate URL is a non-empty string
      if (typeof config.url !== "string" || !config.url.trim()) {
        console.error("handleInspectMcp: Invalid url in config", mcp.id);
        return;
      }
      // For HTTP MCPs, pass the URL as a single argument
      inspectorArgs = [String(config.url)];
    }

    // Build the full command, safely escaping all dynamic arguments
    const baseCommand = "npx @modelcontextprotocol/inspector";
    const command =
      inspectorArgs.length > 0
        ? `${baseCommand} ${shellEscape(inspectorArgs)}`
        : baseCommand;

    // Open shell page in new tab with the command
    const shellUrl = `/shell?cmd=${encodeURIComponent(command)}`;
    window.open(shellUrl, "_blank");
  };

  const enabledCount = getEnabledCount();
  const totalCount = mcps.length;

  if (loading) {
    return (
      <div className="container mx-auto py-6 px-4 max-w-screen-2xl">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto py-6 px-4 max-w-screen-2xl">
        <div className="flex flex-col items-center justify-center min-h-[400px] text-muted-foreground">
          <AlertCircle className="h-12 w-12 mb-4 text-destructive" />
          <p className="text-destructive">{error}</p>
          <Button onClick={refetch} className="mt-4">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-4 px-4 max-w-screen-2xl">
      {/* Compact Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <McpIcon size={20} className="text-primary" />
            <h1 className="text-lg font-semibold">MCPs</h1>
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="font-medium text-foreground">{totalCount}</span>{" "}
              total
            </span>
            <span className="text-border">|</span>
            <span className="flex items-center gap-1">
              <span className="font-medium text-green-500">{enabledCount}</span>{" "}
              on
            </span>
            <span className="text-border">|</span>
            <span className="flex items-center gap-1">
              <span className="font-medium text-muted-foreground">
                {totalCount - enabledCount}
              </span>{" "}
              off
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={discover}
            disabled={isDiscovering}
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", isDiscovering && "animate-spin")}
            />
          </Button>
          <Button size="sm" onClick={handleAddMcp}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between mb-3">
          <TabsList className="h-8">
            <TabsTrigger value="my-mcps" className="text-xs h-7 px-2">
              My MCPs
            </TabsTrigger>
            <TabsTrigger value="sources" className="text-xs h-7 px-2">
              Sources
            </TabsTrigger>
            <TabsTrigger value="catalog" className="text-xs h-7 px-2">
              Catalog
            </TabsTrigger>
          </TabsList>

          {/* Inline Controls for My MCPs tab */}
          {activeTab === "my-mcps" && (
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-[140px] pl-7 pr-2 py-1.5 rounded-md border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
              </div>
              <Select
                value={filterContext || "all"}
                onValueChange={(v) => setFilterContext(v === "all" ? null : v)}
              >
                <SelectTrigger className="w-[100px] h-7 text-xs">
                  <SelectValue placeholder="Context" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {contexts.map((ctx) => (
                    <SelectItem key={ctx.id} value={ctx.id}>
                      {ctx.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "h-7 text-xs",
                  showOnlyEnabled && "bg-primary/10",
                )}
                onClick={() => setShowOnlyEnabled(!showOnlyEnabled)}
              >
                <Filter className="h-3 w-3 mr-1" />
                {showOnlyEnabled ? "All" : "On"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={resetAll}
              >
                Enable All
              </Button>
            </div>
          )}
        </div>

        {/* My MCPs Tab */}
        <TabsContent value="my-mcps" className="mt-0">
          {/* MCP List */}
          <ScrollArea className="h-[500px]">
            <div className="space-y-6">
              {Object.entries(mcpsBySource).map(([source, sourceMcps]) => (
                <div key={source}>
                  <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-muted text-muted-foreground text-xs">
                      {SOURCE_LABELS[source] || source}
                    </span>
                    <span className="text-muted-foreground">
                      ({sourceMcps.length})
                    </span>
                  </h3>

                  <div className="grid gap-2">
                    {sourceMcps.map((mcp) => (
                      <McpCard
                        key={mcp.id}
                        mcp={mcp}
                        onToggle={() => toggleMcp(mcp.id)}
                        onEdit={() => handleEditMcp(mcp)}
                        onDelete={() => handleDeleteMcp(mcp)}
                        onInspect={() => handleInspectMcp(mcp)}
                        onFetchTools={() =>
                          fetchTools(mcp.id, mcp.config || {})
                        }
                        autoCheck={true}
                      />
                    ))}
                  </div>
                </div>
              ))}

              {filteredMcps.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Search className="h-12 w-12 mb-4 opacity-50" />
                  {mcps.length === 0 && diagnostics ? (
                    // No MCPs found at all - show diagnostics for troubleshooting
                    <>
                      <p className="text-lg font-medium mb-4">
                        No MCP servers configured
                      </p>
                      <div className="text-left max-w-lg space-y-4">
                        <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                          <p className="font-medium text-sm">
                            Config file paths checked:
                          </p>
                          {Object.entries(diagnostics.configPaths).map(
                            ([key, value]) => (
                              <div
                                key={key}
                                className="flex items-center gap-2 text-xs font-mono"
                              >
                                <span
                                  className={
                                    value.exists
                                      ? "text-green-500"
                                      : "text-red-500"
                                  }
                                >
                                  {value.exists ? "✓" : "✗"}
                                </span>
                                <span className="truncate" title={value.path}>
                                  {value.path}
                                </span>
                                {value.fromEnvVar && (
                                  <span className="text-blue-500 text-xs">
                                    (from env)
                                  </span>
                                )}
                              </div>
                            ),
                          )}
                        </div>
                        {diagnostics.hints.length > 0 && (
                          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
                            <p className="font-medium text-sm text-amber-500 mb-2">
                              Troubleshooting hints:
                            </p>
                            <ul className="list-disc pl-4 space-y-1 text-xs">
                              {diagnostics.hints.map((hint, i) => (
                                <li key={i}>{hint}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {diagnostics.isContainerMode && (
                          <p className="text-xs text-muted-foreground">
                            Running in container mode. Check docker-compose.yml
                            volume mounts for CLAUDE_CONFIG_PATH and
                            HOME_MCP_PATH.
                          </p>
                        )}
                      </div>
                    </>
                  ) : (
                    // Has MCPs but none match filters
                    <p>No MCPs found matching your filters</p>
                  )}
                  <Button
                    variant="outline"
                    className="mt-4"
                    onClick={handleAddMcp}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add your first MCP
                  </Button>
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* Sources Tab */}
        <TabsContent value="sources">
          <McpSourcesPanel sources={discoverySources} />
        </TabsContent>

        {/* Catalog Tab */}
        <TabsContent value="catalog">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">MCP Catalog</CardTitle>
                  <CardDescription>
                    Browse community MCPs and submit your own
                  </CardDescription>
                </div>
                <McpSubmitForm onSubmitted={refetchCatalog} />
              </div>
            </CardHeader>
            <CardContent>
              {catalogLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Pending Submissions */}
                  {pendingSubmissions.length > 0 && (
                    <div>
                      <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                        Pending Submissions ({pendingSubmissions.length})
                      </h3>
                      <McpSubmissionsPanel onApproved={refetchCatalog} />
                    </div>
                  )}

                  {/* Catalog MCPs */}
                  <div className="grid gap-4 md:grid-cols-2">
                    {catalogMcps.slice(0, 10).map((mcp) => (
                      <Card
                        key={mcp.id}
                        className="hover:border-primary/50 transition-colors"
                      >
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base">
                            {mcp.name}
                          </CardTitle>
                          <CardDescription className="text-xs">
                            {mcp.description}
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="pt-0">
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>v{mcp.version}</span>
                            <span>{mcp.category}</span>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  {catalogMcps.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No MCPs in catalog yet</p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Editor Dialog */}
      <McpEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        mode={editorMode}
        initialData={editingMcp || undefined}
        onSave={handleSave}
      />

      {/* Delete Confirmation Dialog */}
      {deletingMcp && (
        <McpDeleteConfirm
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          mcpId={deletingMcp.id}
          mcpSource={deletingMcp.sourcePath}
          onConfirm={handleConfirmDelete}
        />
      )}
    </div>
  );
}
