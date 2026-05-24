/**
 * Test Containers Compose Page
 *
 * Manage Docker Compose stacks.
 */

"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Layers,
  Upload,
  Play,
  Square,
  Trash2,
  RefreshCw,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  FileCode,
} from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type {
  ComposeProject,
  ComposeProjectStatus,
} from "@/plugins/testcontainers/types/compose";

const statusColors: Record<ComposeProjectStatus, string> = {
  created: "bg-gray-500/20 text-gray-500",
  running: "bg-green-500/20 text-green-500",
  partial: "bg-yellow-500/20 text-yellow-500",
  stopped: "bg-red-500/20 text-red-500",
  error: "bg-red-700/20 text-red-700",
};

const statusLabels: Record<ComposeProjectStatus, string> = {
  created: "Created",
  running: "Running",
  partial: "Partial",
  stopped: "Stopped",
  error: "Error",
};

function ProjectCard({
  project,
  onStart,
  onStop,
  onRemove,
}: {
  project: ComposeProject;
  onStart: (id: string) => Promise<void>;
  onStop: (id: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState<"start" | "stop" | "remove" | null>(
    null,
  );

  const handleAction = async (action: "start" | "stop" | "remove") => {
    setLoading(action);
    try {
      if (action === "start") await onStart(project.id);
      else if (action === "stop") await onStop(project.id);
      else await onRemove(project.id);
    } finally {
      setLoading(null);
    }
  };

  const runningServices = project.services.filter(
    (s) => s.status === "running",
  ).length;

  return (
    <Card className="hover:border-primary/50 transition-colors">
      <CardHeader className="p-4 pb-2">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">{project.name}</CardTitle>
              <Badge className={cn("text-xs", statusColors[project.status])}>
                {statusLabels[project.status]}
              </Badge>
            </div>
            <CardDescription className="mt-1">
              {project.services.length} service
              {project.services.length !== 1 ? "s" : ""} •{runningServices}{" "}
              running
            </CardDescription>
          </div>

          <div className="flex items-center gap-1">
            {project.status !== "running" && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => handleAction("start")}
                disabled={loading !== null}
                title="Start stack"
              >
                {loading === "start" ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
              </Button>
            )}

            {project.status === "running" || project.status === "partial" ? (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => handleAction("stop")}
                disabled={loading !== null}
                title="Stop stack"
              >
                {loading === "stop" ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Square className="h-4 w-4" />
                )}
              </Button>
            ) : null}

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  disabled={loading !== null}
                  title="Remove stack"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remove Stack</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to remove{" "}
                    <strong>{project.name}</strong>? This will stop and remove
                    all {project.services.length} service(s). This action cannot
                    be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => handleAction("remove")}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Remove
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 pt-2">
        {/* Services collapsible */}
        <Collapsible open={expanded} onOpenChange={setExpanded}>
          <CollapsibleTrigger className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground w-full">
            {expanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            View services
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 space-y-2">
            {project.services.map((service) => (
              <div
                key={service.name}
                className="flex items-center justify-between p-2 rounded bg-muted/50"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full",
                      service.status === "running"
                        ? "bg-green-500"
                        : "bg-gray-500",
                    )}
                  />
                  <span className="font-medium text-sm">{service.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {service.image}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {service.ports.slice(0, 2).map((port, idx) => (
                    <Badge key={idx} variant="outline" className="text-xs">
                      {port.containerPort}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </CollapsibleContent>
        </Collapsible>

        {/* Error message */}
        {project.error && (
          <div className="mt-2 p-2 rounded bg-destructive/10 text-destructive text-sm">
            {project.error}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ComposePage() {
  const [projects, setProjects] = useState<ComposeProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  // Form state
  const [projectName, setProjectName] = useState("");
  const [yamlContent, setYamlContent] = useState("");
  const [startImmediately, setStartImmediately] = useState(true);

  const fetchProjects = useCallback(async () => {
    try {
      setError(null);
      const response = await fetch("/api/testcontainers/compose");
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to fetch projects");
      }
      const data = await response.json();
      setProjects(data.projects);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
    const interval = setInterval(fetchProjects, 10000);
    return () => clearInterval(interval);
  }, [fetchProjects]);

  const handleCreate = async () => {
    if (!projectName || !yamlContent) {
      toast.error("Project name and YAML content are required");
      return;
    }

    setCreating(true);
    try {
      const response = await fetch("/api/testcontainers/compose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: projectName,
          yaml: yamlContent,
          startImmediately,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create project");
      }

      toast.success("Project created successfully");
      setDialogOpen(false);
      setProjectName("");
      setYamlContent("");
      fetchProjects();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to create project",
      );
    } finally {
      setCreating(false);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setYamlContent(content);

      // Auto-set project name from filename
      if (!projectName) {
        const name = file.name
          .replace(/\.(ya?ml)$/i, "")
          .replace(/[^a-zA-Z0-9-]/g, "-");
        setProjectName(name);
      }
    };
    reader.readAsText(file);
  };

  const handleStart = async (id: string) => {
    const response = await fetch(`/api/testcontainers/compose/${id}/start`, {
      method: "POST",
    });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || "Failed to start project");
    }
    toast.success("Project started");
    fetchProjects();
  };

  const handleStop = async (id: string) => {
    const response = await fetch(`/api/testcontainers/compose/${id}/stop`, {
      method: "POST",
    });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || "Failed to stop project");
    }
    toast.success("Project stopped");
    fetchProjects();
  };

  const handleRemove = async (id: string) => {
    const response = await fetch(`/api/testcontainers/compose/${id}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || "Failed to remove project");
    }
    toast.success("Project removed");
    fetchProjects();
  };

  // Example docker-compose.yml
  const exampleYaml = `version: '3.8'
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: test
      POSTGRES_PASSWORD: test
      POSTGRES_DB: testdb
    ports:
      - "5432:5432"

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  app:
    image: nginx:alpine
    ports:
      - "8080:80"
    depends_on:
      - db
      - redis`;

  return (
    <div className="container py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Layers className="h-6 w-6" />
            Docker Compose
          </h1>
          <p className="text-muted-foreground">
            Manage multi-container applications with Docker Compose
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={fetchProjects} disabled={loading}>
            <RefreshCw
              className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Upload className="h-4 w-4 mr-2" />
                New Stack
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Create Compose Stack</DialogTitle>
                <DialogDescription>
                  Upload a docker-compose.yml file or paste the YAML content.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="name">Stack Name</Label>
                  <Input
                    id="name"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="my-stack"
                    className="mt-1"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label htmlFor="yaml">Compose YAML</Label>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setYamlContent(exampleYaml)}
                      >
                        <FileCode className="h-3 w-3 mr-1" />
                        Load Example
                      </Button>
                      <Label
                        htmlFor="file-upload"
                        className="cursor-pointer text-xs text-primary hover:underline"
                      >
                        Upload file
                      </Label>
                      <input
                        id="file-upload"
                        type="file"
                        accept=".yml,.yaml"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                    </div>
                  </div>
                  <Textarea
                    id="yaml"
                    value={yamlContent}
                    onChange={(e) => setYamlContent(e.target.value)}
                    placeholder="Paste docker-compose.yml content here..."
                    className="font-mono text-sm h-64 mt-1"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="start"
                    checked={startImmediately}
                    onChange={(e) => setStartImmediately(e.target.checked)}
                  />
                  <Label htmlFor="start" className="text-sm">
                    Start stack immediately after creation
                  </Label>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreate} disabled={creating}>
                  {creating ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4 mr-2" />
                  )}
                  Create Stack
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-destructive" />
            <p className="text-sm text-destructive">{error}</p>
          </div>
        </div>
      )}

      {/* Project list */}
      {loading && projects.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="rounded-full bg-muted p-4 mb-4">
            <Layers className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-medium mb-2">No compose stacks</h2>
          <p className="text-muted-foreground max-w-md mb-4">
            Create a new stack by uploading a docker-compose.yml file or pasting
            YAML content.
          </p>
          <Button onClick={() => setDialogOpen(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Create First Stack
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onStart={handleStart}
              onStop={handleStop}
              onRemove={handleRemove}
            />
          ))}
        </div>
      )}
    </div>
  );
}
