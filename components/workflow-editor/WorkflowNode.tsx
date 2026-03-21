"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { cn } from "@/lib/utils";
import type {
  WorkflowNodeData,
  AgentAssignment,
} from "@/types/flowspec-workflow";
import {
  ClipboardCheck,
  FileText,
  Search,
  GitBranch,
  Code,
  CheckCircle,
  Rocket,
  GitPullRequest,
  Circle,
  Flag,
  Workflow,
} from "lucide-react";

const workflowIcons: Record<string, React.ElementType> = {
  assess: ClipboardCheck,
  specify: FileText,
  research: Search,
  plan: GitBranch,
  implement: Code,
  validate: CheckCircle,
  operate: Rocket,
  "submit-n-watch-pr": GitPullRequest,
};

type WorkflowNode = Node<WorkflowNodeData>;

/**
 * Custom node component for workflow states
 */
export const StateNode = memo(function StateNode({
  data,
  selected,
}: NodeProps<WorkflowNode>) {
  const nodeData = data as WorkflowNodeData;
  const isStart = nodeData.isStart;
  const isEnd = nodeData.isEnd;

  return (
    <div
      className={cn(
        "px-5 py-3 rounded-lg border-2 min-w-[120px] text-center transition-all",
        "bg-background shadow-sm",
        selected && "ring-2 ring-primary ring-offset-2",
        isStart && "border-green-500 bg-green-500/10",
        isEnd && "border-primary bg-primary/10",
        !isStart && !isEnd && "border-border hover:border-muted-foreground",
      )}
    >
      {/* Left handle for incoming connections */}
      {!isStart && (
        <Handle
          type="target"
          position={Position.Left}
          className="!bg-primary !w-3 !h-3 !border-2 !border-background"
        />
      )}
      <div className="flex items-center justify-center gap-2">
        {isStart && (
          <Circle className="h-4 w-4 fill-green-500 text-green-500" />
        )}
        {isEnd && <Flag className="h-4 w-4 text-primary" />}
        <span className="font-semibold text-sm">{nodeData.label}</span>
      </div>
      {/* Right handle for outgoing connections */}
      {!isEnd && (
        <Handle
          type="source"
          position={Position.Right}
          className="!bg-primary !w-3 !h-3 !border-2 !border-background"
        />
      )}
    </div>
  );
});

/**
 * Custom node component for workflow steps
 */
export const WorkflowStepNode = memo(function WorkflowStepNode({
  data,
  selected,
}: NodeProps<WorkflowNode>) {
  const nodeData = data as WorkflowNodeData;
  const workflow = nodeData.workflow;
  const workflowId = workflow?.id || "unknown";
  const Icon = workflowIcons[workflowId] || Workflow;
  const isOptional = workflow?.optional;

  return (
    <div
      className={cn(
        "px-4 py-3 rounded-xl border-2 min-w-[160px] transition-all",
        "bg-card shadow-md",
        selected && "ring-2 ring-primary ring-offset-2",
        isOptional
          ? "border-dashed border-muted-foreground/50"
          : "border-primary/50",
        "hover:border-primary",
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-primary !w-3 !h-3 !border-2 !border-background"
      />
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-md bg-primary/10">
            <Icon className="h-4 w-4 text-primary" />
          </div>
          <span className="font-semibold text-sm">{nodeData.label}</span>
        </div>
        {workflow && (
          <div className="flex flex-wrap gap-1 mt-1">
            {workflow.agents.slice(0, 2).map((agent: AgentAssignment) => (
              <span
                key={agent.name}
                className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
              >
                {agent.name.split("-")[0]}
              </span>
            ))}
            {workflow.agents.length > 2 && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                +{workflow.agents.length - 2}
              </span>
            )}
          </div>
        )}
        {isOptional && (
          <span className="text-xs text-muted-foreground italic">optional</span>
        )}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!bg-primary !w-3 !h-3 !border-2 !border-background"
      />
    </div>
  );
});

/**
 * Node types for React Flow registration
 */
export const nodeTypes = {
  stateNode: StateNode,
  workflowNode: WorkflowStepNode,
};
