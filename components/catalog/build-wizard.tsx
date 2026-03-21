"use client";

import { useState } from "react";
import {
  ChevronRight,
  ChevronLeft,
  Check,
  Package,
  Layers,
  Settings,
  Tag,
  Eye,
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
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { BaseGrid } from "./base-grid";
import { FeatureSelector } from "./feature-selector";
import { BuildPreview } from "./build-preview";
import type { BaseImage, FeatureSelection, BuildSpec } from "@/types/catalog";

interface BuildWizardProps {
  onComplete: (spec: Omit<BuildSpec, "id" | "createdAt" | "updatedAt">) => void;
  onCancel: () => void;
  initialSpec?: Partial<BuildSpec>;
}

type WizardStep = "base" | "features" | "customize" | "output" | "review";

const STEPS: { id: WizardStep; label: string; icon: typeof Package }[] = [
  { id: "base", label: "Select Base", icon: Package },
  { id: "features", label: "Add Features", icon: Layers },
  { id: "customize", label: "Customize", icon: Settings },
  { id: "output", label: "Output", icon: Tag },
  { id: "review", label: "Review", icon: Eye },
];

export function BuildWizard({
  onComplete,
  onCancel,
  initialSpec,
}: BuildWizardProps) {
  const [step, setStep] = useState<WizardStep>("base");
  const [name, setName] = useState(initialSpec?.name || "");
  const [description, setDescription] = useState(
    initialSpec?.description || "",
  );
  const [selectedBase, setSelectedBase] = useState<{
    imageId: string;
    version: string;
  } | null>(initialSpec?.base || null);
  const [selectedBaseImage, setSelectedBaseImage] = useState<BaseImage | null>(
    null,
  );
  const [features, setFeatures] = useState<FeatureSelection[]>(
    initialSpec?.features || [],
  );
  const [customizations, setCustomizations] = useState(
    initialSpec?.customizations || { env: {}, labels: {}, buildArgs: {} },
  );
  const [output, setOutput] = useState(
    initialSpec?.output || {
      registry: "ghcr.io",
      repository: "",
      tags: ["latest"],
    },
  );

  const stepIndex = STEPS.findIndex((s) => s.id === step);

  const canProceed = () => {
    switch (step) {
      case "base":
        return selectedBase !== null;
      case "features":
        return true; // Features are optional
      case "customize":
        return true; // Customizations are optional
      case "output":
        return name.trim() !== "" && output.repository.trim() !== "";
      case "review":
        return true;
      default:
        return false;
    }
  };

  const handleNext = () => {
    const nextIndex = stepIndex + 1;
    if (nextIndex < STEPS.length) {
      setStep(STEPS[nextIndex].id);
    }
  };

  const handleBack = () => {
    const prevIndex = stepIndex - 1;
    if (prevIndex >= 0) {
      setStep(STEPS[prevIndex].id);
    }
  };

  const handleComplete = () => {
    if (!selectedBase) return;

    onComplete({
      name,
      description: description || undefined,
      base: selectedBase,
      features,
      customizations:
        Object.keys(customizations.env || {}).length > 0 ||
        Object.keys(customizations.labels || {}).length > 0 ||
        Object.keys(customizations.buildArgs || {}).length > 0
          ? customizations
          : undefined,
      output,
      createdBy: "user",
    });
  };

  const handleBaseSelect = (base: BaseImage, version: string) => {
    setSelectedBase({ imageId: base.id, version });
    setSelectedBaseImage(base);
  };

  return (
    <div className="space-y-6">
      {/* Step Indicator */}
      <div className="flex items-center justify-center gap-2">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const isCurrent = s.id === step;
          const isComplete = i < stepIndex;

          return (
            <div key={s.id} className="flex items-center">
              <button
                onClick={() => i <= stepIndex && setStep(s.id)}
                disabled={i > stepIndex}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg transition-colors",
                  isCurrent && "bg-primary text-primary-foreground",
                  isComplete && "bg-primary/20 text-primary",
                  !isCurrent && !isComplete && "text-muted-foreground",
                )}
              >
                {isComplete ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Icon className="h-4 w-4" />
                )}
                <span className="hidden sm:inline text-sm font-medium">
                  {s.label}
                </span>
              </button>
              {i < STEPS.length - 1 && (
                <ChevronRight className="h-4 w-4 mx-2 text-muted-foreground" />
              )}
            </div>
          );
        })}
      </div>

      {/* Step Content */}
      <Card>
        <CardHeader>
          <CardTitle>{STEPS[stepIndex].label}</CardTitle>
          <CardDescription>
            {step === "base" &&
              "Choose a hardened base image for your container"}
            {step === "features" &&
              "Add devcontainer features to customize your image"}
            {step === "customize" &&
              "Add environment variables, labels, and build arguments"}
            {step === "output" && "Configure the output image name and tags"}
            {step === "review" &&
              "Review your build configuration before creating"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step === "base" && (
            <BaseGrid
              onSelect={handleBaseSelect}
              selectedBaseId={selectedBase?.imageId}
              compact
            />
          )}

          {step === "features" && (
            <FeatureSelector
              baseId={selectedBase?.imageId}
              selectedFeatures={features}
              onFeaturesChange={setFeatures}
            />
          )}

          {step === "customize" && (
            <div className="space-y-6">
              {/* Environment Variables */}
              <div className="space-y-3">
                <Label>Environment Variables</Label>
                <Textarea
                  placeholder="KEY=value&#10;ANOTHER_KEY=another_value"
                  value={Object.entries(customizations.env || {})
                    .map(([k, v]) => `${k}=${v}`)
                    .join("\n")}
                  onChange={(e) => {
                    const env: Record<string, string> = {};
                    e.target.value.split("\n").forEach((line) => {
                      const [key, ...valueParts] = line.split("=");
                      if (key && valueParts.length > 0) {
                        env[key.trim()] = valueParts.join("=").trim();
                      }
                    });
                    setCustomizations({ ...customizations, env });
                  }}
                  rows={4}
                />
              </div>

              {/* Labels */}
              <div className="space-y-3">
                <Label>OCI Labels</Label>
                <Textarea
                  placeholder="org.opencontainers.image.title=My Image&#10;com.example.version=1.0"
                  value={Object.entries(customizations.labels || {})
                    .map(([k, v]) => `${k}=${v}`)
                    .join("\n")}
                  onChange={(e) => {
                    const labels: Record<string, string> = {};
                    e.target.value.split("\n").forEach((line) => {
                      const [key, ...valueParts] = line.split("=");
                      if (key && valueParts.length > 0) {
                        labels[key.trim()] = valueParts.join("=").trim();
                      }
                    });
                    setCustomizations({ ...customizations, labels });
                  }}
                  rows={4}
                />
              </div>
            </div>
          )}

          {step === "output" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Build Name *</Label>
                <Input
                  id="name"
                  placeholder="my-dev-environment"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="A custom development environment with..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="registry">Registry</Label>
                <Input
                  id="registry"
                  placeholder="ghcr.io"
                  value={output.registry}
                  onChange={(e) =>
                    setOutput({ ...output, registry: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="repository">Repository *</Label>
                <Input
                  id="repository"
                  placeholder="myorg/my-dev-image"
                  value={output.repository}
                  onChange={(e) =>
                    setOutput({ ...output, repository: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="tags">Tags (comma-separated)</Label>
                <Input
                  id="tags"
                  placeholder="latest, 1.0.0"
                  value={output.tags.join(", ")}
                  onChange={(e) =>
                    setOutput({
                      ...output,
                      tags: e.target.value
                        .split(",")
                        .map((t) => t.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </div>
            </div>
          )}

          {step === "review" && selectedBase && (
            <BuildPreview
              spec={{
                name,
                description,
                base: selectedBase,
                features,
                customizations,
                output,
                createdBy: "user",
              }}
              baseImage={selectedBaseImage}
            />
          )}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={stepIndex === 0 ? onCancel : handleBack}
        >
          {stepIndex === 0 ? (
            "Cancel"
          ) : (
            <>
              <ChevronLeft className="h-4 w-4 mr-1" />
              Back
            </>
          )}
        </Button>

        {step === "review" ? (
          <Button onClick={handleComplete}>Create Build Spec</Button>
        ) : (
          <Button onClick={handleNext} disabled={!canProceed()}>
            Next
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        )}
      </div>
    </div>
  );
}
