"use client";

import { useState } from "react";
import { Package, Layers, Tag, ChevronRight, Loader2 } from "lucide-react";
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
import { useBases, useFeatures } from "@/hooks/use-catalog";
import { cn } from "@/lib/utils";
import type { BuildSpec } from "@/types/catalog";

type Step = "base" | "features" | "output";

interface BuildWizardProps {
  onComplete: (
    spec: Omit<BuildSpec, "id" | "createdAt" | "updatedAt">,
  ) => Promise<void>;
  onCancel: () => void;
}

export function BuildWizard({ onComplete, onCancel }: BuildWizardProps) {
  const { bases, loading: loadingBases } = useBases();
  const { features, loading: loadingFeatures } = useFeatures();

  const [step, setStep] = useState<Step>("base");
  const [selectedBase, setSelectedBase] = useState<{
    id: string;
    version: string;
  } | null>(null);
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [registry, setRegistry] = useState("ghcr.io");
  const [repository, setRepository] = useState("");
  const [tags, setTags] = useState("latest");
  const [submitting, setSubmitting] = useState(false);

  const steps: { id: Step; label: string; icon: React.ElementType }[] = [
    { id: "base", label: "Base Image", icon: Package },
    { id: "features", label: "Features", icon: Layers },
    { id: "output", label: "Output", icon: Tag },
  ];

  const canProceed = () => {
    switch (step) {
      case "base":
        return selectedBase !== null;
      case "features":
        return true;
      case "output":
        return name.trim() !== "" && repository.trim() !== "";
      default:
        return false;
    }
  };

  const handleNext = () => {
    if (step === "base") setStep("features");
    else if (step === "features") setStep("output");
  };

  const handleBack = () => {
    if (step === "features") setStep("base");
    else if (step === "output") setStep("features");
  };

  const handleSubmit = async () => {
    if (!selectedBase) return;

    setSubmitting(true);
    try {
      const spec: Omit<BuildSpec, "id" | "createdAt" | "updatedAt"> = {
        name,
        description: description || undefined,
        base: {
          imageId: selectedBase.id,
          version: selectedBase.version,
        },
        features: selectedFeatures.map((featureId) => ({
          featureId,
          version: "latest",
          options: {},
        })),
        output: {
          registry,
          repository,
          tags: tags.split(",").map((t) => t.trim()),
        },
        createdBy: "daax",
      };

      await onComplete(spec);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
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
            {step === "base" && "Select Base Image"}
            {step === "features" && "Add Features"}
            {step === "output" && "Configure Output"}
          </CardTitle>
          <CardDescription>
            {step === "base" && "Choose a hardened base image"}
            {step === "features" && "Optionally add development features"}
            {step === "output" && "Configure the output image"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step === "base" && (
            <div className="space-y-3">
              {loadingBases ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : (
                bases.map((base) => (
                  <button
                    key={base.id}
                    onClick={() =>
                      setSelectedBase({
                        id: base.id,
                        version: base.versions[0]?.tag || "latest",
                      })
                    }
                    className={cn(
                      "w-full p-4 rounded-lg border text-left transition-colors",
                      selectedBase?.id === base.id
                        ? "border-primary bg-primary/5"
                        : "hover:border-muted-foreground/50",
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <Package
                        className="h-5 w-5"
                        style={{ color: base.color }}
                      />
                      <div>
                        <div className="font-medium">{base.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {base.description}
                        </div>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}

          {step === "features" && (
            <div className="space-y-3">
              {loadingFeatures ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : (
                features.map((feature) => (
                  <button
                    key={feature.id}
                    onClick={() => {
                      setSelectedFeatures((prev) =>
                        prev.includes(feature.id)
                          ? prev.filter((f) => f !== feature.id)
                          : [...prev, feature.id],
                      );
                    }}
                    className={cn(
                      "w-full p-4 rounded-lg border text-left transition-colors",
                      selectedFeatures.includes(feature.id)
                        ? "border-primary bg-primary/5"
                        : "hover:border-muted-foreground/50",
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <Layers className="h-5 w-5" />
                      <div className="flex-1">
                        <div className="font-medium">{feature.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {feature.description}
                        </div>
                      </div>
                      {selectedFeatures.includes(feature.id) && (
                        <Badge>Selected</Badge>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          )}

          {step === "output" && (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name">Build Name *</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="my-dev-image"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Input
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Optional description"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="registry">Registry</Label>
                  <Input
                    id="registry"
                    value={registry}
                    onChange={(e) => setRegistry(e.target.value)}
                    placeholder="ghcr.io"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="repository">Repository *</Label>
                  <Input
                    id="repository"
                    value={repository}
                    onChange={(e) => setRepository(e.target.value)}
                    placeholder="user/image-name"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="tags">Tags (comma-separated)</Label>
                <Input
                  id="tags"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="latest, v1.0.0"
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={step === "base" ? onCancel : handleBack}
        >
          {step === "base" ? "Cancel" : "Back"}
        </Button>
        {step !== "output" ? (
          <Button onClick={handleNext} disabled={!canProceed()}>
            Next
            <ChevronRight className="h-4 w-4 ml-2" />
          </Button>
        ) : (
          <Button onClick={handleSubmit} disabled={!canProceed() || submitting}>
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Create Build
          </Button>
        )}
      </div>
    </div>
  );
}
