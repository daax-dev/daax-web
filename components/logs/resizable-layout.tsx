"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

interface ResizableLayoutProps {
  sidebar: React.ReactNode;
  children: React.ReactNode;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  storageKey?: string;
}

export function ResizableLayout({
  sidebar,
  children,
  defaultWidth = 224,
  minWidth = 180,
  maxWidth = 500,
  storageKey = "logs-nav-width",
}: ResizableLayoutProps) {
  const [width, setWidth] = useState(defaultWidth);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load saved width from localStorage
  useEffect(() => {
    if (typeof window === "undefined" || !("localStorage" in window)) {
      return;
    }

    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed >= minWidth && parsed <= maxWidth) {
          setWidth(parsed);
        }
      }
    } catch (error) {
      // Fallback: keep default width if localStorage is unavailable or access fails
      console.warn("Failed to load saved width from localStorage", error);
    }
  }, [storageKey, minWidth, maxWidth]);

  // Save width to localStorage
  useEffect(() => {
    if (isDragging) {
      return;
    }

    if (typeof window === "undefined" || !("localStorage" in window)) {
      return;
    }

    try {
      window.localStorage.setItem(storageKey, width.toString());
    } catch (error) {
      // Handle cases where storage is unavailable or quota is exceeded
      if (error instanceof DOMException && error.name === "QuotaExceededError") {
        console.warn("Failed to save width to localStorage: quota exceeded", error);
      } else {
        console.warn("Failed to save width to localStorage", error);
      }
    }
  }, [width, isDragging, storageKey]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging || !containerRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const newWidth = e.clientX - containerRect.left;

      if (newWidth >= minWidth && newWidth <= maxWidth) {
        setWidth(newWidth);
      }
    },
    [isDragging, minWidth, maxWidth]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  return (
    <div ref={containerRef} className="flex h-full min-h-0 bg-zinc-950">
      {/* Sidebar */}
      <div style={{ width }} className="flex-shrink-0 h-full overflow-auto">
        {sidebar}
      </div>

      {/* Resize handle */}
      <div
        onMouseDown={handleMouseDown}
        className={cn(
          "w-1 cursor-col-resize flex-shrink-0 transition-colors",
          "hover:bg-blue-500/50",
          isDragging ? "bg-blue-500" : "bg-transparent"
        )}
      />

      {/* Main content */}
      <main className="flex-1 min-w-0 overflow-auto bg-zinc-900">{children}</main>
    </div>
  );
}
