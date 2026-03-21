"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Maximize2,
  Minimize2,
  ExternalLink,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ContainerEmbedProps {
  // Base URL for the container (e.g., "/proxy/it-tools" or "http://localhost:8080")
  baseUrl: string;
  // Path within the container (e.g., "/base64-string-converter")
  path?: string;
  // Title to display
  title: string;
  // Whether to show the toolbar
  showToolbar?: boolean;
  // Custom class for the container
  className?: string;
  // Height of the iframe (default: full available height)
  height?: string;
  // Callback when iframe loads
  onLoad?: () => void;
  // Callback on error
  onError?: (error: Error) => void;
  // Timeout in ms to detect loading failures (default: 30000)
  loadTimeout?: number;
}

export function ContainerEmbed({
  baseUrl,
  path = "",
  title,
  showToolbar = true,
  className,
  height = "calc(100vh - 8rem)",
  onLoad,
  onError,
  loadTimeout = 30000,
}: ContainerEmbedProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const fullUrl = `${baseUrl}${path}`;

  // Handle fullscreen toggle
  const toggleFullscreen = () => {
    if (!containerRef.current) return;

    if (!isFullscreen) {
      containerRef.current.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  };

  // Listen for fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  // Clear timeout helper
  const clearLoadTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  // Set up timeout-based error detection (since iframe onError doesn't reliably fire)
  useEffect(() => {
    if (isLoading && !hasError) {
      timeoutRef.current = setTimeout(() => {
        setIsLoading(false);
        setHasError(true);
        onError?.(new Error(`Timeout loading ${fullUrl}`));
      }, loadTimeout);
    }

    return () => clearLoadTimeout();
  }, [isLoading, hasError, fullUrl, loadTimeout, onError, clearLoadTimeout]);

  // Handle iframe load - clears timeout on successful load
  const handleLoad = useCallback(() => {
    clearLoadTimeout();
    setIsLoading(false);
    setHasError(false);
    onLoad?.();
  }, [clearLoadTimeout, onLoad]);

  // Refresh the iframe - resets loading state and timeout
  const refresh = useCallback(() => {
    if (iframeRef.current) {
      clearLoadTimeout();
      setIsLoading(true);
      setHasError(false);
      iframeRef.current.src = fullUrl;
    }
  }, [fullUrl, clearLoadTimeout]);

  // Open in new tab
  const openExternal = () => {
    window.open(fullUrl, "_blank");
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative flex flex-col rounded-lg border bg-background",
        isFullscreen && "fixed inset-0 z-50 rounded-none",
        className,
      )}
    >
      {/* Toolbar */}
      {showToolbar && (
        <div className="flex items-center justify-between border-b px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{title}</span>
            {path && (
              <span className="text-xs text-muted-foreground">{path}</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={refresh}
              disabled={isLoading}
              title="Refresh"
            >
              <RefreshCw
                className={cn("h-4 w-4", isLoading && "animate-spin")}
              />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={openExternal}
              title="Open in new tab"
            >
              <ExternalLink className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={toggleFullscreen}
              title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            >
              {isFullscreen ? (
                <Minimize2 className="h-4 w-4" />
              ) : (
                <Maximize2 className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Content area */}
      <div
        className="relative flex-1"
        style={{ height: showToolbar ? undefined : height }}
      >
        {/* Loading overlay */}
        {isLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                Loading {title}...
              </span>
            </div>
          </div>
        )}

        {/* Error state */}
        {hasError && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="rounded-full bg-destructive/10 p-4">
                <ExternalLink className="h-8 w-8 text-destructive" />
              </div>
              <div>
                <p className="font-medium">Failed to load {title}</p>
                <p className="text-sm text-muted-foreground">
                  The container might not be running
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={refresh}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Retry
                </Button>
                <Button variant="outline" size="sm" onClick={openExternal}>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Open Direct
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Iframe - uses timeout-based error detection since onError doesn't fire for cross-origin */}
        <iframe
          ref={iframeRef}
          src={fullUrl}
          className="h-full w-full border-0"
          style={{ height: isFullscreen ? "calc(100vh - 3rem)" : height }}
          onLoad={handleLoad}
          title={title}
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-modals"
          allow="clipboard-read; clipboard-write"
        />
      </div>
    </div>
  );
}
