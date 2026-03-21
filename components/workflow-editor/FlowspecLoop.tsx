"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  reconnectEdge,
  type Node,
  type Edge,
  type NodeProps,
  type Connection,
  type OnConnect,
  type OnReconnect,
  Handle,
  Position,
  MarkerType,
  ConnectionLineType,
  Panel,
  useReactFlow,
  ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  FileText,
  GitBranch,
  Code,
  CheckCircle,
  ListTodo,
  User,
  Github,
  X,
  Plus,
  Trash2,
  ChevronRight,
  Settings,
  Puzzle,
  Wrench,
  Square,
  Circle,
  ArrowRight,
  Palette,
  Type,
  ArrowLeftRight,
  RotateCcw,
  Save,
  Download,
  Loader2,
  FilePlus,
  Play,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  type WorkflowStep,
  type WorkflowAgent,
  defaultWorkflowSteps,
} from "./flowspec-types";

// Phase icons
const phaseIcons: Record<string, React.ElementType> = {
  specify: FileText,
  plan: GitBranch,
  implement: Code,
  validate: CheckCircle,
  backlog: ListTodo,
  human: User,
  github: Github,
  ci: Play,
  custom: Square,
};

// Color options for edges
const edgeColors = [
  { value: "#22c55e", label: "Green" },
  { value: "#3b82f6", label: "Blue" },
  { value: "#eab308", label: "Yellow" },
  { value: "#ef4444", label: "Red" },
  { value: "#8b5cf6", label: "Purple" },
  { value: "#f97316", label: "Orange" },
  { value: "#06b6d4", label: "Cyan" },
  { value: "#ec4899", label: "Pink" },
  { value: "#6b7280", label: "Gray" },
];

// Node data types
interface CommandNodeData extends Record<string, unknown> {
  label: string;
  phaseId: string;
  onClick?: () => void;
}

interface ArtifactNodeData extends Record<string, unknown> {
  items: string[];
}

// Command Node (main workflow steps) - clickable
function CommandNode({ data, selected }: NodeProps<Node<CommandNodeData>>) {
  const Icon = phaseIcons[data.phaseId as string] || FileText;

  return (
    <div
      onClick={() => data.onClick?.()}
      className={cn(
        "px-5 py-3 rounded-2xl border-2 min-w-[120px] transition-all cursor-pointer",
        "bg-card shadow-lg hover:shadow-xl",
        selected
          ? "ring-2 ring-primary ring-offset-2 ring-offset-background border-primary"
          : "border-primary/50 hover:border-primary hover:scale-105",
      )}
    >
      {/* Source handles */}
      <Handle
        id="top"
        type="source"
        position={Position.Top}
        className="!bg-green-500 !w-3 !h-3 !border-2 !border-background"
        style={{ top: -6 }}
      />
      <Handle
        id="right"
        type="source"
        position={Position.Right}
        className="!bg-green-500 !w-3 !h-3 !border-2 !border-background"
        style={{ right: -6 }}
      />
      <Handle
        id="bottom"
        type="source"
        position={Position.Bottom}
        className="!bg-green-500 !w-3 !h-3 !border-2 !border-background"
        style={{ bottom: -6 }}
      />
      <Handle
        id="left"
        type="source"
        position={Position.Left}
        className="!bg-green-500 !w-3 !h-3 !border-2 !border-background"
        style={{ left: -6 }}
      />
      {/* Target handles */}
      <Handle
        id="top"
        type="target"
        position={Position.Top}
        className="!bg-blue-500 !w-3 !h-3 !border-2 !border-background"
        style={{ top: -6 }}
      />
      <Handle
        id="right"
        type="target"
        position={Position.Right}
        className="!bg-blue-500 !w-3 !h-3 !border-2 !border-background"
        style={{ right: -6 }}
      />
      <Handle
        id="bottom"
        type="target"
        position={Position.Bottom}
        className="!bg-blue-500 !w-3 !h-3 !border-2 !border-background"
        style={{ bottom: -6 }}
      />
      <Handle
        id="left"
        type="target"
        position={Position.Left}
        className="!bg-blue-500 !w-3 !h-3 !border-2 !border-background"
        style={{ left: -6 }}
      />

      <div className="flex items-center gap-2">
        <Icon className="h-5 w-5 text-primary" />
        <span className="font-semibold text-foreground">{data.label}</span>
      </div>
    </div>
  );
}

