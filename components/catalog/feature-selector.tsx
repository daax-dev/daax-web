"use client";

import { useState } from "react";
import { X, Settings2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FeatureGrid } from "./feature-grid";
import type { FeatureSelection, Feature } from "@/types/catalog";

interface FeatureSelectorProps {
  baseId?: string;
  selectedFeatures: FeatureSelection[];
  onFeaturesChange: (features: FeatureSelection[]) => void;
  availableFeatures?: Feature[];
}

export function FeatureSelector({
  baseId,
  selectedFeatures,
  onFeaturesChange,
}: FeatureSelectorProps) {
  const handleAddFeature = (selection: FeatureSelection) => {
    // Check for conflicts
    const existingIds = selectedFeatures.map((f) => f.featureId);
    // For now, just add if not already selected
    if (!existingIds.includes(selection.featureId)) {
      onFeaturesChange([...selectedFeatures, selection]);
    }
  };

  const handleRemoveFeature = (featureId: string) => {
    onFeaturesChange(selectedFeatures.filter((f) => f.featureId !== featureId));
  };

  const handleUpdateOptions = (
    featureId: string,
    options: Record<string, string | boolean>,
  ) => {
    onFeaturesChange(
      selectedFeatures.map((f) =>
        f.featureId === featureId ? { ...f, options } : f,
      ),
    );
  };

  return (
    <div className="space-y-6">
      {/* Selected Features Summary */}
      {selectedFeatures.length > 0 && (
        <div className="p-4 bg-muted/50 rounded-lg">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium">
              Selected Features ({selectedFeatures.length})
            </h4>
          </div>
          <div className="flex flex-wrap gap-2">
            {selectedFeatures.map((selection) => (
              <Badge
                key={selection.featureId}
                variant="secondary"
                className="pl-2 pr-1 py-1 gap-1"
              >
                {selection.featureId}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-4 w-4 hover:bg-destructive/20"
                  onClick={() => handleRemoveFeature(selection.featureId)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Feature Grid */}
      <FeatureGrid
        baseId={baseId}
        selectedFeatures={selectedFeatures}
        onAddFeature={handleAddFeature}
        onRemoveFeature={handleRemoveFeature}
        onUpdateFeatureOptions={handleUpdateOptions}
      />
    </div>
  );
}
