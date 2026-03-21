"use client";

import { useState, useCallback, type ReactNode } from "react";
import { Panel, Group, Separator } from "react-resizable-panels";
import { Columns2, Rows2, Square, GripVertical, GripHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { type SplitLayout } from "@/types/ai-session";

interface SplitPaneLayoutProps {
  /** Primary pane content (always visible) */
  primaryContent: ReactNode;
  /** Secondary pane content (visible in split modes) */
  secondaryContent?: ReactNode;
  /** Current layout mode */
  layout?: SplitLayout;
  /** Callback when layout changes */
  onLayoutChange?: (layout: SplitLayout) => void;
  /** Initial split ratio (0-100, percentage for primary pane) */
  initialSplitRatio?: number;
  /** Minimum pane size in percentage */
  minPaneSize?: number;
  /** Show layout toggle buttons */
  showLayoutToggle?: boolean;
  /** Custom class name for the container */
  className?: string;
}

interface LayoutToggleProps {
  currentLayout: SplitLayout;
  secondaryContent: ReactNode | undefined;
  onLayoutChange: (layout: SplitLayout) => void;
}

// Layout toggle buttons - extracted as separate component
function LayoutToggle({ currentLayout, secondaryContent, onLayoutChange }: LayoutToggleProps) {
  return (
    <div className="flex items-center gap-1 p-1 rounded-md bg-muted/50 border">
      <Button
        variant={currentLayout === "single" ? "secondary" : "ghost"}
        size="sm"
        className="h-7 w-7 p-0"
        onClick={() => onLayoutChange("single")}
        title="Single view"
      >
        <Square className="h-4 w-4" />
      </Button>
      <Button
        variant={currentLayout === "split-vertical" ? "secondary" : "ghost"}
        size="sm"
        className="h-7 w-7 p-0"
        onClick={() => onLayoutChange("split-vertical")}
        title="Split vertical"
        disabled={!secondaryContent}
      >
        <Columns2 className="h-4 w-4" />
      </Button>
      <Button
        variant={currentLayout === "split-horizontal" ? "secondary" : "ghost"}
        size="sm"
        className="h-7 w-7 p-0"
        onClick={() => onLayoutChange("split-horizontal")}
        title="Split horizontal"
        disabled={!secondaryContent}
      >
        <Rows2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

interface ResizeHandleProps {
  direction: "vertical" | "horizontal";
}

// Resize handle component - extracted as separate component
function ResizeHandle({ direction }: ResizeHandleProps) {
  return (
    <Separator
      className={cn(
        "group relative flex items-center justify-center transition-colors",
        direction === "vertical"
          ? "w-2 hover:bg-primary/20 active:bg-primary/30"
          : "h-2 hover:bg-primary/20 active:bg-primary/30"
      )}
    >
      <div
        className={cn(
          "absolute rounded-full bg-border group-hover:bg-primary/50 group-active:bg-primary transition-colors",
          direction === "vertical"
            ? "h-8 w-1"
            : "w-8 h-1"
        )}
      />
      {direction === "vertical" ? (
        <GripVertical className="h-4 w-4 text-muted-foreground/50 group-hover:text-muted-foreground" />
      ) : (
        <GripHorizontal className="h-4 w-4 text-muted-foreground/50 group-hover:text-muted-foreground" />
      )}
    </Separator>
  );
}

/**
 * SplitPaneLayout - A resizable split pane component for viewing multiple terminal sessions
 *
 * Supports three layout modes:
 * - single: Only primary content visible
 * - split-vertical: Side-by-side panels (left/right)
 * - split-horizontal: Stacked panels (top/bottom)
 */
export function SplitPaneLayout({
  primaryContent,
  secondaryContent,
  layout = "single",
  onLayoutChange,
  initialSplitRatio = 50,
  minPaneSize = 20,
  showLayoutToggle = true,
  className,
}: SplitPaneLayoutProps) {
  const [internalLayout, setInternalLayout] = useState<SplitLayout>(layout);
  const currentLayout = onLayoutChange ? layout : internalLayout;

  const handleLayoutChange = useCallback(
    (newLayout: SplitLayout) => {
      if (onLayoutChange) {
        onLayoutChange(newLayout);
      } else {
        setInternalLayout(newLayout);
      }
    },
    [onLayoutChange]
  );

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Layout toggle */}
      {showLayoutToggle && (
        <div className="flex items-center justify-end px-2 py-1 border-b bg-muted/20">
          <LayoutToggle
            currentLayout={currentLayout}
            secondaryContent={secondaryContent}
            onLayoutChange={handleLayoutChange}
          />
        </div>
      )}

      {/* Content area */}
      <div className="flex-1 overflow-hidden">
        {currentLayout === "single" ? (
          // Single pane - only primary content
          <div className="h-full">{primaryContent}</div>
        ) : currentLayout === "split-vertical" ? (
          // Vertical split (side by side)
          <Group orientation="horizontal" className="h-full">
            <Panel defaultSize={initialSplitRatio} minSize={minPaneSize}>
              <div className="h-full overflow-hidden">{primaryContent}</div>
            </Panel>
            <ResizeHandle direction="vertical" />
            <Panel defaultSize={100 - initialSplitRatio} minSize={minPaneSize}>
              <div className="h-full overflow-hidden">
                {secondaryContent || (
                  <div className="h-full flex items-center justify-center text-muted-foreground">
                    <p className="text-sm">No secondary session</p>
                  </div>
                )}
              </div>
            </Panel>
          </Group>
        ) : (
          // Horizontal split (stacked)
          <Group orientation="vertical" className="h-full">
            <Panel defaultSize={initialSplitRatio} minSize={minPaneSize}>
              <div className="h-full overflow-hidden">{primaryContent}</div>
            </Panel>
            <ResizeHandle direction="horizontal" />
            <Panel defaultSize={100 - initialSplitRatio} minSize={minPaneSize}>
              <div className="h-full overflow-hidden">
                {secondaryContent || (
                  <div className="h-full flex items-center justify-center text-muted-foreground">
                    <p className="text-sm">No secondary session</p>
                  </div>
                )}
              </div>
            </Panel>
          </Group>
        )}
      </div>
    </div>
  );
}

export default SplitPaneLayout;