// Artifact Node (document boxes showing outputs)
function ArtifactNode({ data, selected }: NodeProps<Node<ArtifactNodeData>>) {
  return (
    <div
      className={cn(
        "px-3 py-2 rounded-lg border-2 border-dashed min-w-[80px] transition-all",
        "bg-muted/50 shadow-sm",
        selected
          ? "ring-2 ring-blue-500 ring-offset-2 ring-offset-background border-blue-500"
          : "border-muted-foreground/50 hover:border-muted-foreground",
      )}
    >
      {/* Source handles */}
      <Handle
        id="top"
        type="source"
        position={Position.Top}
        className="!bg-green-500 !w-2.5 !h-2.5 !border !border-background"
        style={{ top: -5 }}
      />
      <Handle
        id="right"
        type="source"
        position={Position.Right}
        className="!bg-green-500 !w-2.5 !h-2.5 !border !border-background"
        style={{ right: -5 }}
      />
      <Handle
        id="bottom"
        type="source"
        position={Position.Bottom}
        className="!bg-green-500 !w-2.5 !h-2.5 !border !border-background"
        style={{ bottom: -5 }}
      />
      <Handle
        id="left"
        type="source"
        position={Position.Left}
        className="!bg-green-500 !w-2.5 !h-2.5 !border !border-background"
        style={{ left: -5 }}
      />
      {/* Target handles */}
      <Handle
        id="top"
        type="target"
        position={Position.Top}
        className="!bg-blue-500 !w-2.5 !h-2.5 !border !border-background"
        style={{ top: -5 }}
      />
      <Handle
        id="right"
        type="target"
        position={Position.Right}
        className="!bg-blue-500 !w-2.5 !h-2.5 !border !border-background"
        style={{ right: -5 }}
      />
      <Handle
        id="bottom"
        type="target"
        position={Position.Bottom}
        className="!bg-blue-500 !w-2.5 !h-2.5 !border !border-background"
        style={{ bottom: -5 }}
      />
      <Handle
        id="left"
        type="target"
        position={Position.Left}
        className="!bg-blue-500 !w-2.5 !h-2.5 !border !border-background"
        style={{ left: -5 }}
      />

      <div className="space-y-0.5">
        {(data.items as string[]).map((item, i) => (
          <div
            key={i}
            className="flex items-center gap-1.5 text-xs text-muted-foreground"
          >
            <FileText className="h-3 w-3" />
            <span>{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// External Node (Backlog, Human, GitHub)
function ExternalNode({ data, selected }: NodeProps<Node<CommandNodeData>>) {
  const Icon = phaseIcons[data.phaseId as string] || FileText;

  return (
    <div
      className={cn(
        "px-4 py-3 rounded-xl border-2 min-w-[100px] transition-all",
        "bg-muted/30 shadow-md",
        selected
          ? "ring-2 ring-yellow-500 ring-offset-2 ring-offset-background border-yellow-500"
          : "border-yellow-500/50 hover:border-yellow-500",
      )}
    >
      {/* Source handles */}
      <Handle
        id="top"
        type="source"
        position={Position.Top}
        className="!bg-green-500 !w-3 !h-3 !border-2 !border-background"
        style={{ top: -6 }}
      />
      <Handle
        id="right"
        type="source"
        position={Position.Right}
        className="!bg-green-500 !w-3 !h-3 !border-2 !border-background"
        style={{ right: -6 }}
      />
      <Handle
        id="bottom"
        type="source"
        position={Position.Bottom}
        className="!bg-green-500 !w-3 !h-3 !border-2 !border-background"
        style={{ bottom: -6 }}
      />
      <Handle
        id="left"
        type="source"
        position={Position.Left}
        className="!bg-green-500 !w-3 !h-3 !border-2 !border-background"
        style={{ left: -6 }}
      />
      {/* Target handles */}
      <Handle
        id="top"
        type="target"
        position={Position.Top}
        className="!bg-yellow-500 !w-3 !h-3 !border-2 !border-background"
        style={{ top: -6 }}
      />
      <Handle
        id="right"
        type="target"
        position={Position.Right}
        className="!bg-yellow-500 !w-3 !h-3 !border-2 !border-background"
        style={{ right: -6 }}
      />
      <Handle
        id="bottom"
        type="target"
        position={Position.Bottom}
        className="!bg-yellow-500 !w-3 !h-3 !border-2 !border-background"
        style={{ bottom: -6 }}
      />
      <Handle
        id="left"
        type="target"
        position={Position.Left}
        className="!bg-yellow-500 !w-3 !h-3 !border-2 !border-background"
        style={{ left: -6 }}
      />

      <div className="flex flex-col items-center gap-1">
        <Icon className="h-6 w-6 text-yellow-500" />
        <span className="font-medium text-sm text-foreground">
          {data.label}
        </span>
      </div>
    </div>
  );
}

// Node types
const nodeTypes = {
  command: CommandNode,
  artifact: ArtifactNode,
  external: ExternalNode,
};

// Default edge options
const defaultEdgeOptions = {
  type: "smoothstep",
  animated: false,
};

// Initial nodes - Clean layout matching the workflow diagram
// Layout: External nodes on left, main loop in center-right, artifacts branching off
const initialNodes: Node[] = [
  // External nodes (left column)
  {
    id: "backlog",
    type: "external",
    position: { x: 80, y: 60 },
    data: { label: "Backlog", phaseId: "backlog" },
  },
  {
    id: "human",
    type: "external",
    position: { x: 180, y: 200 },
    data: { label: "Human", phaseId: "human" },
  },
  {
    id: "github",
    type: "external",
    position: { x: 80, y: 420 },
    data: { label: "GitHub", phaseId: "github" },
  },
  {
    id: "ci",
    type: "external",
    position: { x: 80, y: 640 },
    data: { label: "CI/Actions", phaseId: "ci" },
  },

  // Main workflow loop (center) - arranged to avoid crossing
  {
    id: "specify",
    type: "command",
    position: { x: 380, y: 60 },
    data: { label: "Specify", phaseId: "specify" },
  },
  {
    id: "validate",
    type: "command",
    position: { x: 380, y: 250 },
    data: { label: "Validate", phaseId: "validate" },
  },
  {
    id: "plan",
    type: "command",
    position: { x: 620, y: 250 },
    data: { label: "Plan", phaseId: "plan" },
  },
  {
    id: "implement",
    type: "command",
    position: { x: 500, y: 420 },
    data: { label: "Implement", phaseId: "implement" },
  },

  // Artifact nodes (positioned to side of their source steps)
  {
    id: "artifact-specs",
    type: "artifact",
    position: { x: 580, y: 60 },
    data: { items: ["Specs"] },
  },
  {
    id: "artifact-plan",
    type: "artifact",
    position: { x: 780, y: 330 },
    data: { items: ["Specs", "Arch"] },
  },
  {
    id: "artifact-impl",
    type: "artifact",
    position: { x: 350, y: 520 },
    data: { items: ["Spec", "Arch", "Code", "Test"] },
  },
];

// Initial edges - Clean routing to avoid crossings
const initialEdges: Edge[] = [
  // === EXTERNAL FLOW (Yellow - outer loop) ===
  // Backlog → Specify (Todo)
  {
    id: "e-backlog-specify",
    source: "backlog",
    target: "specify",
    sourceHandle: "right",
    targetHandle: "left",
    type: "smoothstep",
    style: { stroke: "#eab308", strokeWidth: 2 },
    label: "Todo",
    labelStyle: { fill: "#eab308", fontSize: 11, fontWeight: 500 },
    labelBgStyle: { fill: "hsl(var(--background))", fillOpacity: 0.9 },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: "#eab308",
      width: 14,
      height: 14,
    },
  },
  // Validate → GitHub (PR)
  {
    id: "e-validate-github",
    source: "validate",
    target: "github",
    sourceHandle: "left",
    targetHandle: "right",
    type: "smoothstep",
    style: { stroke: "#eab308", strokeWidth: 2 },
    label: "PR",
    labelStyle: { fill: "#eab308", fontSize: 11, fontWeight: 500 },
    labelBgStyle: { fill: "hsl(var(--background))", fillOpacity: 0.9 },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: "#eab308",
      width: 14,
      height: 14,
    },
  },
  // GitHub → Human (Review)
  {
    id: "e-github-human",
    source: "github",
    target: "human",
    sourceHandle: "top",
    targetHandle: "bottom",
    type: "smoothstep",
    style: { stroke: "#eab308", strokeWidth: 2 },
    label: "Review",
    labelStyle: { fill: "#eab308", fontSize: 11, fontWeight: 500 },
    labelBgStyle: { fill: "hsl(var(--background))", fillOpacity: 0.9 },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: "#eab308",
      width: 14,
      height: 14,
    },
  },
  // Human → Backlog (mark Done - task completed)
  {
    id: "e-human-backlog",
    source: "human",
    target: "backlog",
    sourceHandle: "top",
    targetHandle: "bottom",
    type: "smoothstep",
    style: { stroke: "#eab308", strokeWidth: 2 },
    label: "mark Done",
    labelStyle: { fill: "#eab308", fontSize: 11, fontWeight: 500 },
    labelBgStyle: { fill: "hsl(var(--background))", fillOpacity: 0.9 },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: "#eab308",
      width: 14,
      height: 14,
    },
  },
  // Human → GitHub (approve & merge to main - PR approved)
  {
    id: "e-human-github",
    source: "human",
    target: "github",
    sourceHandle: "left",
    targetHandle: "left",
    type: "smoothstep",
    style: { stroke: "#eab308", strokeWidth: 2 },
    label: "approve & merge to main",
    labelStyle: { fill: "#eab308", fontSize: 11, fontWeight: 500 },
    labelBgStyle: { fill: "hsl(var(--background))", fillOpacity: 0.9 },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: "#eab308",
      width: 14,
      height: 14,
    },
  },
  // GitHub → CI (trigger GitHub Actions - runs CI/CD pipeline)
  {
    id: "e-github-ci",
    source: "github",
    target: "ci",
    sourceHandle: "bottom",
    targetHandle: "top",
    type: "smoothstep",
    style: { stroke: "#eab308", strokeWidth: 2, strokeDasharray: "6 4" },
    label: "trigger GitHub Actions",
    labelStyle: { fill: "#eab308", fontSize: 11, fontWeight: 500 },
    labelBgStyle: { fill: "hsl(var(--background))", fillOpacity: 0.9 },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: "#eab308",
      width: 14,
      height: 14,
    },
  },

  // === MAIN WORKFLOW LOOP (Green - inner loop, SOLID lines) ===
  // Specify → Plan (from right, enters Plan from top)
  {
    id: "e-specify-plan",
    source: "specify",
    target: "plan",
    sourceHandle: "right",
    targetHandle: "top",
    type: "smoothstep",
    style: { stroke: "#22c55e", strokeWidth: 2 },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: "#22c55e",
      width: 14,
      height: 14,
    },
  },
  // Plan → Implement (from bottom, enters Implement from right)
  {
    id: "e-plan-implement",
    source: "plan",
    target: "implement",
    sourceHandle: "bottom",
    targetHandle: "right",
    type: "smoothstep",
    style: { stroke: "#22c55e", strokeWidth: 2 },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: "#22c55e",
      width: 14,
      height: 14,
    },
  },
  // Implement → Validate (from left, enters Validate from bottom)
  {
    id: "e-implement-validate",
    source: "implement",
    target: "validate",
    sourceHandle: "left",
    targetHandle: "bottom",
    type: "smoothstep",
    style: { stroke: "#22c55e", strokeWidth: 2 },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: "#22c55e",
      width: 14,
      height: 14,
    },
  },
  // Validate → Specify (up - loop back, uses top handle)
  {
    id: "e-validate-specify",
    source: "validate",
    target: "specify",
    sourceHandle: "top",
    targetHandle: "bottom",
    type: "smoothstep",
    style: { stroke: "#22c55e", strokeWidth: 2 },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: "#22c55e",
      width: 14,
      height: 14,
    },
  },

  // === ARTIFACT OUTPUTS (Blue dashed - side branches) ===
  // Specify → Specs artifact (from top, going up-right to artifact)
  {
    id: "e-specify-specs",
    source: "specify",
    target: "artifact-specs",
    sourceHandle: "top",
    targetHandle: "left",
    type: "smoothstep",
    style: { stroke: "#06b6d4", strokeWidth: 2, strokeDasharray: "6 4" },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: "#06b6d4",
      width: 12,
      height: 12,
    },
  },
  // Plan → Plan artifacts
  {
    id: "e-plan-arch",
    source: "plan",
    target: "artifact-plan",
    sourceHandle: "right",
    targetHandle: "left",
    type: "smoothstep",
    style: { stroke: "#06b6d4", strokeWidth: 2, strokeDasharray: "6 4" },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: "#06b6d4",
      width: 12,
      height: 12,
    },
  },
  // Implement → Implementation artifacts
  {
    id: "e-impl-artifacts",
    source: "implement",
    target: "artifact-impl",
    sourceHandle: "bottom",
    targetHandle: "top",
    type: "smoothstep",
    style: { stroke: "#06b6d4", strokeWidth: 2, strokeDasharray: "6 4" },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: "#06b6d4",
      width: 12,
      height: 12,
    },
  },
];

