"use client";

import { Layers, Loader2, Check, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Feature } from "@/types/catalog";
import { FEATURE_CATEGORY_CONFIG } from "@/types/catalog";

interface FeatureChooserProps {
  features: Feature[];
  loading: boolean;
  selected: string[];
  onSelect: (selected: string[]) => void;
}

export function FeatureChooser({
  features,
  loading,
  selected,
  onSelect,
}: FeatureChooserProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (features.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Layers className="h-12 w-12 mb-4" />
        <p>No features available</p>
      </div>
    );
  }

  const toggleFeature = (featureId: string) => {
    if (selected.includes(featureId)) {
      onSelect(selected.filter((id) => id !== featureId));
    } else {
      onSelect([...selected, featureId]);
    }
  };

  return (
    <div className="space-y-4">
      {/* Selected count */}
      {selected.length > 0 && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Check className="h-4 w-4 text-primary" />
          <span>
            {selected.length} feature{selected.length !== 1 ? "s" : ""} selected
          </span>
        </div>
      )}

      {/* Feature grid */}
      <div className="grid md:grid-cols-2 gap-3">
        {features.map((feature) => {
          const isSelected = selected.includes(feature.id);
          const categoryConfig = FEATURE_CATEGORY_CONFIG[feature.category];

          return (
            <button
              key={feature.id}
              onClick={() => toggleFeature(feature.id)}
              className={cn(
                "relative p-4 rounded-lg border text-left transition-all",
                isSelected
                  ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                  : "hover:border-muted-foreground/50",
              )}
            >
              {/* Selection indicator */}
              {isSelected && (
                <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                  <Check className="h-4 w-4 text-primary-foreground" />
                </div>
              )}

              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <Layers className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1 pr-6">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium truncate">{feature.name}</span>
                    {categoryConfig && (
                      <Badge
                        variant="outline"
                        className={cn("text-xs shrink-0", categoryConfig.color)}
                      >
                        {categoryConfig.label}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                    {feature.description}
                  </p>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span>{feature.installTime}</span>
                    </div>
                    {feature.tags.length > 0 && (
                      <>
                        <span className="text-muted-foreground/50">•</span>
                        <div className="flex gap-1">
                          {feature.tags.slice(0, 2).map((tag) => (
                            <Badge
                              key={tag}
                              variant="secondary"
                              className="text-xs"
                            >
                              {tag}
                            </Badge>
                          ))}
                          {feature.tags.length > 2 && (
                            <Badge variant="secondary" className="text-xs">
                              +{feature.tags.length - 2}
                            </Badge>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
