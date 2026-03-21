"use client";

import { useState, useEffect } from "react";
import {
  Package,
  Layers,
  Tag,
  ChevronRight,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Download,
  GitBranch,
  Github,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ImageChooser } from "@/components/catalog/image-chooser";
import { FeatureChooser } from "@/components/catalog/feature-chooser";
import { useBases, useFeatures } from "@/hooks/use-catalog";
import { cn } from "@/lib/utils";
import type {
  DevContainerGeneratorInput,
  FeatureSelectionWithMetadata,
} from "@/lib/devcontainer/types";

type Step = "image" | "features" | "output";

interface RepoStatus {
  exists: boolean;
  initialized: boolean;
  templateCount: number;
  templates?: string[];
  repo?: string;
  error?: string;
}

interface WorkflowStatus {
  hasWorkflows: boolean;
  configured: boolean;
  files?: {
    build: boolean;
    release: boolean;
  };
}

export default function CreateDevContainerPage() {
  const { bases, loading: loadingBases } = useBases();
  const { features, loading: loadingFeatures } = useFeatures();

  const [step, setStep] = useState<Step>("image");
  const [selectedImage, setSelectedImage] = useState<{
    id: string;
    version: string;
  } | null>(null);
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [pushSuccess, setPushSuccess] = useState(false);
  const [downloadReady, setDownloadReady] = useState<string | null>(null);

  // GitHub repo status for pushing base templates
  const [repoStatus, setRepoStatus] = useState<RepoStatus | null>(null);
  const [repoStatusLoading, setRepoStatusLoading] = useState(true);
  const [workflowStatus, setWorkflowStatus] = useState<WorkflowStatus | null>(
    null,
  );
  const [initializingWorkflows, setInitializingWorkflows] = useState(false);

  useEffect(() => {
    async function checkRepo() {
      try {
        const [statusRes, workflowRes] = await Promise.all([
          fetch("/api/devcontainer?action=status"),
          fetch("/api/devcontainer?action=check-workflows"),
        ]);
        if (statusRes.ok) {
          setRepoStatus(await statusRes.json());
        }
        if (workflowRes.ok) {
          setWorkflowStatus(await workflowRes.json());
        }
      } catch (error) {
        console.error("Failed to check repo status:", error);
      } finally {
        setRepoStatusLoading(false);
      }
    }
    checkRepo();
  }, []);

  const handleInitWorkflows = async () => {
    setInitializingWorkflows(true);
    try {
      const res = await fetch("/api/devcontainer?action=init-workflows");
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setWorkflowStatus({
            hasWorkflows: true,
            configured: true,
            files: { build: true, release: true },
          });
        } else {
          alert(`Failed to initialize workflows: ${data.message}`);
        }
      } else {
        const error = await res.json();
        alert(error.error || "Failed to initialize workflows");
      }
    } catch (error) {
      console.error("Failed to initialize workflows:", error);
      alert("Failed to initialize workflows");
    } finally {
      setInitializingWorkflows(false);
    }
  };

  const steps: { id: Step; label: string; icon: React.ElementType }[] = [
    { id: "image", label: "Base Image", icon: Package },
    { id: "features", label: "Features", icon: Layers },
    { id: "output", label: "Generate", icon: Tag },
  ];

  const canProceed = () => {
    switch (step) {
      case "image":
        return selectedImage !== null;
      case "features":
        return true;
      case "output":
        return name.trim() !== "";
      default:
        return false;
    }
  };

  const handleNext = () => {
    if (step === "image") setStep("features");
    else if (step === "features") setStep("output");
  };

  const handleBack = () => {
    if (step === "features") setStep("image");
    else if (step === "output") setStep("features");
  };

  const buildGeneratorInput = (): DevContainerGeneratorInput | null => {
    if (!selectedImage) return null;
    const baseImage = bases.find((b) => b.id === selectedImage.id);
    if (!baseImage) return null;
    const selectedFeatureObjects = features.filter((f) =>
      selectedFeatures.includes(f.id),
    );

    return {
      name: name.toLowerCase().replace(/\s+/g, "-"),
      displayName: name,
      description: `DevContainer with ${baseImage.name}${selectedFeatures.length > 0 ? ` and ${selectedFeatures.length} features` : ""}`,
      base: {
        image: baseImage,
        version: selectedImage.version,
      },
      features: selectedFeatureObjects.map((f) => ({
        featureId: f.id,
        version: f.versions[0]?.tag || "latest",
        options: {},
        feature: f,
      })) as FeatureSelectionWithMetadata[],
      version: "1.0.0",
      author: { name: "Daax" },
    };
  };

  // Download devcontainer.json for user's own project
  const handleDownload = async () => {
    const input = buildGeneratorInput();
    if (!input) return;

    setDownloading(true);
    try {
      const res = await fetch("/api/devcontainer?action=generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to generate");
      }

      const data = await res.json();

      // Create downloadable JSON
      const blob = new Blob([JSON.stringify(data.devcontainer, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "devcontainer.json";
      a.click();
      URL.revokeObjectURL(url);

      setDownloadReady(JSON.stringify(data.devcontainer, null, 2));
    } catch (error) {
      console.error("Failed to generate:", error);
      alert(error instanceof Error ? error.message : "Failed to generate");
    } finally {
      setDownloading(false);
    }
  };

  // Push to dev-containers repo (for base templates)
  const handlePushToGitHub = async () => {
    const input = buildGeneratorInput();
    if (!input) return;

    setCreating(true);
    setPushSuccess(false);
    try {
      const res = await fetch("/api/devcontainer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to push");
      }

      setPushSuccess(true);
    } catch (error) {
      console.error("Failed to push:", error);
      alert(error instanceof Error ? error.message : "Failed to push");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Create DevContainer</h1>
        <p className="text-muted-foreground">
          Choose a hardened base image, add features, and get your
          devcontainer.json
        </p>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center gap-2">
        {steps.map((s, i) => {
          const Icon = s.icon;
          const isActive = s.id === step;
          const isPast = steps.findIndex((x) => x.id === step) > i;

          return (
            <div key={s.id} className="flex items-center">
              <button
                onClick={() => {
                  const currentIndex = steps.findIndex((x) => x.id === step);
                  if (i <= currentIndex) setStep(s.id);
                }}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg transition-colors",
                  isActive && "bg-primary text-primary-foreground",
                  isPast && "bg-muted text-foreground",
                  !isActive && !isPast && "bg-muted/50 text-muted-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="text-sm font-medium">{s.label}</span>
              </button>
              {i < steps.length - 1 && (
                <ChevronRight className="h-4 w-4 mx-2 text-muted-foreground" />
              )}
            </div>
          );
        })}
      </div>

      {/* Step Content */}
      <Card>
        <CardHeader>
          <CardTitle>
            {step === "image" && "Select Base Image"}
            {step === "features" && "Add Features"}
            {step === "output" && "Generate DevContainer"}
          </CardTitle>
          <CardDescription>
            {step === "image" &&
              "Choose a hardened container image as your base"}
            {step === "features" && "Optionally add development features"}
            {step === "output" &&
              "Name your config and download or push to GitHub"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step === "image" && (
            <ImageChooser
              images={bases}
              loading={loadingBases}
              selected={selectedImage}
              onSelect={setSelectedImage}
            />
          )}

          {step === "features" && (
            <FeatureChooser
              features={features}
              loading={loadingFeatures}
              selected={selectedFeatures}
              onSelect={setSelectedFeatures}
            />
          )}

          {step === "output" && (
            <div className="space-y-6">
              {/* Name */}
              <div className="space-y-2 max-w-md">
                <Label htmlFor="name">DevContainer Name</Label>
                <Input
                  id="name"
                  placeholder="my-python-project"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  This will be used in the devcontainer.json name field
                </p>
              </div>

              {/* Summary */}
              {selectedImage && (
                <div className="p-4 rounded-lg border bg-muted/30">
                  <h4 className="font-medium mb-2">Configuration Summary</h4>
                  <div className="space-y-1 text-sm">
                    <div>
                      <span className="text-muted-foreground">Base: </span>
                      {bases.find((b) => b.id === selectedImage.id)?.name ||
                        selectedImage.id}
                      <Badge variant="outline" className="ml-2">
                        {selectedImage.version}
                      </Badge>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Features: </span>
                      {selectedFeatures.length === 0
                        ? "None"
                        : selectedFeatures.length}
                    </div>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="space-y-4 pt-4 border-t">
                {/* Download for your project */}
                <div className="p-4 rounded-lg border">
                  <div className="flex items-start gap-3">
                    <Download className="h-5 w-5 mt-0.5 text-primary" />
                    <div className="flex-1">
                      <h4 className="font-medium">Download for Your Project</h4>
                      <p className="text-sm text-muted-foreground mb-3">
                        Get a devcontainer.json to add to your own repo. Place
                        it in{" "}
                        <code className="bg-muted px-1 rounded">
                          .devcontainer/
                        </code>{" "}
                        folder.
                      </p>
                      <Button
                        onClick={handleDownload}
                        disabled={!name || downloading}
                      >
                        {downloading ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4 mr-2" />
                        )}
                        Download devcontainer.json
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Push to dev-containers (for maintainers) */}
                <div className="p-4 rounded-lg border">
                  <div className="flex items-start gap-3">
                    <Github className="h-5 w-5 mt-0.5" />
                    <div className="flex-1">
                      <h4 className="font-medium">
                        Push to Base Templates Repo
                      </h4>
                      <p className="text-sm text-muted-foreground mb-3">
                        Add this as a reusable template in the dev-containers
                        repo. For maintainers building the base image catalog.
                      </p>

                      {repoStatusLoading ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Checking GitHub...
                        </div>
                      ) : repoStatus?.error ? (
                        <div className="flex items-center gap-2 text-sm text-yellow-600">
                          <AlertCircle className="h-4 w-4" />
                          {repoStatus.error}
                        </div>
                      ) : repoStatus?.exists ? (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 text-sm text-green-600">
                            <CheckCircle2 className="h-4 w-4" />
                            Connected to {repoStatus.repo}
                          </div>

                          {/* GitHub Actions Workflow Status */}
                          {workflowStatus && !workflowStatus.hasWorkflows && (
                            <div className="p-3 rounded-md bg-yellow-500/10 border border-yellow-500/20">
                              <div className="flex items-start gap-2">
                                <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5" />
                                <div className="flex-1 space-y-2">
                                  <p className="text-sm text-yellow-700 dark:text-yellow-400">
                                    GitHub Actions not configured. Templates
                                    won&apos;t build automatically.
                                  </p>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={handleInitWorkflows}
                                    disabled={initializingWorkflows}
                                  >
                                    {initializingWorkflows ? (
                                      <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                                    ) : (
                                      <GitBranch className="h-3 w-3 mr-2" />
                                    )}
                                    Initialize Workflows
                                  </Button>
                                </div>
                              </div>
                            </div>
                          )}

                          {workflowStatus?.hasWorkflows && (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <CheckCircle2 className="h-3 w-3 text-green-500" />
                              GitHub Actions configured - templates build
                              automatically
                            </div>
                          )}

                          <Button
                            onClick={handlePushToGitHub}
                            disabled={!name || creating}
                            variant="outline"
                          >
                            {creating ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <GitBranch className="h-4 w-4 mr-2" />
                            )}
                            Push to dev-containers
                          </Button>
                          {pushSuccess && (
                            <div className="flex items-center gap-2 text-sm text-green-600">
                              <CheckCircle2 className="h-4 w-4" />
                              Pushed successfully!
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-sm text-muted-foreground">
                          Configure GitHub in Settings to push templates
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Show generated JSON preview */}
              {downloadReady && (
                <div className="space-y-2">
                  <Label>Generated devcontainer.json</Label>
                  <pre className="p-4 rounded-lg border bg-muted/30 text-xs overflow-auto max-h-64">
                    {downloadReady}
                  </pre>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={handleBack}
          disabled={step === "image"}
        >
          Back
        </Button>
        {step !== "output" && (
          <Button onClick={handleNext} disabled={!canProceed()}>
            Next
            <ChevronRight className="h-4 w-4 ml-2" />
          </Button>
        )}
      </div>
    </div>
  );
}