// Edge Editor Panel
function EdgeEditorPanel({
  edge,
  onClose,
  onUpdateEdge,
  onDeleteEdge,
}: {
  edge: Edge;
  onClose: () => void;
  onUpdateEdge: (edge: Edge) => void;
  onDeleteEdge: (edgeId: string) => void;
}) {
  const currentColor = (edge.style?.stroke as string) || "#22c55e";
  const currentLabel = (edge.label as string) || "";
  const currentWidth = (edge.style?.strokeWidth as number) || 2;
  const hasStartArrow = edge.markerStart !== undefined;
  const hasEndArrow = edge.markerEnd !== undefined;
  const isDashed =
    (edge.style?.strokeDasharray as string)?.includes("6") || false;
  const isAnimated = edge.animated || false;

  const updateEdgeStyle = (updates: Partial<Edge>) => {
    onUpdateEdge({ ...edge, ...updates });
  };

  const setWidth = (width: number) => {
    updateEdgeStyle({
      style: { ...edge.style, strokeWidth: width },
    });
  };

  const setColor = (color: string) => {
    const newStyle = { ...edge.style, stroke: color };
    const newMarkerEnd = hasEndArrow
      ? { type: MarkerType.ArrowClosed, color, width: 14, height: 14 }
      : undefined;
    const newMarkerStart = hasStartArrow
      ? { type: MarkerType.ArrowClosed, color, width: 14, height: 14 }
      : undefined;
    const newLabelStyle = edge.label
      ? { fill: color, fontSize: 11, fontWeight: 500 }
      : undefined;

    updateEdgeStyle({
      style: newStyle,
      markerEnd: newMarkerEnd,
      markerStart: newMarkerStart,
      labelStyle: newLabelStyle,
    });
  };

  const toggleStartArrow = () => {
    if (hasStartArrow) {
      updateEdgeStyle({ markerStart: undefined });
    } else {
      updateEdgeStyle({
        markerStart: {
          type: MarkerType.ArrowClosed,
          color: currentColor,
          width: 14,
          height: 14,
        },
      });
    }
  };

  const toggleEndArrow = () => {
    if (hasEndArrow) {
      updateEdgeStyle({ markerEnd: undefined });
    } else {
      updateEdgeStyle({
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: currentColor,
          width: 14,
          height: 14,
        },
      });
    }
  };

  const toggleDashed = () => {
    const newDasharray = isDashed ? undefined : "6 4";
    updateEdgeStyle({
      style: { ...edge.style, strokeDasharray: newDasharray },
    });
  };

  const toggleAnimated = () => {
    updateEdgeStyle({ animated: !isAnimated });
  };

  const setLabel = (label: string) => {
    updateEdgeStyle({
      label: label || undefined,
      labelStyle: label
        ? { fill: currentColor, fontSize: 11, fontWeight: 500 }
        : undefined,
      labelBgStyle: label
        ? { fill: "hsl(var(--background))", fillOpacity: 0.9 }
        : undefined,
    });
  };

  return (
    <div className="w-72 bg-card border-l border-border flex flex-col h-full">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ArrowRight className="h-5 w-5 text-primary" />
          <span className="font-semibold">Edit Connection</span>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1 p-4">
        <div className="space-y-5">
          {/* Color */}
          <div>
            <Label className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
              <Palette className="h-3.5 w-3.5" />
              Color
            </Label>
            <div className="grid grid-cols-5 gap-2 mt-2">
              {edgeColors.map((color) => (
                <button
                  key={color.value}
                  onClick={() => setColor(color.value)}
                  className={cn(
                    "w-8 h-8 rounded-full border-2 transition-all",
                    currentColor === color.value
                      ? "border-foreground scale-110"
                      : "border-transparent hover:scale-105",
                  )}
                  style={{ backgroundColor: color.value }}
                  title={color.label}
                />
              ))}
            </div>
          </div>

          {/* Label */}
          <div>
            <Label className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
              <Type className="h-3.5 w-3.5" />
              Label
            </Label>
            <Input
              value={currentLabel}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Enter label text..."
              className="mt-2"
            />
          </div>

          {/* Arrow Direction */}
          <div>
            <Label className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
              <ArrowLeftRight className="h-3.5 w-3.5" />
              Arrows
            </Label>
            <div className="flex gap-2 mt-2">
              <Button
                variant={hasStartArrow ? "default" : "outline"}
                size="sm"
                onClick={toggleStartArrow}
                className="flex-1"
              >
                ← Start
              </Button>
              <Button
                variant={hasEndArrow ? "default" : "outline"}
                size="sm"
                onClick={toggleEndArrow}
                className="flex-1"
              >
                End →
              </Button>
            </div>
          </div>

          {/* Style Options */}
          <div>
            <Label className="text-sm font-medium text-muted-foreground mb-2">
              Style
            </Label>
            <div className="space-y-3 mt-2">
              {/* Line Width */}
              <div>
                <span className="text-sm block mb-1.5">
                  Line Width: {currentWidth}px
                </span>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((w) => (
                    <Button
                      key={w}
                      variant={currentWidth === w ? "default" : "outline"}
                      size="sm"
                      className="flex-1 h-7 px-0"
                      onClick={() => setWidth(w)}
                    >
                      {w}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Dashed Line</span>
                <Switch checked={isDashed} onCheckedChange={toggleDashed} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Animated</span>
                <Switch checked={isAnimated} onCheckedChange={toggleAnimated} />
              </div>
            </div>
          </div>

          {/* Delete */}
          <div className="pt-4 border-t border-border">
            <Button
              variant="destructive"
              size="sm"
              className="w-full"
              onClick={() => {
                onDeleteEdge(edge.id);
                onClose();
              }}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Connection
            </Button>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

// Step Configuration Panel - Resizable
function StepConfigPanel({
  step,
  onClose,
  onUpdateStep,
  onSelectAgent,
  onUpdateNodeLabel,
}: {
  step: WorkflowStep;
  onClose: () => void;
  onUpdateStep: (step: WorkflowStep) => void;
  onSelectAgent: (agent: WorkflowAgent) => void;
  onUpdateNodeLabel?: (nodeId: string, label: string) => void;
}) {
  const [name, setName] = useState(step.name);
  const [prompt, setPrompt] = useState(step.prompt);
  const [panelWidth, setPanelWidth] = useState(450);
  const [isResizing, setIsResizing] = useState(false);
  const minWidth = 350;
  const maxWidth = 700;

  const handleNameChange = (value: string) => {
    setName(value);
    onUpdateStep({ ...step, name: value });
    onUpdateNodeLabel?.(step.id, value);
  };

  const handlePromptChange = (value: string) => {
    setPrompt(value);
    onUpdateStep({ ...step, prompt: value });
  };

  const handleAddAgent = () => {
    const newAgent: WorkflowAgent = {
      id: `agent-${Date.now()}`,
      name: "New Agent",
      description: "Configure this agent",
      prompt: "",
      skills: [],
      mcpTools: [],
    };
    onUpdateStep({ ...step, agents: [...step.agents, newAgent] });
  };

  const handleRemoveAgent = (agentId: string) => {
    onUpdateStep({
      ...step,
      agents: step.agents.filter((a) => a.id !== agentId),
    });
  };

  // Handle resize
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    const startX = e.clientX;
    const startWidth = panelWidth;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = startX - e.clientX;
      const newWidth = Math.min(
        maxWidth,
        Math.max(minWidth, startWidth + delta),
      );
      setPanelWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  const Icon = phaseIcons[step.phaseId] || FileText;

  return (
    <div
      className="bg-card border-l border-border flex flex-col h-full relative"
      style={{ width: panelWidth }}
    >
      {/* Resize handle */}
      <div
        className={cn(
          "absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-primary/30 transition-colors",
          isResizing && "bg-primary/50",
        )}
        onMouseDown={handleMouseDown}
      />
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="h-5 w-5 text-primary" />
          <span className="font-semibold">{step.name} Step</span>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-2 block">
              Step Name
            </label>
            <Input
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Enter step name..."
            />
          </div>

          <div>
            <label className="text-sm font-medium text-muted-foreground mb-2 block">
              Step Prompt
            </label>
            <Textarea
              value={prompt}
              onChange={(e) => handlePromptChange(e.target.value)}
              placeholder="Enter the prompt for this workflow step..."
              className="min-h-[120px] resize-none"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-muted-foreground">
                Agents ({step.agents.length})
              </label>
              <Button variant="outline" size="sm" onClick={handleAddAgent}>
                <Plus className="h-3 w-3 mr-1" />
                Add
              </Button>
            </div>

            <div className="space-y-2">
              {step.agents.map((agent) => (
                <div
                  key={agent.id}
                  className="p-3 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer group"
                  onClick={() => onSelectAgent(agent)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium text-sm">{agent.name}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveAgent(agent.id);
                        }}
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                    {agent.description}
                  </p>
                  <div className="flex gap-1 mt-2">
                    {agent.skills.length > 0 && (
                      <Badge variant="secondary" className="text-[10px]">
                        {agent.skills.length} skills
                      </Badge>
                    )}
                    {agent.mcpTools.length > 0 && (
                      <Badge variant="outline" className="text-[10px]">
                        {agent.mcpTools.length} tools
                      </Badge>
                    )}
                  </div>
                </div>
              ))}

              {step.agents.length === 0 && (
                <div className="text-center py-6 text-muted-foreground text-sm">
                  No agents configured.
                  <br />
                  Click &quot;Add&quot; to add an agent.
                </div>
              )}
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

// Agent Configuration Panel
function AgentConfigPanel({
  agent,
  stepName,
  onClose,
  onUpdateAgent,
  onBack,
}: {
  agent: WorkflowAgent;
  stepName: string;
  onClose: () => void;
  onUpdateAgent: (agent: WorkflowAgent) => void;
  onBack: () => void;
}) {
  const [name, setName] = useState(agent.name);
  const [description, setDescription] = useState(agent.description);
  const [prompt, setPrompt] = useState(agent.prompt);

  const handleUpdate = (updates: Partial<WorkflowAgent>) => {
    onUpdateAgent({ ...agent, ...updates });
  };

  const handleAddSkill = () => {
    const newSkill = {
      id: `skill-${Date.now()}`,
      name: "/new:skill",
      type: "claude" as const,
      enabled: true,
    };
    handleUpdate({ skills: [...agent.skills, newSkill] });
  };

  const handleToggleSkill = (skillId: string) => {
    handleUpdate({
      skills: agent.skills.map((s) =>
        s.id === skillId ? { ...s, enabled: !s.enabled } : s,
      ),
    });
  };

  const handleRemoveSkill = (skillId: string) => {
    handleUpdate({
      skills: agent.skills.filter((s) => s.id !== skillId),
    });
  };

  const handleAddTool = () => {
    const newTool = {
      id: `tool-${Date.now()}`,
      name: "New Tool",
      description: "Configure this tool",
      enabled: true,
    };
    handleUpdate({ mcpTools: [...agent.mcpTools, newTool] });
  };

  const handleToggleTool = (toolId: string) => {
    handleUpdate({
      mcpTools: agent.mcpTools.map((t) =>
        t.id === toolId ? { ...t, enabled: !t.enabled } : t,
      ),
    });
  };

  const handleRemoveTool = (toolId: string) => {
    handleUpdate({
      mcpTools: agent.mcpTools.filter((t) => t.id !== toolId),
    });
  };

  return (
    <div className="w-96 bg-card border-l border-border flex flex-col h-full">
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="h-7 px-2"
          >
            <ChevronRight className="h-4 w-4 rotate-180 mr-1" />
            {stepName}
          </Button>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <User className="h-5 w-5 text-primary" />
          <Input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              handleUpdate({ name: e.target.value });
            }}
            className="font-semibold h-8"
          />
        </div>
      </div>

      <ScrollArea className="flex-1 p-4">
        <div className="space-y-5">
          {/* Description */}
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
              <Settings className="h-3.5 w-3.5" />
              Description
            </label>
            <Textarea
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                handleUpdate({ description: e.target.value });
              }}
              placeholder="Describe what this agent does..."
              className="min-h-[60px] resize-none text-sm"
            />
          </div>

          {/* Prompt */}
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5" />
              Agent Prompt
            </label>
            <Textarea
              value={prompt}
              onChange={(e) => {
                setPrompt(e.target.value);
                handleUpdate({ prompt: e.target.value });
              }}
              placeholder="Enter the system prompt for this agent..."
              className="min-h-[100px] resize-none text-sm font-mono"
            />
          </div>

          {/* Skills */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                <Puzzle className="h-3.5 w-3.5" />
                Skills ({agent.skills.length})
              </label>
              <Button
                variant="outline"
                size="sm"
                className="h-7"
                onClick={handleAddSkill}
              >
                <Plus className="h-3 w-3 mr-1" />
                Add
              </Button>
            </div>

            <div className="space-y-1.5">
              {agent.skills.map((skill) => (
                <div
                  key={skill.id}
                  className="flex items-center justify-between p-2 rounded border border-border bg-muted/20"
                >
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={skill.enabled}
                      onCheckedChange={() => handleToggleSkill(skill.id)}
                    />
                    <span className="text-sm font-mono">{skill.name}</span>
                    <Badge
                      variant={
                        skill.type === "claude" ? "default" : "secondary"
                      }
                      className="text-[10px]"
                    >
                      {skill.type}
                    </Badge>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => handleRemoveSkill(skill.id)}
                  >
                    <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                  </Button>
                </div>
              ))}

              {agent.skills.length === 0 && (
                <div className="text-center py-4 text-muted-foreground text-xs">
                  No skills configured
                </div>
              )}
            </div>
          </div>

          {/* MCP Tools */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                <Wrench className="h-3.5 w-3.5" />
                MCP Tools ({agent.mcpTools.length})
              </label>
              <Button
                variant="outline"
                size="sm"
                className="h-7"
                onClick={handleAddTool}
              >
                <Plus className="h-3 w-3 mr-1" />
                Add
              </Button>
            </div>

            <div className="space-y-1.5">
              {agent.mcpTools.map((tool) => (
                <div
                  key={tool.id}
                  className="flex items-center justify-between p-2 rounded border border-border bg-muted/20"
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Switch
                      checked={tool.enabled}
                      onCheckedChange={() => handleToggleTool(tool.id)}
                    />
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">
                        {tool.name}
                      </div>
                      <div className="text-[10px] text-muted-foreground truncate">
                        {tool.description}
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 flex-shrink-0"
                    onClick={() => handleRemoveTool(tool.id)}
                  >
                    <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                  </Button>
                </div>
              ))}

              {agent.mcpTools.length === 0 && (
                <div className="text-center py-4 text-muted-foreground text-xs">
                  No MCP tools configured
                </div>
              )}
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

// Node Description Panel - for external and artifact nodes
function NodeDescriptionPanel({
  node,
  onClose,
  onUpdate,
}: {
  node: Node;
  onClose: () => void;
  onUpdate: (node: Node) => void;
}) {
  const isArtifact = node.type === "artifact";
  const isExternal = node.type === "external";
  const [label, setLabel] = useState((node.data?.label as string) || "");
  const [description, setDescription] = useState(
    (node.data?.description as string) || "",
  );
  const [items, setItems] = useState<string[]>(
    (node.data?.items as string[]) || [],
  );

  const handleSave = () => {
    const updatedData = isArtifact
      ? { ...node.data, items, description }
      : { ...node.data, label, description };
    onUpdate({ ...node, data: updatedData });
  };

  const handleAddItem = () => {
    setItems([...items, "New Item"]);
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleUpdateItem = (index: number, value: string) => {
    const newItems = [...items];
    newItems[index] = value;
    setItems(newItems);
  };

  const Icon = isArtifact
    ? FileText
    : isExternal
      ? phaseIcons[node.data?.phaseId as string] || Square
      : Square;

  return (
    <div className="w-80 bg-card border-l border-border flex flex-col h-full">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="h-5 w-5 text-muted-foreground" />
          <span className="font-semibold">
            {isArtifact ? "Artifact" : "External"} Node
          </span>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {/* Label (for external nodes) */}
          {isExternal && (
            <div>
              <Label className="text-sm font-medium text-muted-foreground mb-2 block">
                Label
              </Label>
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Node label..."
              />
            </div>
          )}

          {/* Items (for artifact nodes) */}
          {isArtifact && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-medium text-muted-foreground">
                  Items ({items.length})
                </Label>
                <Button variant="outline" size="sm" onClick={handleAddItem}>
                  <Plus className="h-3 w-3 mr-1" />
                  Add
                </Button>
              </div>
              <div className="space-y-2">
                {items.map((item, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input
                      value={item}
                      onChange={(e) => handleUpdateItem(index, e.target.value)}
                      className="flex-1"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleRemoveItem(index)}
                    >
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Description */}
          <div>
            <Label className="text-sm font-medium text-muted-foreground mb-2 block">
              Description
            </Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe this node..."
              className="min-h-[100px] resize-none"
            />
          </div>

          {/* Save button */}
          <Button onClick={handleSave} className="w-full">
            <Save className="h-4 w-4 mr-2" />
            Save Changes
          </Button>
        </div>
      </ScrollArea>
    </div>
  );
}

// API response types
interface APIPhase {
  id: string;
  name: string;
  prompt: string;
  skills: string[];
}

interface APIAgent {
  id: string;
  name: string;
  phase: string;
  description: string;
  prompt: string;
  skills: string[];
}

interface WorkflowConfig {
  phases: APIPhase[];
  agents: APIAgent[];
}

// Main Flow Component
function FlowspecLoopInner() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();

  // Loading state
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Workflow state
  const [workflowSteps, setWorkflowSteps] =
    useState<WorkflowStep[]>(defaultWorkflowSteps);
  const [selectedStep, setSelectedStep] = useState<WorkflowStep | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<WorkflowAgent | null>(
    null,
  );
  const [selectedEdge, setSelectedEdge] = useState<Edge | null>(null);
  const [selectedOtherNode, setSelectedOtherNode] = useState<Node | null>(null);

  // Node counter for unique IDs
  const nodeIdCounter = useRef(100);

  // Nodes and edges state
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Load saved workflow from JSON file (preserves all data including prompts)
  useEffect(() => {
    async function loadSavedWorkflow() {
      try {
        setIsLoading(true);

        // Try to load saved workflow config
        const response = await fetch("/api/workflow-editor/skills", {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        });

        // Check for a saved workflow file
        const savedResponse = await fetch(
          "/api/workflow-editor/skills?mode=load-saved",
        );
        if (savedResponse.ok) {
          const savedData = await savedResponse.json();
          if (savedData.nodes && savedData.edges && savedData.steps) {
            // Restore saved workflow
            setNodes(savedData.nodes);
            setEdges(savedData.edges);
            setWorkflowSteps(savedData.steps);
            setIsLoading(false);
            return;
          }
        }

        // Fall back to loading from skills API
        if (!response.ok) {
          throw new Error("Failed to load workflow config");
        }
        const config: WorkflowConfig = await response.json();

        // Convert API response to WorkflowStep format
        const steps: WorkflowStep[] = config.phases.map((phase) => {
          // Find agents for this phase
          const phaseAgents = config.agents
            .filter((a) => a.phase === phase.id)
            .map((a) => ({
              id: a.id,
              name: a.name,
              description: a.description,
              prompt: a.prompt,
              skills: a.skills.map((s) => ({
                id: s,
                name: `/${s.replace("-", ":")}`,
                type: "claude" as const,
                enabled: true,
              })),
              mcpTools: [],
            }));

          return {
            id: phase.id,
            name: phase.name,
            phaseId: phase.id,
            prompt: phase.prompt,
            agents: phaseAgents,
          };
        });

        if (steps.length > 0) {
          setWorkflowSteps(steps);
        }
      } catch (error) {
        console.error("Error loading workflow config:", error);
        // Keep default steps on error
      } finally {
        setIsLoading(false);
      }
    }

    loadSavedWorkflow();
  }, [setNodes, setEdges]);

  // Track changes
  const markChanged = useCallback(() => {
    setHasChanges(true);
  }, []);

  // Save workflow configuration
  const saveWorkflow = useCallback(
    async (saveAs?: string, overwrite = false) => {
      try {
        setIsSaving(true);

        // Prepare workflow data
        const workflowData = {
          nodes: nodes.map((n) => ({
            id: n.id,
            type: n.type,
            position: n.position,
            data: n.data,
          })),
          edges: edges.map((e) => ({
            id: e.id,
            source: e.source,
            target: e.target,
            sourceHandle: e.sourceHandle,
            targetHandle: e.targetHandle,
            style: e.style,
            label: e.label,
            markerEnd: e.markerEnd,
            markerStart: e.markerStart,
            animated: e.animated,
          })),
          steps: workflowSteps,
        };

        // Save to a JSON file in user data directory
        const filename = saveAs || "workflow-config.json";
        const content = JSON.stringify(workflowData, null, 2);
        // Use .data/ for user data, not .flowspec/ (which is for tool configs)
        const relativePath = `.data/workflow-editor/${filename}`;

        if (overwrite) {
          // Use PUT to overwrite existing file with relative path
          const response = await fetch("/api/workflow-editor/skills", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              path: relativePath,
              content,
            }),
          });

          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || "Failed to save workflow");
          }
        } else {
          // Try POST first (create new)
          const response = await fetch("/api/workflow-editor/skills", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: filename.replace(".json", ""),
              type: "config",
              content,
            }),
          });

          if (!response.ok) {
            const error = await response.json();
            // If file exists, ask user if they want to overwrite
            if (response.status === 409) {
              const shouldOverwrite = window.confirm(
                `File "${filename}" already exists. Do you want to overwrite it?`,
              );
              if (shouldOverwrite) {
                return saveWorkflow(saveAs, true);
              } else {
                // Prompt for new filename
                const newFilename = window.prompt(
                  "Enter a new filename:",
                  `${filename.replace(".json", "")}-${Date.now()}.json`,
                );
                if (newFilename) {
                  return saveWorkflow(newFilename, false);
                }
                setIsSaving(false);
                return;
              }
            }
            throw new Error(error.error || "Failed to save workflow");
          }
        }

        setHasChanges(false);
        toast.success(saveAs ? `Saved as ${filename}` : "Workflow saved");
      } catch (error) {
        console.error("Error saving workflow:", error);
        toast.error(
          error instanceof Error ? error.message : "Failed to save workflow",
        );
      } finally {
        setIsSaving(false);
      }
    },
    [nodes, edges, workflowSteps],
  );

  // Save As - prompt for new filename
  const saveAsNew = useCallback(() => {
    const newFilename = window.prompt(
      "Enter filename for the new workflow config:",
      `workflow-config-${Date.now()}.json`,
    );
    if (newFilename) {
      const filename = newFilename.endsWith(".json")
        ? newFilename
        : `${newFilename}.json`;
      saveWorkflow(filename, false);
    }
  }, [saveWorkflow]);

  // Export as JSON (download)
  const exportWorkflow = useCallback(() => {
    const workflowData = {
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.type,
        position: n.position,
        data: n.data,
      })),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle,
        targetHandle: e.targetHandle,
        style: e.style,
        label: e.label,
        markerEnd: e.markerEnd,
        markerStart: e.markerStart,
        animated: e.animated,
      })),
      steps: workflowSteps,
    };

    const blob = new Blob([JSON.stringify(workflowData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "flowspec-workflow.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success("Workflow exported");
  }, [nodes, edges, workflowSteps]);

  // Handle new connections with validation
  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      // Validate connection: prevent connecting to same node
      if (connection.source === connection.target) {
        toast.error("Cannot connect a node to itself");
        return;
      }

      // Prevent connecting to the same handle on a node (multiple edges to same point)
      const existingEdges = edges.filter(
        (e) =>
          (e.target === connection.target &&
            e.targetHandle === connection.targetHandle) ||
          (e.source === connection.source &&
            e.sourceHandle === connection.sourceHandle),
      );

      if (existingEdges.length > 0) {
        // Check if this exact connection already exists
        const duplicateEdge = existingEdges.find(
          (e) =>
            e.source === connection.source &&
            e.target === connection.target &&
            e.sourceHandle === connection.sourceHandle &&
            e.targetHandle === connection.targetHandle,
        );

        if (duplicateEdge) {
          toast.error("This connection already exists");
          return;
        }

        // Allow multiple connections to different handles
      }

      const newEdge: Edge = {
        ...connection,
        id: `e-${connection.source}-${connection.target}-${Date.now()}`,
        type: "smoothstep",
        style: { stroke: "#6b7280", strokeWidth: 2 },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: "#6b7280",
          width: 14,
          height: 14,
        },
      };
      setEdges((eds) => addEdge(newEdge, eds));
      markChanged();
    },
    [setEdges, edges, markChanged],
  );

  // Handle edge reconnection (drag edge to new target)
  const onReconnect: OnReconnect = useCallback(
    (oldEdge: Edge, newConnection: Connection) => {
      // Validate: prevent connecting to same node
      if (newConnection.source === newConnection.target) {
        toast.error("Cannot connect a node to itself");
        return;
      }

      setEdges((eds) => reconnectEdge(oldEdge, newConnection, eds));
      markChanged();
    },
    [setEdges, markChanged],
  );

  // Handle edge click
  const onEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    setSelectedEdge(edge);
    setSelectedStep(null);
    setSelectedAgent(null);
    setSelectedOtherNode(null);
  }, []);

  // Handle node click
  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      // Check if it's a workflow step
      const step = workflowSteps.find((s) => s.id === node.id);
      if (step) {
        setSelectedStep(step);
        setSelectedAgent(null);
        setSelectedEdge(null);
        setSelectedOtherNode(null);
      } else if (node.type === "external" || node.type === "artifact") {
        // External or artifact node
        setSelectedOtherNode(node);
        setSelectedStep(null);
        setSelectedAgent(null);
        setSelectedEdge(null);
      } else {
        setSelectedEdge(null);
        setSelectedOtherNode(null);
      }
    },
    [workflowSteps],
  );

  // Handle pane click (deselect all)
  const onPaneClick = useCallback(() => {
    setSelectedEdge(null);
    setSelectedOtherNode(null);
  }, []);

  // Update other node (external/artifact)
  const handleUpdateOtherNode = useCallback(
    (updatedNode: Node) => {
      setNodes((nds) =>
        nds.map((n) => (n.id === updatedNode.id ? updatedNode : n)),
      );
      setSelectedOtherNode(updatedNode);
      markChanged();
    },
    [setNodes, markChanged],
  );

  // Add new node
  const addNode = useCallback(
    (type: "command" | "artifact" | "external") => {
      const id = `node-${nodeIdCounter.current++}`;
      const position = screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      });

      let newNode: Node;
      if (type === "command") {
        newNode = {
          id,
          type: "command",
          position,
          data: { label: "New Step", phaseId: "custom" },
        };
        // Add to workflow steps
        const newStep: WorkflowStep = {
          id,
          name: "New Step",
          phaseId: "custom",
          prompt: "",
          agents: [],
        };
        setWorkflowSteps((steps) => [...steps, newStep]);
      } else if (type === "artifact") {
        newNode = {
          id,
          type: "artifact",
          position,
          data: { items: ["New Item"] },
        };
      } else {
        newNode = {
          id,
          type: "external",
          position,
          data: { label: "External", phaseId: "custom" },
        };
      }

      setNodes((nds) => [...nds, newNode]);
      markChanged();
    },
    [screenToFlowPosition, setNodes, setWorkflowSteps, markChanged],
  );

  // Delete selected nodes
  const deleteSelectedNodes = useCallback(() => {
    setNodes((nds) => nds.filter((n) => !n.selected));
    setEdges((eds) =>
      eds.filter((e) => {
        const sourceNode = nodes.find((n) => n.id === e.source);
        const targetNode = nodes.find((n) => n.id === e.target);
        return (
          sourceNode &&
          targetNode &&
          !sourceNode.selected &&
          !targetNode.selected
        );
      }),
    );
    markChanged();
  }, [nodes, setNodes, setEdges, markChanged]);

  // Update edge
  const handleUpdateEdge = useCallback(
    (updatedEdge: Edge) => {
      setEdges((eds) =>
        eds.map((e) => (e.id === updatedEdge.id ? updatedEdge : e)),
      );
      setSelectedEdge(updatedEdge);
      markChanged();
    },
    [setEdges, markChanged],
  );

  // Delete edge
  const handleDeleteEdge = useCallback(
    (edgeId: string) => {
      setEdges((eds) => eds.filter((e) => e.id !== edgeId));
      markChanged();
    },
    [setEdges, markChanged],
  );

  // Update step
  const handleUpdateStep = useCallback(
    (updatedStep: WorkflowStep) => {
      setWorkflowSteps((steps) =>
        steps.map((s) => (s.id === updatedStep.id ? updatedStep : s)),
      );
      setSelectedStep(updatedStep);
      markChanged();
    },
    [markChanged],
  );

  // Update node label (when step name changes)
  const handleUpdateNodeLabel = useCallback(
    (nodeId: string, label: string) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, label } } : n,
        ),
      );
      markChanged();
    },
    [setNodes, markChanged],
  );

  // Update agent
  const handleUpdateAgent = useCallback(
    (updatedAgent: WorkflowAgent) => {
      if (!selectedStep) return;

      const updatedStep = {
        ...selectedStep,
        agents: selectedStep.agents.map((a) =>
          a.id === updatedAgent.id ? updatedAgent : a,
        ),
      };
      handleUpdateStep(updatedStep);
      setSelectedAgent(updatedAgent);
    },
    [selectedStep, handleUpdateStep],
  );

  // Close panel
  const handleClosePanel = useCallback(() => {
    setSelectedStep(null);
    setSelectedAgent(null);
    setSelectedEdge(null);
    setSelectedOtherNode(null);
  }, []);

  // Reset to default
  const resetToDefault = useCallback(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
    setWorkflowSteps(defaultWorkflowSteps);
    handleClosePanel();
    setHasChanges(false);
  }, [setNodes, setEdges, handleClosePanel]);

  return (
    <div className="h-full w-full flex" ref={reactFlowWrapper}>
      <div className="flex-1 relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onReconnect={onReconnect}
          onEdgeClick={onEdgeClick}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          nodeTypes={nodeTypes}
          defaultEdgeOptions={defaultEdgeOptions}
          connectionLineType={ConnectionLineType.SmoothStep}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          proOptions={{ hideAttribution: true }}
          className="bg-background"
          deleteKeyCode={["Backspace", "Delete"]}
          selectionKeyCode={["Shift"]}
          multiSelectionKeyCode={["Meta", "Control"]}
          snapToGrid
          snapGrid={[20, 20]}
        >
          <Background color="hsl(var(--muted-foreground))" gap={24} size={1} />
          <Controls className="!bg-card !border-border !shadow-md [&>button]:!bg-card [&>button]:!border-border [&>button]:!text-foreground [&>button:hover]:!bg-muted" />
          <MiniMap
            className="!bg-card !border-border"
            nodeColor={(n) => {
              if (n.type === "external") return "#eab308";
              if (n.type === "artifact") return "#3b82f6";
              return "#22c55e";
            }}
          />

          {/* Toolbar Panel */}
          <Panel position="top-left" className="flex gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button size="sm" variant="outline" className="gap-1.5">
                  <Plus className="h-4 w-4" />
                  Add Node
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-48 p-2" align="start">
                <div className="space-y-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start gap-2"
                    onClick={() => addNode("command")}
                  >
                    <Square className="h-4 w-4 text-primary" />
                    Workflow Step
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start gap-2"
                    onClick={() => addNode("artifact")}
                  >
                    <FileText className="h-4 w-4 text-blue-500" />
                    Artifact Box
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start gap-2"
                    onClick={() => addNode("external")}
                  >
                    <Circle className="h-4 w-4 text-yellow-500" />
                    External Node
                  </Button>
                </div>
              </PopoverContent>
            </Popover>

            <Button size="sm" variant="outline" onClick={deleteSelectedNodes}>
              <Trash2 className="h-4 w-4" />
            </Button>

            <Button size="sm" variant="outline" onClick={resetToDefault}>
              <RotateCcw className="h-4 w-4" />
            </Button>

            <div className="h-4 w-px bg-border mx-1" />

            <Button
              size="sm"
              variant={hasChanges ? "default" : "outline"}
              onClick={() => saveWorkflow()}
              disabled={isSaving}
              title="Save (overwrite existing)"
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={saveAsNew}
              disabled={isSaving}
              title="Save As New File"
            >
              <FilePlus className="h-4 w-4" />
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={exportWorkflow}
              title="Export JSON"
            >
              <Download className="h-4 w-4" />
            </Button>

            {isLoading && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Loading...
              </div>
            )}
          </Panel>

          {/* Instructions Panel */}
          <Panel
            position="bottom-left"
            className="text-xs text-muted-foreground bg-card/80 px-3 py-2 rounded-lg border border-border"
          >
            <div className="space-y-0.5">
              <div>
                <strong>Drag</strong> from handle to handle to connect
              </div>
              <div>
                <strong>Click</strong> edge to edit color/label/arrows
              </div>
              <div>
                <strong>Click</strong> step to configure agents
              </div>
              <div>
                <strong>Delete/Backspace</strong> to remove selected
              </div>
              <div className="pt-1 border-t border-border mt-1">
                <Save className="h-3 w-3 inline mr-1" /> Save |{" "}
                <FilePlus className="h-3 w-3 inline mr-1" /> Save As |{" "}
                <Download className="h-3 w-3 inline mr-1" /> Export
              </div>
            </div>
          </Panel>
        </ReactFlow>
      </div>

      {/* Edge Editor Panel */}
      {selectedEdge && !selectedStep && (
        <EdgeEditorPanel
          edge={selectedEdge}
          onClose={handleClosePanel}
          onUpdateEdge={handleUpdateEdge}
          onDeleteEdge={handleDeleteEdge}
        />
      )}

      {/* Step Configuration Panel - key forces remount on step change */}
      {selectedStep && !selectedAgent && (
        <StepConfigPanel
          key={selectedStep.id}
          step={selectedStep}
          onClose={handleClosePanel}
          onUpdateStep={handleUpdateStep}
          onSelectAgent={(agent) => setSelectedAgent(agent)}
          onUpdateNodeLabel={handleUpdateNodeLabel}
        />
      )}

      {/* Agent Configuration Panel */}
      {selectedStep && selectedAgent && (
        <AgentConfigPanel
          agent={selectedAgent}
          stepName={selectedStep.name}
          onClose={handleClosePanel}
          onUpdateAgent={handleUpdateAgent}
          onBack={() => setSelectedAgent(null)}
        />
      )}

      {/* Node Description Panel - for external and artifact nodes */}
      {selectedOtherNode && !selectedStep && !selectedAgent && (
        <NodeDescriptionPanel
          node={selectedOtherNode}
          onClose={handleClosePanel}
          onUpdate={handleUpdateOtherNode}
        />
      )}
    </div>
  );
}

export function FlowspecLoop() {
  return (
    <ReactFlowProvider>
      <FlowspecLoopInner />
    </ReactFlowProvider>
  );
}
