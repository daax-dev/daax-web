"use client";

import { useState } from "react";
import { Info, ChevronDown, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { BaseImage } from "@/types/catalog";
import { SBOMButton } from "./sbom-viewer";

interface ImageChooserProps {
  images: BaseImage[];
  selected: { id: string; version: string } | null;
  onSelect: (selection: { id: string; version: string } | null) => void;
  loading?: boolean;
}

// Simple icon mapping for base images
function getImageIcon(imageId: string): string {
  const icons: Record<string, string> = {
    "base-debian": "🌀",
    "base-ubuntu": "🟠",
    "base-alpine": "🏔️",
    "base-ubi": "🎩",
    "base-rocky": "🪨",
    "base-amazon": "📦",
    docker: "🐳",
  };
  return icons[imageId] || "📦";
}

export function ImageChooser({
  images,
  selected,
  onSelect,
  loading,
}: ImageChooserProps) {
  const [infoImage, setInfoImage] = useState<BaseImage | null>(null);
  const [versions, setVersions] = useState<Record<string, string>>({});

  const getSelectedVersion = (imageId: string, image: BaseImage) => {
    return versions[imageId] || image.versions[0]?.tag || "latest";
  };

  const handleSelect = (image: BaseImage) => {
    const version = getSelectedVersion(image.id, image);
    if (selected?.id === image.id) {
      onSelect(null); // Deselect
    } else {
      onSelect({ id: image.id, version });
    }
  };

  const handleVersionChange = (imageId: string, version: string) => {
    setVersions((prev) => ({ ...prev, [imageId]: version }));
    if (selected?.id === imageId) {
      onSelect({ id: imageId, version });
    }
  };

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {images.map((image) => {
          const isSelected = selected?.id === image.id;
          const currentVersion = getSelectedVersion(image.id, image);

          return (
            <div
              key={image.id}
              className={cn(
                "relative flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-all",
                isSelected
                  ? "bg-primary border-primary text-primary-foreground"
                  : "bg-card border-border hover:border-primary/50",
              )}
              onClick={() => handleSelect(image)}
            >
              {/* Icon */}
              <span className="text-2xl flex-shrink-0">
                {getImageIcon(image.id)}
              </span>

              {/* Name & Version */}
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{image.id}</div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className={cn(
                        "flex items-center gap-1 text-xs",
                        isSelected
                          ? "text-primary-foreground/80"
                          : "text-muted-foreground",
                      )}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {currentVersion}
                      <ChevronDown className="h-3 w-3" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {image.versions.map((v) => (
                      <DropdownMenuItem
                        key={v.tag}
                        onClick={() => handleVersionChange(image.id, v.tag)}
                      >
                        {v.tag}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* SBOM & Info Buttons */}
              <div
                className="flex items-center gap-1"
                onClick={(e) => e.stopPropagation()}
              >
                <SBOMButton
                  imageName={image.repository}
                  tagName={currentVersion}
                  size="xs"
                  variant="ghost"
                  className={cn(
                    isSelected
                      ? "text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary/80"
                      : "",
                  )}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "h-7 w-7 flex-shrink-0",
                    isSelected
                      ? "text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary/80"
                      : "",
                  )}
                  onClick={() => setInfoImage(image)}
                >
                  <Info className="h-4 w-4" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Info Dialog */}
      <Dialog open={!!infoImage} onOpenChange={() => setInfoImage(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="text-2xl">
                {infoImage && getImageIcon(infoImage.id)}
              </span>
              {infoImage?.name}
            </DialogTitle>
            <DialogDescription>{infoImage?.description}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <div className="text-sm font-medium mb-1">Source</div>
              <code className="text-xs bg-muted px-2 py-1 rounded">
                {infoImage?.registry}/{infoImage?.repository}
              </code>
            </div>
            <div>
              <div className="text-sm font-medium mb-2">Available Versions</div>
              <div className="space-y-1.5">
                {infoImage?.versions.map((v) => (
                  <div
                    key={v.tag}
                    className="flex items-center justify-between bg-muted px-3 py-2 rounded-lg"
                  >
                    <span className="text-xs font-medium">{v.tag}</span>
                    <SBOMButton
                      imageName={infoImage.repository}
                      tagName={v.tag}
                      size="xs"
                      variant="ghost"
                    />
                  </div>
                ))}
              </div>
            </div>
            {infoImage?.securityProfile && (
              <div>
                <div className="text-sm font-medium mb-1">
                  Security Features
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span
                    className={`px-1.5 py-0.5 rounded ${
                      infoImage.securityProfile.hardeningLevel === "strict"
                        ? "bg-green-500/10 text-green-500"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {infoImage.securityProfile.hardeningLevel} hardening
                  </span>
                  {infoImage.securityProfile.signatureVerified && (
                    <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500">
                      Signed
                    </span>
                  )}
                  {infoImage.securityProfile.sbomAvailable && (
                    <span className="px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-500">
                      SBOM
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
