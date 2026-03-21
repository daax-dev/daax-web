"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Loader2,
  RefreshCw,
  Settings,
  PlayCircle,
  StopCircle,
  RotateCw,
} from "lucide-react";
import {
  getServerStatus,
  startServer,
  stopServer,
  restartServer,
  fetchConfig,
  type BacklogServerStatus,
} from "@/lib/backlog/api-client";
import type { BacklogConfig } from "@/lib/backlog";
import { toast } from "sonner";

export default function BacklogSettingsPage() {
  const [serverStatus, setServerStatus] = useState<BacklogServerStatus | null>(
    null,
  );
  const [config, setConfig] = useState<BacklogConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isActioning, setIsActioning] = useState(false);
  const [projectPath, setProjectPath] = useState("");
  const [port, setPort] = useState("3001");

  const loadData = useCallback(async () => {
    try {
      const status = await getServerStatus();
      setServerStatus(status);

      if (status.running && status.healthy) {
        const configData = await fetchConfig();
        setConfig(configData);
      }
    } catch (err) {
      console.error("Failed to load settings:", err);
      toast.error("Failed to load settings");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadData();
  };

  const handleStart = async () => {
    if (!projectPath.trim()) {
      toast.error("Please enter a project path");
      return;
    }

    setIsActioning(true);
    try {
      await startServer(projectPath.trim(), parseInt(port) || 3001);
      await loadData();
      toast.success("Server started");
    } catch (err) {
      console.error("Failed to start server:", err);
      toast.error("Failed to start server");
    } finally {
      setIsActioning(false);
    }
  };

  const handleStop = async () => {
    setIsActioning(true);
    try {
      await stopServer();
      await loadData();
      toast.success("Server stopped");
    } catch (err) {
      console.error("Failed to stop server:", err);
      toast.error("Failed to stop server");
    } finally {
      setIsActioning(false);
    }
  };

  const handleRestart = async () => {
    setIsActioning(true);
    try {
      await restartServer();
      await loadData();
      toast.success("Server restarted");
    } catch (err) {
      console.error("Failed to restart server:", err);
      toast.error("Failed to restart server");
    } finally {
      setIsActioning(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-[calc(100vh-120px)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isRunning = serverStatus?.running && serverStatus?.healthy;

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b p-4">
        <h1 className="text-lg font-semibold flex items-center gap-2">
          <Settings className="h-5 w-5" />
          Settings
        </h1>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isRefreshing}
        >
          <RefreshCw
            className={`h-4 w-4 mr-1 ${isRefreshing ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-6 max-w-2xl">
          {/* Server Status */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Server Status</CardTitle>
              <CardDescription>
                Control the Backlog.md server subprocess
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <Badge variant={isRunning ? "default" : "secondary"}>
                  {isRunning ? "Running" : "Stopped"}
                </Badge>
                {serverStatus?.port && (
                  <span className="text-sm text-muted-foreground">
                    Port: {serverStatus.port}
                  </span>
                )}
                {serverStatus?.uptime && (
                  <span className="text-sm text-muted-foreground">
                    Uptime: {Math.round(serverStatus.uptime / 1000 / 60)}m
                  </span>
                )}
              </div>

              {!isRunning && (
                <>
                  <Separator />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="projectPath">Project Path</Label>
                      <Input
                        id="projectPath"
                        value={projectPath}
                        onChange={(e) => setProjectPath(e.target.value)}
                        placeholder="/path/to/project"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="port">Port</Label>
                      <Input
                        id="port"
                        type="number"
                        value={port}
                        onChange={(e) => setPort(e.target.value)}
                        placeholder="3001"
                      />
                    </div>
                  </div>
                </>
              )}

              <div className="flex gap-2">
                {isRunning ? (
                  <>
                    <Button
                      variant="outline"
                      onClick={handleRestart}
                      disabled={isActioning}
                    >
                      <RotateCw className="h-4 w-4 mr-1" />
                      Restart
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={handleStop}
                      disabled={isActioning}
                    >
                      <StopCircle className="h-4 w-4 mr-1" />
                      Stop
                    </Button>
                  </>
                ) : (
                  <Button onClick={handleStart} disabled={isActioning}>
                    <PlayCircle className="h-4 w-4 mr-1" />
                    Start Server
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Project Configuration */}
          {config && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Project Configuration
                </CardTitle>
                <CardDescription>
                  Configuration from backlog/.backlog/config.json
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label className="text-muted-foreground">
                      Project Name
                    </Label>
                    <p className="font-medium">{config.projectName}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Date Format</Label>
                    <p className="font-medium">{config.dateFormat}</p>
                  </div>
                </div>

                <Separator />

                <div>
                  <Label className="text-muted-foreground">Statuses</Label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {config.statuses.map((status) => (
                      <Badge key={status} variant="outline">
                        {status}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div>
                  <Label className="text-muted-foreground">Labels</Label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {config.labels.map((label) => (
                      <Badge key={label} variant="secondary">
                        {label}
                      </Badge>
                    ))}
                  </div>
                </div>

                {config.milestones.length > 0 && (
                  <div>
                    <Label className="text-muted-foreground">Milestones</Label>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {config.milestones.map((milestone) => (
                        <Badge key={milestone} variant="outline">
                          {milestone}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
