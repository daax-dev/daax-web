"use client";

import { Package, Loader2, Shield, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { BaseImage } from "@/types/catalog";
import { BASE_CATEGORY_CONFIG } from "@/types/catalog";

interface ImageChooserProps {
  images: BaseImage[];
  loading: boolean;
  selected: { id: string; version: string } | null;
  onSelect: (selection: { id: string; version: string } | null) => void;
}

export function ImageChooser({
  images,
  loading,
  selected,
  onSelect,
}: ImageChooserProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (images.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Package className="h-12 w-12 mb-4" />
        <p>No base images available</p>
      </div>
    );
  }

  return (
    <div className="grid md:grid-cols-2 gap-3">
      {images.map((image) => {
        const isSelected = selected?.id === image.id;
        const latestVersion = image.versions[0]?.tag || "latest";

        return (
          <button
            key={image.id}
            onClick={() => {
              if (isSelected) {
                onSelect(null);
              } else {
                onSelect({ id: image.id, version: latestVersion });
              }
            }}
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
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                style={{ backgroundColor: `${image.color}20` }}
              >
                <Package className="h-5 w-5" style={{ color: image.color }} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium truncate">{image.name}</span>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-xs shrink-0",
                      BASE_CATEGORY_CONFIG[image.category].color,
                    )}
                  >
                    {BASE_CATEGORY_CONFIG[image.category].label}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                  {image.description}
                </p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Shield className="h-3 w-3" />
                  <span>{image.securityProfile.hardeningLevel}</span>
                  <span className="text-muted-foreground/50">•</span>
                  <span>{image.versions.length} versions</span>
                </div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
