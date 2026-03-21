"use client";

import { Package } from "lucide-react";
import { BaseGrid } from "@/components/provenance";

export default function BasesPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <Package className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Base Images</h1>
          <p className="text-muted-foreground">
            Hardened base images from Docker Hub Hardened Images (DHI)
          </p>
        </div>
      </div>

      {/* Base Images Grid */}
      <BaseGrid />
    </div>
  );
}
