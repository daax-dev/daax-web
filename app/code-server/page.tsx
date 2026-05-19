"use client";

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
import {
  Play,
  Square,
  RefreshCw,
  ExternalLink,
  FolderOpen,
  AlertCircle,
  AlertTriangle,
} from "lucide-react";
import { getSettings } from "@/lib/settings";
import { useProject } from "@/lib/project-context";
import Link from "next/link";

export default function CodeServerPage() {
  const [isRunning, setIsRunning] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [port, setPort] = useState(18080);
  const [codeServerUrl, setCodeServerUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [mountedProject, setMountedProject] = useState<string | null>(null);
  // null = not yet checked, true/false = result of pre-flight image check
  const [imageAvailable, setImageAvailable] = useState<boolean | null>(null);
  const [imageName, setImageName] = useState("daax-code-server:latest");

  const { activeProject, getProjectPath, basePath, directories } = useProject();

  // Load settings on mount
  useEffect(() => {
    const settings = getSettings();
    setPort(settings.codeServerPort);
  }, []);

  // Build the code-server URL based on environment or current hostname
  // Note: When NEXT_PUBLIC_CODE_SERVER_URL is set (build-time constant), port changes don't matter
  const envUrl = process.env.NEXT_PUBLIC_CODE_SERVER_URL;

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Use environment variable if set (Traefik mode)
    if (envUrl) {
      setCodeServerUrl(envUrl);
      return;
    }

    // Fallback to auto-detection based on current hostname
    const host = window.location.hostname;
    const protocol = window.location.protocol;

    // If on Traefik domain (daax.{hostname}.poley.dev), use daax-code subdomain
    if (host.startsWith("daax.") && host.endsWith(".poley.dev")) {
      const codeHost = host.replace("daax.", "daax-code.");
      setCodeServerUrl(`${protocol}//${codeHost}/?folder=/workspace`);
    } else {
      // Direct access (localhost or direct IP) - use port
      setCodeServerUrl(`${protocol}//${host}:${port}/?folder=/workspace`);
    }
  }, [envUrl, port]);

  // Get the path to mount - use active project or full workspace
  const getMountPath = () => {
    return activeProject ? getProjectPath() : basePath;
  };

  // Check if there's a project mismatch (running container has different project than selected)
  const hasProjectMismatch =
    isRunning &&
    mountedProject &&
    activeProject &&
    mountedProject !== activeProject;

  const startCodeServer = async () => {
    if (!activeProject) {
      setError("Please select a project from the top menu bar first");
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      // Find project info
      const projectInfo = directories.find((d) => d.name === activeProject);

      const response = await fetch("/api/code-server", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "start",
          port,
          project: activeProject,
          projectType: projectInfo?.type,
          basePath,
        }),
      });
      const data = await response.json();
      if (data.success) {
        setImageAvailable(true);
        setIsRunning(true);
        setMountedProject(activeProject);
        // Give code-server a moment to start, then open in new tab
        setTimeout(() => {
          setIsLoading(false);
          // Use the codeServerUrl state (already computed from env var or auto-detection)
          window.open(codeServerUrl, "_blank");
        }, 2000);
      } else {
        if (data.code === "IMAGE_NOT_FOUND") {
          setImageAvailable(false);
          if (data.image) setImageName(data.image);
        }
        setError(data.error || "Failed to start code-server");
        setIsLoading(false);
      }
    } catch {
      setError("Failed to communicate with server");
      setIsLoading(false);
    }
  };

  const stopCodeServer = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/code-server", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop" }),
      });
      const data = await response.json();
      if (data.success) {
        setIsRunning(false);
        setMountedProject(null);
      } else {
        setError(data.error || "Failed to stop code-server");
      }
    } catch {
      setError("Failed to communicate with server");
    }
    setIsLoading(false);
  };

  const checkStatus = async () => {
    try {
      const response = await fetch("/api/code-server");
      const data = await response.json();
      setIsRunning(data.running);
      if (data.port) setPort(data.port);
      setMountedProject(data.mountedProject || null);
      if (typeof data.imageAvailable === "boolean")
        setImageAvailable(data.imageAvailable);
      if (data.image) setImageName(data.image);
    } catch {
      // Server might not be reachable
    }
  };

  useEffect(() => {
    checkStatus();
  }, []);

  return (
    <div className="container mx-auto py-6 px-4 max-w-screen-2xl">
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold">Code Server</h1>
          <p className="text-muted-foreground">
            Launch VS Code in the browser for editing files
          </p>
        </div>

        {hasProjectMismatch && (
          <div className="bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 px-4 py-3 rounded-md flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Project Mismatch</p>
              <p className="text-sm mt-1">
                Code-server is running with <strong>{mountedProject}</strong>,
                but you have <strong>{activeProject}</strong> selected.
              </p>
              <p className="text-sm mt-1">
                Click <strong>Stop</strong> then <strong>Start</strong> to
                switch to the selected project.
              </p>
            </div>
          </div>
        )}

        {imageAvailable === false && (
          <div className="bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 px-4 py-3 rounded-md flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5" />
            <div className="space-y-2">
              <p className="font-medium">Code-server image not found</p>
              <p className="text-sm">
                The image{" "}
                <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">
                  {imageName}
                </code>{" "}
                is not available locally. It is not a public registry image, so
                Docker cannot pull it.{" "}
                <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">
                  rebuild.sh
                </code>{" "}
                and{" "}
                <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">
                  deploy-local.sh
                </code>{" "}
                build it automatically; if you started Daax another way, build
                it once then click <strong>Start</strong> again:
              </p>
              <pre className="text-xs bg-muted text-foreground p-3 rounded overflow-x-auto">
                ./scripts/build-code-server.sh
              </pre>
              <p className="text-sm">
                Or set the{" "}
                <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">
                  CODE_SERVER_IMAGE
                </code>{" "}
                environment variable to an image you already have.
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-md flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Current Project</CardTitle>
              <CardDescription>Selected from the top menu bar</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {activeProject ? (
                <div className="p-4 bg-muted rounded-md">
                  <div className="flex items-center gap-3">
                    <FolderOpen className="h-5 w-5 text-primary" />
                    <div>
                      <p className="font-medium">{activeProject}</p>
                      <p className="text-xs text-muted-foreground">
                        {getMountPath()}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 border-2 border-dashed rounded-md text-center">
                  <FolderOpen className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    No project selected
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Use the dropdown in the top menu bar to select a project
                  </p>
                </div>
              )}
              <div className="pt-2">
                <Link
                  href="/settings"
                  className="text-sm text-primary hover:underline"
                >
                  Change project in Settings →
                </Link>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Status</CardTitle>
              <CardDescription>
                {isRunning
                  ? "Code-server is running"
                  : "Code-server is stopped"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <div
                  className={`w-3 h-3 rounded-full ${
                    isRunning
                      ? hasProjectMismatch
                        ? "bg-yellow-500"
                        : "bg-green-500"
                      : "bg-muted"
                  }`}
                />
                <span className="text-sm">
                  {isRunning ? "Running" : "Stopped"}
                  {isRunning && mountedProject && (
                    <span className="text-muted-foreground ml-1">
                      ({mountedProject})
                    </span>
                  )}
                </span>
              </div>

              <div className="flex gap-2">
                {!isRunning ? (
                  <Button
                    onClick={startCodeServer}
                    disabled={
                      isLoading || !activeProject || imageAvailable === false
                    }
                  >
                    {isLoading ? (
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4 mr-2" />
                    )}
                    Start
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="destructive"
                      onClick={stopCodeServer}
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Square className="h-4 w-4 mr-2" />
                      )}
                      Stop
                    </Button>
                    <Button
                      onClick={() => window.open(codeServerUrl, "_blank")}
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Open VS Code
                    </Button>
                  </>
                )}
                <Button variant="ghost" size="icon" onClick={checkStatus}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>

              {isRunning && (
                <div className="pt-2 space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    Access URL
                  </Label>
                  <a
                    href={codeServerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline block text-sm"
                  >
                    {codeServerUrl}
                  </a>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Configuration</CardTitle>
            <CardDescription>Advanced settings</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-w-xs">
              <Label htmlFor="port">Port</Label>
              <Input
                id="port"
                type="number"
                value={port}
                onChange={(e) => setPort(parseInt(e.target.value) || 18080)}
                disabled={isRunning}
              />
              <p className="text-xs text-muted-foreground">
                Port for code-server (default: 18080)
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Instructions</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>
              1. <strong>Select a project</strong> from the dropdown in the top
              menu bar
            </p>
            <p>
              2. Click <strong>Start</strong> to launch code-server in a Docker
              container
            </p>
            <p>3. VS Code will open automatically in a new browser tab</p>
            <p>
              4. Use the <strong>Open VS Code</strong> button to reopen at any
              time
            </p>
            <p>
              5. Click <strong>Stop</strong> when done to shut down the
              container
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
