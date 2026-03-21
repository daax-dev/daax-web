"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Download, Check, Loader2, AlertCircle, AlertTriangle, Edit2 } from "lucide-react";
import { CONTAINER_VARIANTS } from "@/lib/settings";
import { cn } from "@/lib/utils";

interface ImageStatus {
  id: string;
  fullName: string;
  available: boolean;
  size?: string;
  created?: string;
}

interface ContainerImageSelectorProps {
  registry: string;
  selectedImage: string;
  onSelect: (imageId: string, fullName: string) => void;
}

export function ContainerImageSelector({
  registry,
  selectedImage,
  onSelect,
}: ContainerImageSelectorProps) {
  const [imageStatuses, setImageStatuses] = useState<Map<string, ImageStatus>>(
    new Map()
  );
  const [loading, setLoading] = useState(true);
  const [apiAvailable, setApiAvailable] = useState(true);
  const [pullingImage, setPullingImage] = useState<string | null>(null);
  const [pullProgress, setPullProgress] = useState<string>("");
  const [pullError, setPullError] = useState<string | null>(null);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customImageValue, setCustomImageValue] = useState("");

  // Fetch image availability on mount and when registry changes
  const fetchImageStatuses = useCallback(async () => {
    setLoading(true);
    setApiAvailable(true);
    try {
      // Encode each image ID individually, preserving commas as delimiters
      // so the server can correctly parse multiple image IDs
      const imageIds = CONTAINER_VARIANTS.map((v) => encodeURIComponent(v.id)).join(",");
      const response = await fetch(
        `/api/docker/images?images=${imageIds}&registry=${encodeURIComponent(registry)}`
      );

      // Check if we got a valid JSON response (not a 404 HTML page)
      const contentType = response.headers.get("content-type");
      if (!contentType?.includes("application/json")) {
        throw new Error("API not available");
      }

      const data = await response.json();

      if (data.images) {
        const statusMap = new Map<string, ImageStatus>();
        for (const img of data.images) {
          statusMap.set(img.id, img);
        }
        setImageStatuses(statusMap);
      }
    } catch (error) {
      console.error("Failed to fetch image statuses:", error);
      setApiAvailable(false);
      // Clear statuses so we fall back to allowing all selections
      setImageStatuses(new Map());
    } finally {
      setLoading(false);
    }
  }, [registry]);

  useEffect(() => {
    fetchImageStatuses();
  }, [fetchImageStatuses]);

  // Pull an image
  const pullImage = async (imageId: string) => {
    const fullName = `${registry}/${imageId}:latest`;
    setPullingImage(imageId);
    setPullProgress("");
    setPullError(null);

    try {
      const response = await fetch("/api/docker/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: fullName }),
      });

      // Check if API is available
      const contentType = response.headers.get("content-type");
      if (response.status === 404) {
        throw new Error("Pull API not available - rebuild the container to enable");
      }

      // Handle non-OK responses (validation errors, etc.)
      if (!response.ok) {
        // Read body once as text, then attempt to parse as JSON
        const bodyText = await response.text();
        let errorMessage = bodyText || `Pull failed with status ${response.status}`;

        try {
          const parsed = JSON.parse(bodyText);
          if (parsed && typeof parsed === "object" && "error" in parsed) {
            errorMessage = String(parsed.error);
          }
        } catch {
          // Body is not valid JSON; use raw text or generic message
        }

        throw new Error(errorMessage);
      }

      // Verify we have a streaming response
      if (!contentType?.includes("application/")) {
        throw new Error("Unexpected response type from pull API");
      }

      if (!response.body) {
        throw new Error("No response body");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = ""; // Buffer for incomplete JSON lines across chunks

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Append new data to buffer
        buffer += decoder.decode(value, { stream: true });

        // Split by newlines, keeping the last incomplete line in buffer
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // Last element may be incomplete

        for (const line of lines) {
          if (!line.trim()) continue; // Skip empty lines

          try {
            const event = JSON.parse(line);
            if (event.type === "progress") {
              setPullProgress(event.message);
            } else if (event.type === "stderr") {
              // Non-fatal stderr output (warnings, deprecation notices)
              // Only show if it looks like a genuine warning, not Docker's normal output
              console.debug("[Docker Pull] stderr:", event.message);
            } else if (event.type === "complete") {
              // Clear any previous errors on successful completion
              setPullError(null);
              // Refresh statuses after successful pull
              await fetchImageStatuses();
            } else if (event.type === "failed") {
              // Make error message more user-friendly
              let errorMsg = event.message;
              if (errorMsg.includes("not found")) {
                errorMsg = `Image not found on Docker Hub. This variant may need to be built locally.`;
              }
              setPullError(errorMsg);
            }
          } catch (parseError) {
            // Log malformed JSON for debugging (should be rare with proper buffering)
            console.warn("[Docker Pull] Malformed JSON:", line, parseError);
          }
        }
      }

      // Handle any remaining data in buffer (final line without newline)
      if (buffer.trim()) {
        try {
          const event = JSON.parse(buffer);
          if (event.type === "complete") {
            setPullError(null);
            await fetchImageStatuses();
          } else if (event.type === "failed") {
            setPullError(event.message);
          }
        } catch {
          console.warn("[Docker Pull] Final chunk malformed:", buffer);
        }
      }
    } catch (error) {
      setPullError(error instanceof Error ? error.message : "Pull failed");
    } finally {
      setPullingImage(null);
      setPullProgress("");
    }
  };

  // Find selected variant ID from full image name
  // Sort by ID length descending to match more specific IDs first
  // (e.g., "daax-agents-flowspec" before "daax-agents")
  const getSelectedVariantId = () => {
    const sortedVariants = [...CONTAINER_VARIANTS].sort(
      (a, b) => b.id.length - a.id.length
    );
    for (const variant of sortedVariants) {
      if (selectedImage.includes(variant.id)) {
        return variant.id;
      }
    }
    return null;
  };

  const selectedVariantId = getSelectedVariantId();

  // Check if current selection is a custom image (not matching any known variant)
  const isCustomImageSelected = selectedVariantId === null && selectedImage.length > 0;

  // Handle custom image submission
  const handleCustomImageSubmit = () => {
    if (customImageValue.trim()) {
      onSelect("custom", customImageValue.trim());
      setShowCustomInput(false);
    }
  };

  // Always allow selecting any image - user knows best
  // Grey styling indicates "not locally available" but selection is still allowed
  const canSelect = (_variantId: string) => {
    return true; // Always allow selection
  };

  return (
    <div className="space-y-3">
      {!apiAvailable && !loading && (
        <div className="flex items-start gap-2 text-sm text-amber-600 dark:text-amber-400 bg-amber-500/10 p-2 rounded-md">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Image status check unavailable</p>
            <p className="text-xs opacity-80">Rebuild the container to enable. You can still select any image.</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground py-4">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Checking available images...</span>
        </div>
      ) : (
        <div className="grid gap-2">
          {CONTAINER_VARIANTS.map((variant) => {
            const status = imageStatuses.get(variant.id);
            const isAvailable = apiAvailable ? (status?.available ?? false) : true;
            const isSelected = selectedVariantId === variant.id;
            const isPulling = pullingImage === variant.id;
            const isClickable = canSelect(variant.id) && !isPulling;

            return (
              <div
                key={variant.id}
                className={cn(
                  "relative flex items-center justify-between p-3 rounded-lg border transition-all cursor-pointer",
                  // Grey: not available (only when API is available and reports unavailable)
                  apiAvailable && !isAvailable && !isSelected && "border-muted bg-muted/30 opacity-70 hover:opacity-100 hover:border-primary/50",
                  // White: available but not selected (or API unavailable)
                  (isAvailable || !apiAvailable) && !isSelected && "border-border bg-background hover:border-primary/50",
                  // Green: selected
                  isSelected && "border-green-500 bg-green-500/10 ring-1 ring-green-500/30"
                )}
                onClick={() => {
                  if (isClickable) {
                    const fullName = `${registry}/${variant.id}:latest`;
                    onSelect(variant.id, fullName);
                  }
                }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "font-medium",
                        isSelected && "text-green-600 dark:text-green-400",
                        apiAvailable && !isAvailable && !isSelected && "text-muted-foreground"
                      )}
                    >
                      {variant.name}
                    </span>
                    {variant.recommended && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                        Recommended
                      </span>
                    )}
                    {isSelected && (
                      <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
                    )}
                  </div>
                  <p
                    className={cn(
                      "text-xs mt-0.5",
                      isSelected
                        ? "text-green-600/80 dark:text-green-400/80"
                        : "text-muted-foreground"
                    )}
                  >
                    {variant.description}
                  </p>
                  {apiAvailable && isAvailable && status?.size && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {status.size}
                      {status.created && ` • ${status.created}`}
                    </p>
                  )}
                </div>

                <div className="ml-3 flex-shrink-0">
                  {isPulling ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      <span className="text-xs text-muted-foreground max-w-[120px] truncate">
                        {pullProgress || "Starting..."}
                      </span>
                    </div>
                  ) : apiAvailable && !isAvailable && !isSelected ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        pullImage(variant.id);
                      }}
                      className="gap-1.5"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Pull
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}

          {/* Custom Image Option */}
          {showCustomInput ? (
            <div className="p-3 rounded-lg border border-primary bg-primary/5">
              <div className="flex items-center gap-2 mb-2">
                <Edit2 className="h-4 w-4 text-primary" />
                <span className="font-medium text-sm">Custom Image</span>
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="e.g., myregistry/myimage:tag"
                  value={customImageValue}
                  onChange={(e) => setCustomImageValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleCustomImageSubmit();
                    } else if (e.key === "Escape") {
                      setShowCustomInput(false);
                      setCustomImageValue("");
                    }
                  }}
                  className="flex-1"
                  autoFocus
                />
                <Button
                  size="sm"
                  onClick={handleCustomImageSubmit}
                  disabled={!customImageValue.trim()}
                >
                  Use
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setShowCustomInput(false);
                    setCustomImageValue("");
                  }}
                >
                  Cancel
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Enter a full image reference (registry/repo:tag)
              </p>
            </div>
          ) : (
            <div
              className={cn(
                "relative flex items-center justify-between p-3 rounded-lg border transition-all cursor-pointer",
                isCustomImageSelected
                  ? "border-green-500 bg-green-500/10 ring-1 ring-green-500/30"
                  : "border-dashed border-muted-foreground/50 hover:border-primary/50"
              )}
              onClick={() => setShowCustomInput(true)}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Edit2 className={cn(
                    "h-4 w-4",
                    isCustomImageSelected ? "text-green-600 dark:text-green-400" : "text-muted-foreground"
                  )} />
                  <span className={cn(
                    "font-medium",
                    isCustomImageSelected ? "text-green-600 dark:text-green-400" : "text-muted-foreground"
                  )}>
                    {isCustomImageSelected ? "Custom Image" : "Use Custom Image..."}
                  </span>
                  {isCustomImageSelected && (
                    <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
                  )}
                </div>
                {isCustomImageSelected ? (
                  <p className="text-xs text-green-600/80 dark:text-green-400/80 mt-0.5 truncate">
                    {selectedImage}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Specify a custom image from any registry
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {pullError && (
        <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 p-2 rounded-md">
          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span className="flex-1">{pullError}</span>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 flex-shrink-0"
            onClick={() => setPullError(null)}
          >
            Dismiss
          </Button>
        </div>
      )}

      {apiAvailable && (
        <Button
          variant="outline"
          size="sm"
          onClick={fetchImageStatuses}
          disabled={loading}
          className="w-full"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : null}
          Refresh Image Status
        </Button>
      )}
    </div>
  );
}
