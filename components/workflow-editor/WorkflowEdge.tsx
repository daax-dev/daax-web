"use client";

import { memo, type FC } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
  type Edge,
} from "@xyflow/react";
import { cn } from "@/lib/utils";
import type { WorkflowEdgeData } from "@/types/flowspec-workflow";

// Bright color palette for edges
const EDGE_COLORS = {
  default: "#3b82f6", // bright blue
  success: "#22c55e", // bright green
  optional: "#06b6d4", // cyan
  selected: "#f59e0b", // amber/orange for selected
  hover: "#8b5cf6", // purple for hover
};

interface WorkflowEdgeProps extends EdgeProps<Edge<WorkflowEdgeData>> {
  data?: WorkflowEdgeData;
}

const WorkflowEdge: FC<WorkflowEdgeProps> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
  style,
  markerEnd,
}) => {
  // Determine edge color based on state/data
  const getEdgeColor = () => {
    if (selected) return EDGE_COLORS.selected;
    // Color based on transition destination
    if (data?.transition?.to) return EDGE_COLORS.success;
    return EDGE_COLORS.default;
  };

  // Use bezier path for smoother curves
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    curvature: 0.25,
  });

  const edgeColor = getEdgeColor();
  const strokeWidth = selected ? 3 : 2;

  return (
    <>
      {/* Invisible wider path for easier interaction/hovering */}
      <path
        id={`${id}-interaction`}
        d={edgePath}
        fill="none"
        strokeWidth={20}
        stroke="transparent"
        className="cursor-pointer"
      />

      {/* Visible edge with glow effect when selected */}
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          ...style,
          stroke: edgeColor,
          strokeWidth,
          filter: selected ? `drop-shadow(0 0 6px ${edgeColor})` : undefined,
          transition: "stroke 0.2s, stroke-width 0.2s, filter 0.2s",
        }}
        markerEnd={markerEnd}
      />

      {/* Edge label (transition name) */}
      {data?.transition?.name && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: "all",
            }}
            className={cn(
              "px-2 py-0.5 rounded text-xs font-medium",
              "bg-background/90 backdrop-blur-sm border shadow-sm",
              selected
                ? "border-amber-500 text-amber-600"
                : "border-border text-muted-foreground",
            )}
          >
            {data.transition.name}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
};

WorkflowEdge.displayName = "WorkflowEdge";

export const edgeTypes = {
  workflowEdge: memo(WorkflowEdge),
};

export default memo(WorkflowEdge);
