"use client";

import { useState } from "react";
import Image from "next/image";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Copy,
  Download,
  FolderPlus,
  FileCode,
  Check,
  Box,
  Puzzle,
} from "lucide-react";
import { toast } from "sonner";
import type {
  DevcontainerTemplate,
  DevcontainerBaseImage,
  DevcontainerFeature,
} from "@/lib/devcontainer-settings";

interface CreateOptionsProps {
  devcontainerConfig: Record<string, unknown>;
  selectedTemplate?: DevcontainerTemplate;
  selectedImage?: DevcontainerBaseImage;
  selectedFeatures?: DevcontainerFeature[];
}

export default function CreateOptions({
  devcontainerConfig,
  selectedTemplate,
  selectedImage,
  selectedFeatures = [],
}: CreateOptionsProps) {
  const [projectName, setProjectName] = useState("");
  const [copied, setCopied] = useState(false);

  const jsonContent = JSON.stringify(devcontainerConfig, null, 2);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(jsonContent);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([jsonContent], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "devcontainer.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Downloaded devcontainer.json");
  };

  const handleCreateInProject = async () => {
    try {
      const response = await fetch("/api/devcontainer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create-in-project",
          config: devcontainerConfig,
        }),
      });

      if (response.ok) {
        toast.success(
          "Created .devcontainer/devcontainer.json in current project",
        );
      } else {
        const error = await response.json();
        toast.error(error.message || "Failed to create devcontainer");
      }
    } catch {
      toast.error("Failed to create devcontainer");
    }
  };

  const handleCreateNewProject = async () => {
    if (!projectName.trim()) {
      toast.error("Please enter a project name");
      return;
    }

    try {
      const response = await fetch("/api/devcontainer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create-new-project",
          projectName: projectName.trim(),
          config: devcontainerConfig,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        toast.success(`Created new project: ${data.path}`);
      } else {
        const error = await response.json();
        toast.error(error.message || "Failed to create project");
      }
    } catch {
      toast.error("Failed to create project");
    }
  };

  return (
    <div className="space-y-6">
      {/* JSON Preview + Visual Summary - Side by side */}
      <div className="grid grid-cols-2 gap-4">
        {/* Left: JSON Preview */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">devcontainer.json</CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleCopy}>
                  {copied ? (
                    <Check className="h-4 w-4 mr-1" />
                  ) : (
                    <Copy className="h-4 w-4 mr-1" />
                  )}
                  Copy
                </Button>
                <Button variant="outline" size="sm" onClick={handleDownload}>
                  <Download className="h-4 w-4 mr-1" />
                  Download
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <pre className="bg-muted p-4 rounded-lg text-sm overflow-auto max-h-80">
              <code>{jsonContent}</code>
            </pre>
          </CardContent>
        </Card>

        {/* Right: Visual Summary */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Configuration Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Selected Template */}
            {selectedTemplate && (
              <div>
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-2">
                  <Box className="h-4 w-4" />
                  Template
                </div>
                <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                  <div className="h-10 w-10 rounded-lg bg-background flex items-center justify-center border">
                    <Image
                      src={selectedTemplate.icon}
                      alt={selectedTemplate.name}
                      width={24}
                      height={24}
                    />
                  </div>
                  <div>
                    <div className="font-medium">{selectedTemplate.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {selectedTemplate.description}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Base Image */}
            {selectedImage && (
              <div>
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-2">
                  <Box className="h-4 w-4" />
                  Base Image
                </div>
                <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                  <div className="h-10 w-10 rounded-lg bg-background flex items-center justify-center border">
                    <Image
                      src={selectedImage.icon}
                      alt={selectedImage.name}
                      width={24}
                      height={24}
                    />
                  </div>
                  <div>
                    <div className="font-medium">{selectedImage.name}</div>
                    <div
                      className="text-xs text-muted-foreground font-mono truncate max-w-[200px]"
                      title={selectedImage.image}
                    >
                      {selectedImage.image.split("/").pop()}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Selected Features */}
            {selectedFeatures.length > 0 && (
              <div>
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-2">
                  <Puzzle className="h-4 w-4" />
                  Features ({selectedFeatures.length})
                </div>
                <div className="space-y-2 max-h-40 overflow-auto">
                  {selectedFeatures.map((feature) => (
                    <div
                      key={feature.id}
                      className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg"
                    >
                      <Check className="h-4 w-4 text-primary shrink-0" />
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">
                          {feature.name}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {feature.description}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Fallback if no visual data */}
            {!selectedTemplate &&
              !selectedImage &&
              selectedFeatures.length === 0 && (
                <div className="text-sm text-muted-foreground text-center py-8">
                  Configuration details will appear here
                </div>
              )}
          </CardContent>
        </Card>
      </div>

      {/* Create Options */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Create DevContainer</CardTitle>
          <CardDescription>
            Choose how you want to create your development container
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="current" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="current" className="gap-2">
                <FileCode className="h-4 w-4" />
                Current Project
              </TabsTrigger>
              <TabsTrigger value="new" className="gap-2">
                <FolderPlus className="h-4 w-4" />
                New Project
              </TabsTrigger>
            </TabsList>

            <TabsContent value="current" className="space-y-4 pt-4">
              <p className="text-sm text-muted-foreground">
                Create a .devcontainer folder in your current workspace with
                this configuration.
              </p>
              <Button onClick={handleCreateInProject} className="w-full">
                <FileCode className="h-4 w-4 mr-2" />
                Create in Current Project
              </Button>
            </TabsContent>

            <TabsContent value="new" className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="projectName">Project Name</Label>
                <Input
                  id="projectName"
                  placeholder="my-new-project"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                />
              </div>
              <Button
                onClick={handleCreateNewProject}
                className="w-full"
                disabled={!projectName.trim()}
              >
                <FolderPlus className="h-4 w-4 mr-2" />
                Create New Project
              </Button>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
