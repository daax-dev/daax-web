"use client";

import { Layers, Loader2, AlertCircle, Clock } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useFeatures } from "@/hooks/use-catalog";
import type { Feature } from "@/types/catalog";
import { FEATURE_CATEGORY_CONFIG } from "@/types/catalog";

function FeatureCard({ feature }: { feature: Feature }) {
  const latestVersion = feature.versions[0];

  return (
    <Card className="hover:border-primary/50 transition-colors">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-muted flex items-center justify-center">
              <Layers className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <CardTitle className="text-base">{feature.name}</CardTitle>
              <CardDescription className="text-xs">
                {feature.registry}/{feature.repository}
              </CardDescription>
            </div>
          </div>
          <Badge
            variant="outline"
            className={FEATURE_CATEGORY_CONFIG[feature.category]?.color}
          >
            {FEATURE_CATEGORY_CONFIG[feature.category]?.label ||
              feature.category}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-3">
          {feature.description}
        </p>

        {/* Tags */}
        <div className="flex flex-wrap gap-1 mb-3">
          {feature.tags.slice(0, 3).map((tag) => (
            <Badge key={tag} variant="secondary" className="text-xs">
              {tag}
            </Badge>
          ))}
          {feature.tags.length > 3 && (
            <Badge variant="secondary" className="text-xs">
              +{feature.tags.length - 3}
            </Badge>
          )}
        </div>

        {/* Install time and version info */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {feature.installTime}
          </span>
          {latestVersion && <span>v{latestVersion.tag}</span>}
        </div>
      </CardContent>
    </Card>
  );
}

export function FeatureGrid() {
  const { features, loading, error } = useFeatures();

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
      </div>
    );
  }

  if (features.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Layers className="h-12 w-12 mb-4" />
        <p>No features found</p>
      </div>
    );
  }

  return (
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
      {features.map((feature) => (
        <FeatureCard key={feature.id} feature={feature} />
      ))}
    </div>
  );
}
