"use client";

import { useState } from "react";
import { Info, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Feature } from "@/types/catalog";

interface FeatureChooserProps {
  features: Feature[];
  selected: string[];
  onSelect: (selected: string[]) => void;
  loading?: boolean;
}

// Simple icon mapping for features
function getFeatureIcon(featureId: string): string {
  const icons: Record<string, string> = {
    node: "🟢",
    python: "🐍",
    go: "🐹",
    rust: "🦀",
    java: "☕",
    dotnet: "🟣",
    "docker-in-docker": "🐳",
    "docker-outside-of-docker": "🐳",
    "kubectl-helm-minikube": "☸️",
    terraform: "🏗️",
    "aws-cli": "☁️",
    "azure-cli": "☁️",
    "github-cli": "🐙",
    git: "📦",
    "git-lfs": "📦",
    "common-utils": "🔧",
    sshd: "🔐",
  };
  return icons[featureId] || "📦";
}

export function FeatureChooser({
  features,
  selected,
  onSelect,
  loading,
}: FeatureChooserProps) {
  const [infoFeature, setInfoFeature] = useState<Feature | null>(null);

  const handleToggle = (featureId: string) => {
    if (selected.includes(featureId)) {
      onSelect(selected.filter((id) => id !== featureId));
    } else {
      onSelect([...selected, featureId]);
    }
  };

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {features.map((feature) => {
          const isSelected = selected.includes(feature.id);

          return (
            <div
              key={feature.id}
              className={cn(
                "relative flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-all",
                isSelected
                  ? "bg-secondary border-primary text-secondary-foreground"
                  : "bg-card border-border hover:border-primary/50",
              )}
              onClick={() => handleToggle(feature.id)}
            >
              {/* Icon */}
              <span className="text-2xl flex-shrink-0">
                {getFeatureIcon(feature.id)}
              </span>

              {/* Name */}
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{feature.id}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {feature.category}
                </div>
              </div>

              {/* Selection Check */}
              {isSelected && (
                <div className="absolute top-1 right-1 h-4 w-4 rounded-full bg-primary flex items-center justify-center">
                  <Check className="h-3 w-3 text-primary-foreground" />
                </div>
              )}

              {/* Info Button */}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 flex-shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  setInfoFeature(feature);
                }}
              >
                <Info className="h-4 w-4" />
              </Button>
            </div>
          );
        })}
      </div>

      {/* Info Dialog */}
      <Dialog open={!!infoFeature} onOpenChange={() => setInfoFeature(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="text-2xl">
                {infoFeature && getFeatureIcon(infoFeature.id)}
              </span>
              {infoFeature?.name}
            </DialogTitle>
            <DialogDescription>{infoFeature?.description}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <div className="text-sm font-medium mb-1">Source</div>
              <code className="text-xs bg-muted px-2 py-1 rounded break-all">
                {infoFeature?.registry}/{infoFeature?.repository}
              </code>
            </div>
            <div>
              <div className="text-sm font-medium mb-1">Category</div>
              <span className="text-xs bg-muted px-2 py-1 rounded">
                {infoFeature?.category}
              </span>
            </div>
            {infoFeature?.options && infoFeature.options.length > 0 && (
              <div>
                <div className="text-sm font-medium mb-1">Options</div>
                <div className="space-y-1">
                  {infoFeature.options.map((opt) => (
                    <div key={opt.name} className="text-xs">
                      <code className="bg-muted px-1 rounded">{opt.name}</code>
                      {opt.default && (
                        <span className="text-muted-foreground ml-1">
                          (default: {opt.default})
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
