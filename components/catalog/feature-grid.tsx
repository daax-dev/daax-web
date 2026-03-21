"use client";

import { useState, useMemo } from "react";
import { Loader2, AlertCircle, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FeatureCard } from "./feature-card";
import { useFeatures } from "@/hooks/use-catalog";
import type {
  Feature,
  FeatureCategory,
  FeatureSelection,
} from "@/types/catalog";
import { FEATURE_CATEGORY_CONFIG } from "@/types/catalog";

interface FeatureGridProps {
  baseId?: string;
  selectedFeatures?: FeatureSelection[];
  onAddFeature?: (selection: FeatureSelection) => void;
  onRemoveFeature?: (featureId: string) => void;
  onUpdateFeatureOptions?: (
    featureId: string,
    options: Record<string, string | boolean>,
  ) => void;
  compact?: boolean;
}

export function FeatureGrid({
  baseId,
  selectedFeatures = [],
  onAddFeature,
  onRemoveFeature,
  onUpdateFeatureOptions,
  compact,
}: FeatureGridProps) {
  const { features, categories, loading, error, refetch } = useFeatures({
    baseId,
  });
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<"all" | FeatureCategory>(
    "all",
  );

  const selectedIds = useMemo(
    () => new Set(selectedFeatures.map((f) => f.featureId)),
    [selectedFeatures],
  );

  const filteredFeatures = useMemo(() => {
    let result = features;

    // Filter by category
    if (categoryFilter !== "all") {
      result = result.filter((f) => f.category === categoryFilter);
    }

    // Filter by search
    if (search) {
      const searchLower = search.toLowerCase();
      result = result.filter(
        (f) =>
          f.name.toLowerCase().includes(searchLower) ||
          f.description.toLowerCase().includes(searchLower) ||
          f.id.toLowerCase().includes(searchLower) ||
          f.tags.some((t) => t.toLowerCase().includes(searchLower)),
      );
    }

    return result;
  }, [features, categoryFilter, search]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <AlertCircle className="h-12 w-12 mb-4 text-destructive" />
        <p className="text-destructive">{error}</p>
        <button onClick={refetch} className="mt-4 text-sm underline">
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search features..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Tabs
          value={categoryFilter}
          onValueChange={(v) => setCategoryFilter(v as typeof categoryFilter)}
        >
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="all" className="text-xs">
              All
            </TabsTrigger>
            {categories.map((cat) => (
              <TabsTrigger key={cat} value={cat} className="text-xs">
                {FEATURE_CATEGORY_CONFIG[cat]?.label || cat}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* Grid */}
      {filteredFeatures.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          No features found
        </div>
      ) : (
        <div
          className={
            compact
              ? "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3"
              : "space-y-4"
          }
        >
          {filteredFeatures.map((feature) => {
            const isSelected = selectedIds.has(feature.id);
            const selection = selectedFeatures.find(
              (f) => f.featureId === feature.id,
            );

            return (
              <FeatureCard
                key={feature.id}
                feature={feature}
                selected={isSelected}
                selection={selection}
                onAdd={onAddFeature}
                onRemove={() => onRemoveFeature?.(feature.id)}
                onUpdateOptions={(options) =>
                  onUpdateFeatureOptions?.(feature.id, options)
                }
                compact={compact}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
