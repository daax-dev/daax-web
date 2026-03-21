"use client";

import { Layers } from "lucide-react";
import { FeatureGrid } from "@/components/catalog";

export default function FeaturesPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <Layers className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Devcontainer Features</h1>
          <p className="text-muted-foreground">
            Composable features to customize your development containers
          </p>
        </div>
      </div>

      {/* Features Grid */}
      <FeatureGrid />
    </div>
  );
}
