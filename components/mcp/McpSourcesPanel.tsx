"use client";

import {
  CheckCircle2,
  AlertCircle,
  FolderSearch,
  FileJson,
  Monitor,
  FolderCode,
  Home,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface DiscoverySource {
  name: string;
  type: string;
  path?: string;
  mcpCount: number;
  status: "found" | "not_found" | "error";
}

interface McpSourcesPanelProps {
  sources: DiscoverySource[];
  className?: string;
}

const SOURCE_ICONS: Record<string, typeof Home> = {
  claudeCodeGlobal: Home,
  claudeDesktop: Monitor,
  claudeCodeProject: FolderCode,
  homeMcpJson: FileJson,
  projectMcpJson: FileJson,
};

const SOURCE_DESCRIPTIONS: Record<string, string> = {
  claudeCodeGlobal: "Global MCPs from ~/.claude.json root mcpServers",
  claudeDesktop: "MCPs configured in Claude Desktop app",
  claudeCodeProject: "Project-specific MCPs from ~/.claude.json projects",
  homeMcpJson: "MCPs from ~/.mcp.json file",
  projectMcpJson: "MCPs from project-level .mcp.json file",
};

export function McpSourcesPanel({ sources, className }: McpSourcesPanelProps) {
  const foundSources = sources.filter((s) => s.status === "found");
  const notFoundSources = sources.filter((s) => s.status === "not_found");
  const totalMcps = sources.reduce((sum, s) => sum + s.mcpCount, 0);

  return (
    <div className={cn("space-y-6", className)}>
      {/* Summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <FolderSearch className="h-5 w-5 text-primary" />
            Discovery Summary
          </CardTitle>
          <CardDescription>
            MCP servers discovered from various configuration sources
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-3 rounded-lg bg-muted/50">
              <div className="text-2xl font-bold text-primary">{totalMcps}</div>
              <div className="text-xs text-muted-foreground">Total MCPs</div>
            </div>
            <div className="text-center p-3 rounded-lg bg-green-500/10">
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                {foundSources.length}
              </div>
              <div className="text-xs text-muted-foreground">
                Active Sources
              </div>
            </div>
            <div className="text-center p-3 rounded-lg bg-muted/50">
              <div className="text-2xl font-bold text-muted-foreground">
                {notFoundSources.length}
              </div>
              <div className="text-xs text-muted-foreground">
                Inactive Sources
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Active Sources */}
      {foundSources.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            Active Sources
          </h3>
          <div className="grid gap-3">
            {foundSources.map((source) => {
              const Icon = SOURCE_ICONS[source.type] || FileJson;
              return (
                <Card key={source.type} className="border-green-500/20">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-green-500/10">
                        <Icon className="h-4 w-4 text-green-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <h4 className="font-medium text-sm">{source.name}</h4>
                          <span className="text-xs px-2 py-0.5 rounded bg-green-500/10 text-green-600 dark:text-green-400">
                            {source.mcpCount} MCP
                            {source.mcpCount !== 1 ? "s" : ""}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {SOURCE_DESCRIPTIONS[source.type] ||
                            "MCP configuration source"}
                        </p>
                        {source.path && (
                          <code className="text-[10px] text-muted-foreground mt-1 block truncate">
                            {source.path}
                          </code>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Inactive Sources */}
      {notFoundSources.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
            <AlertCircle className="h-4 w-4" />
            Inactive Sources
          </h3>
          <div className="grid gap-2">
            {notFoundSources.map((source) => {
              const Icon = SOURCE_ICONS[source.type] || FileJson;
              return (
                <div
                  key={source.type}
                  className="flex items-center gap-3 p-3 rounded-lg border border-dashed bg-muted/20"
                >
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <div className="flex-1">
                    <span className="text-sm text-muted-foreground">
                      {source.name}
                    </span>
                    <p className="text-xs text-muted-foreground/70">
                      {SOURCE_DESCRIPTIONS[source.type] || "Not configured"}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    Not found
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Help Text */}
      <Card className="bg-muted/30 border-dashed">
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground">
            <strong>Tip:</strong> MCPs can be added to{" "}
            <code className="text-primary">~/.claude.json</code> for global
            availability, or to project-specific configurations. Use the
            &quot;Add MCP&quot; button to add new servers.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
