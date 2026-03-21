"use client";

/**
 * MCP Inspector Plugin - Main Panel Component
 *
 * This is the primary UI for the MCP Inspector plugin.
 * It allows users to launch, manage, and monitor inspector instances.
 */

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  ExternalLink,
  Play,
  Square,
  RefreshCw,
  Terminal,
  Globe,
  Loader2,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";

import type { PluginComponentProps } from "@/lib/plugins";
import type { RunningInspector, InspectorMcp } from "../types";
import { getInspectorStatus, launchInspector, stopInspector } from "../api";

export interface InspectorPanelProps extends PluginComponentProps {
  /** MCPs available for inspection - can come from props or context */
  mcps?: InspectorMcp[];
}

export function InspectorPanel({
  context,
  mcps: propMcps,
}: InspectorPanelProps) {
  // MCPs can come from direct props or from plugin context
  const mcps: InspectorMcp[] =
    propMcps || (context?.mcps as InspectorMcp[]) || [];
  const [selectedMcp, setSelectedMcp] = useState<string>("");
  const [transport, setTransport] = useState<"stdio" | "sse" | "http">("stdio");
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");
  const [serverUrl, setServerUrl] = useState("");
  const [envVars, setEnvVars] = useState("");
  const [runningInspectors, setRunningInspectors] = useState<
    RunningInspector[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch running inspectors on mount
  useEffect(() => {
    fetchRunningInspectors();
    const interval = setInterval(fetchRunningInspectors, 10000);
    return () => clearInterval(interval);
  }, []);

  // When MCP is selected, populate fields from its configuration
  useEffect(() => {
    if (selectedMcp) {
      const mcp = mcps.find((m) => m.id === selectedMcp);
      if (mcp?.configuration) {
        const config = mcp.configuration;
        if (config.command) setCommand(config.command);
        if (config.args) setArgs(config.args.join(" "));
        if (config.url) setServerUrl(config.url);
        if (config.env) {
          setEnvVars(
            Object.entries(config.env)
              .map(([k, v]) => `${k}=${v}`)
              .join("\n"),
          );
        }
      }
    }
  }, [selectedMcp, mcps]);

  async function fetchRunningInspectors() {
    try {
      const data = await getInspectorStatus();
      setRunningInspectors(data.running || []);
    } catch (err) {
      console.error("Failed to fetch inspectors:", err);
    }
  }

  async function handleLaunch() {
    if (!selectedMcp && !command && !serverUrl) {
      setError("Please select an MCP or provide a command/URL");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Parse environment variables
      const env: Record<string, string> = {};
      if (envVars) {
        envVars.split("\n").forEach((line) => {
          const [key, ...valueParts] = line.split("=");
          if (key && valueParts.length > 0) {
            env[key.trim()] = valueParts.join("=").trim();
          }
        });
      }

      // Parse args
      const argList = args
        .split(" ")
        .map((a) => a.trim())
        .filter(Boolean);

      const data = await launchInspector({
        mcpId: selectedMcp || `custom-${Date.now()}`,
        command: transport === "stdio" ? command : undefined,
        args: argList,
        env,
        transport,
        serverUrl: transport !== "stdio" ? serverUrl : undefined,
      });

      // Refresh list and open in new tab
      await fetchRunningInspectors();

      if (data.url) {
        window.open(data.url, "_blank");
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleStop(mcpId: string) {
    try {
      await stopInspector(mcpId);
      await fetchRunningInspectors();
    } catch (err) {
      setError(String(err));
    }
  }

  function openInspector(url: string) {
    window.open(url, "_blank");
  }

  return (
    <div className="space-y-6">
      {/* Launch New Inspector */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Terminal className="h-5 w-5" />
            Launch MCP Inspector
          </CardTitle>
          <CardDescription>
            Test and debug MCP servers using the official MCP Inspector tool
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* MCP Selection */}
          <div className="space-y-2">
            <Label htmlFor="mcp-select">Select MCP from Catalog</Label>
            <Select
              value={selectedMcp || "_manual"}
              onValueChange={(v) => setSelectedMcp(v === "_manual" ? "" : v)}
            >
              <SelectTrigger id="mcp-select">
                <SelectValue placeholder="Choose an MCP to test..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_manual">
                  -- Manual Configuration --
                </SelectItem>
                {mcps.map((mcp) => (
                  <SelectItem key={mcp.id} value={mcp.id}>
                    {mcp.name}
                    {mcp.isCore && " (Core)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Transport Type */}
          <div className="space-y-2">
            <Label htmlFor="transport">Transport</Label>
            <Select
              value={transport}
              onValueChange={(v) => setTransport(v as "stdio" | "sse" | "http")}
            >
              <SelectTrigger id="transport">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="stdio">stdio (local command)</SelectItem>
                <SelectItem value="sse">SSE (server-sent events)</SelectItem>
                <SelectItem value="http">HTTP (streamable)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Stdio Config */}
          {transport === "stdio" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="command">Command</Label>
                <Input
                  id="command"
                  placeholder="e.g., node, python, npx"
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="args">Arguments (space-separated)</Label>
                <Input
                  id="args"
                  placeholder="e.g., server.js --port 3000"
                  value={args}
                  onChange={(e) => setArgs(e.target.value)}
                />
              </div>
            </>
          )}

          {/* URL Config for SSE/HTTP */}
          {transport !== "stdio" && (
            <div className="space-y-2">
              <Label htmlFor="server-url">Server URL</Label>
              <Input
                id="server-url"
                placeholder={
                  transport === "sse"
                    ? "http://localhost:3000/sse"
                    : "http://localhost:3000/mcp"
                }
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
              />
            </div>
          )}

          {/* Environment Variables */}
          <div className="space-y-2">
            <Label htmlFor="env">
              Environment Variables (one per line: KEY=value)
            </Label>
            <Textarea
              id="env"
              placeholder="API_KEY=xxx&#10;DEBUG=true"
              value={envVars}
              onChange={(e) => setEnvVars(e.target.value)}
              rows={3}
            />
          </div>

          {/* Error Display */}
          {error && (
            <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}

          {/* Launch Button */}
          <Button onClick={handleLaunch} disabled={loading} className="w-full">
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Launching Inspector...
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                Launch Inspector
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Running Inspectors */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                Running Inspectors
              </CardTitle>
              <CardDescription>Active MCP Inspector instances</CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchRunningInspectors}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {runningInspectors.length === 0 ? (
            <p className="text-muted-foreground text-center text-sm">
              No inspectors running. Launch one above to get started.
            </p>
          ) : (
            <div className="space-y-3">
              {runningInspectors.map((inspector) => (
                <div
                  key={inspector.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                    <div>
                      <p className="font-medium">{inspector.id}</p>
                      <p className="text-muted-foreground text-sm">
                        Port {inspector.port} • Started{" "}
                        {new Date(inspector.startedAt).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">Running</Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openInspector(inspector.url)}
                    >
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Open
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleStop(inspector.id)}
                    >
                      <Square className="mr-2 h-4 w-4" />
                      Stop
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Start Guide */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Start Guide</CardTitle>
        </CardHeader>
        <CardContent className="prose prose-sm dark:prose-invert max-w-none">
          <ol className="text-muted-foreground space-y-2 text-sm">
            <li>
              <strong>Select an MCP</strong> from the catalog or configure
              manually
            </li>
            <li>
              <strong>Choose transport</strong>: stdio for local commands,
              SSE/HTTP for remote servers
            </li>
            <li>
              <strong>Add environment variables</strong> if your MCP needs API
              keys or config
            </li>
            <li>
              <strong>Launch</strong> the inspector - it opens in a new browser
              tab
            </li>
            <li>
              <strong>Use the inspector</strong> to test tools, resources, and
              prompts
            </li>
          </ol>
          <div className="mt-4 rounded-md bg-muted p-3 text-sm">
            <strong>Tip:</strong> The MCP Inspector runs on a randomly assigned
            port starting from 6274. You can run multiple inspectors
            simultaneously for different MCPs.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
