"use client";

import { useState, useMemo } from "react";
import {
  Search,
  RefreshCw,
  Power,
  PowerOff,
  Filter,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Settings2,
  Zap,
  Tag,
  FolderSearch,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useMcpGateway } from "@/hooks/use-mcp-gateway";

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

export function McpGateway() {
  const {
    mcps,
    config,
    contexts,
    loading,
    error,
    discoverySources,
    isDiscovering,
    discover,
    toggleMcp,
    enableContextOnly,
    setContext,
    resetAll,
    getEnabledCount,
  } = useMcpGateway();

  const [searchQuery, setSearchQuery] = useState("");
  const [filterContext, setFilterContext] = useState<string | null>(null);
  const [showOnlyEnabled, setShowOnlyEnabled] = useState(false);

  // Filter MCPs
  const filteredMcps = useMemo(() => {
    return mcps.filter((mcp) => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        if (
          !mcp.id.toLowerCase().includes(query) &&
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

  // Group by context
  const mcpsByContext = useMemo(() => {
    const grouped: Record<string, typeof mcps> = {};
    for (const mcp of filteredMcps) {
      const primaryContext = mcp.contextTags[0] || "general";
      if (!grouped[primaryContext]) {
        grouped[primaryContext] = [];
      }
      grouped[primaryContext].push(mcp);
    }
    return grouped;
  }, [filteredMcps]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[300px] text-muted-foreground">
        <AlertCircle className="h-12 w-12 mb-4 text-destructive" />
        <p className="text-destructive">{error}</p>
      </div>
    );
  }

  const enabledCount = getEnabledCount();
  const totalCount = mcps.length;

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <FolderSearch className="h-4 w-4" />
              Discovered
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalCount}</div>
            <p className="text-xs text-muted-foreground">
              from {discoverySources.filter((s) => s.status === "found").length}{" "}
              sources
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Power className="h-4 w-4" />
              Enabled
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">
              {enabledCount}
            </div>
            <p className="text-xs text-muted-foreground">
              {totalCount - enabledCount} disabled
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Active Context
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold capitalize">
              {config?.activeContext || "All"}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Token Savings
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              ~{Math.round(((totalCount - enabledCount) / totalCount) * 100)}%
            </div>
            <p className="text-xs text-muted-foreground">context reduction</p>
          </CardContent>
        </Card>
      </div>

      {/* Discovery Sources */}
      {discoverySources.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <FolderSearch className="h-4 w-4" />
              Discovery Sources
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {discoverySources.map((source, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex items-center gap-2 px-2 py-1 rounded text-xs border",
                    source.status === "found"
                      ? "border-green-500/20 bg-green-500/10"
                      : source.status === "error"
                        ? "border-red-500/20 bg-red-500/10"
                        : "border-muted",
                  )}
                >
                  {source.status === "found" ? (
                    <CheckCircle2 className="h-3 w-3 text-green-500" />
                  ) : source.status === "error" ? (
                    <XCircle className="h-3 w-3 text-red-500" />
                  ) : (
                    <AlertCircle className="h-3 w-3 text-muted-foreground" />
                  )}
                  <span>{source.name}</span>
                  {source.mcpCount > 0 && (
                    <span className="text-muted-foreground">
                      ({source.mcpCount})
                    </span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-4">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search MCPs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        {/* Context Filter */}
        <Select
          value={filterContext || "all"}
          onValueChange={(v) => setFilterContext(v === "all" ? null : v)}
        >
          <SelectTrigger className="w-[160px]">
            <Tag className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Context" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Contexts</SelectItem>
            {contexts.map((ctx) => (
              <SelectItem key={ctx.id} value={ctx.id}>
                {ctx.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Quick Actions */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowOnlyEnabled(!showOnlyEnabled)}
            className={showOnlyEnabled ? "bg-primary/10" : ""}
          >
            <Power className="h-4 w-4 mr-1" />
            {showOnlyEnabled ? "Show All" : "Enabled Only"}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={discover}
            disabled={isDiscovering}
          >
            <RefreshCw
              className={cn("h-4 w-4 mr-1", isDiscovering && "animate-spin")}
            />
            Refresh
          </Button>

          <Button variant="outline" size="sm" onClick={resetAll}>
            <Settings2 className="h-4 w-4 mr-1" />
            Reset
          </Button>
        </div>
      </div>

      {/* Quick Context Buttons */}
      <div className="flex flex-wrap gap-2">
        <span className="text-sm text-muted-foreground self-center mr-2">
          Quick filter:
        </span>
        {contexts.map((ctx) => (
          <Button
            key={ctx.id}
            variant="outline"
            size="sm"
            onClick={() => enableContextOnly(ctx.id)}
            className={cn(
              "text-xs",
              config?.activeContext === ctx.id &&
                "bg-primary/10 border-primary/50",
            )}
          >
            {ctx.label}
          </Button>
        ))}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setContext(null)}
          className={cn(
            "text-xs",
            !config?.activeContext && "bg-primary/10 border-primary/50",
          )}
        >
          All
        </Button>
      </div>

      {/* MCP List */}
      <ScrollArea className="h-[500px]">
        <div className="space-y-6">
          {Object.entries(mcpsByContext).map(([context, contextMcps]) => (
            <div key={context}>
              <h3 className="text-sm font-medium mb-3 flex items-center gap-2 capitalize">
                <ContextTag tag={context} />
                <span>{context}</span>
                <span className="text-muted-foreground">
                  ({contextMcps.length})
                </span>
              </h3>

              <div className="grid gap-2">
                {contextMcps.map((mcp) => (
                  <div
                    key={mcp.id}
                    className={cn(
                      "flex items-center justify-between p-3 rounded-lg border transition-colors",
                      mcp.enabled ? "bg-card" : "bg-muted/30 opacity-60",
                    )}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <Switch
                        checked={mcp.enabled}
                        onCheckedChange={() => toggleMcp(mcp.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">
                          {mcp.id}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          {mcp.contextTags.map((tag) => (
                            <ContextTag key={tag} tag={tag} />
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {mcp.usageCount > 0 && (
                        <span title="Usage count">{mcp.usageCount} uses</span>
                      )}
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded",
                          mcp.enabled
                            ? "bg-green-500/10 text-green-500"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {mcp.enabled ? "ON" : "OFF"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {filteredMcps.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Search className="h-12 w-12 mb-4 opacity-50" />
              <p>No MCPs found matching your filters</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
