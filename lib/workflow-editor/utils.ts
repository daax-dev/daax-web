/**
 * Workflow Editor Utilities
 *
 * Functions for transforming flowspec_workflow.yml config
 * into React Flow nodes and edges.
 */

import type { Node, Edge } from "@xyflow/react";
import type {
  FlowspecWorkflowConfig,
  WorkflowStep,
  WorkflowNodeData,
  WorkflowEdgeData,
  ValidationMode,
} from "@/types/flowspec-workflow";

type FlowNode = Node<WorkflowNodeData>;
type FlowEdge = Edge<WorkflowEdgeData>;

// Layout constants - compact horizontal flow
const STATE_WIDTH = 120;
const STATE_HEIGHT = 40;
const WORKFLOW_WIDTH = 160;
const WORKFLOW_HEIGHT = 50;
const STATE_GAP = 140; // Gap between states
const WORKFLOW_Y_OFFSET = 80; // How far below states the workflow nodes sit

/**
 * Transform workflow config into React Flow nodes with optimized layout
 */
export function configToNodes(config: FlowspecWorkflowConfig): FlowNode[] {
  const nodes: FlowNode[] = [];

  // Calculate state positions (single row at top)
  const statePositions = new Map<string, { x: number; y: number }>();
  const stateIndices = new Map<string, number>();

  config.states.forEach((state, index) => {
    stateIndices.set(state, index);
    statePositions.set(state, {
      x: 50 + index * (STATE_WIDTH + STATE_GAP),
      y: 30,
    });
  });

  // Create state nodes
  config.states.forEach((state) => {
    const position = statePositions.get(state)!;
    nodes.push({
      id: `state-${slugify(state)}`,
      type: "stateNode",
      position,
      data: {
        label: state,
        type: "state",
        state: { name: state },
        isStart: state === "To Do",
        isEnd: config.states[config.states.length - 1] === state,
      },
    });
  });

  // Create workflow nodes - position them between their connecting states
  // Track Y positions to avoid overlaps
  const workflowRows: {
    id: string;
    startX: number;
    endX: number;
    y: number;
  }[] = [];

  Object.entries(config.workflows).forEach(([id, workflow]) => {
    const inputState = workflow.input_states[0];
    const outputState = workflow.output_state;
    const inputPos = statePositions.get(inputState);
    const outputPos = statePositions.get(outputState);

    if (!inputPos || !outputPos) return;

    // Position workflow centered between input and output states
    const x = (inputPos.x + outputPos.x) / 2;

    // Find the best Y position (avoid overlaps)
    let y = 30 + STATE_HEIGHT + WORKFLOW_Y_OFFSET;

    // Check for overlaps with existing workflows
    const minX = Math.min(inputPos.x, outputPos.x);
    const maxX = Math.max(inputPos.x, outputPos.x);

    for (const existing of workflowRows) {
      // Check if this workflow overlaps horizontally with existing
      if (!(maxX < existing.startX || minX > existing.endX)) {
        // Overlaps - move down
        y = Math.max(y, existing.y + WORKFLOW_HEIGHT + 30);
      }
    }

    workflowRows.push({ id, startX: minX, endX: maxX, y });

    nodes.push({
      id: `workflow-${id}`,
      type: "workflowNode",
      position: { x, y },
      data: {
        label: workflow.command,
        type: "workflow",
        workflow: { ...workflow, id },
      },
    });
  });

  return nodes;
}

/**
 * Calculate optimal viewport to fit all nodes
 */
export function calculateFitView(nodes: FlowNode[]): {
  x: number;
  y: number;
  zoom: number;
} {
  if (nodes.length === 0) return { x: 0, y: 0, zoom: 1 };

  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;

  nodes.forEach((node) => {
    minX = Math.min(minX, node.position.x);
    maxX = Math.max(
      maxX,
      node.position.x +
        (node.type === "stateNode" ? STATE_WIDTH : WORKFLOW_WIDTH),
    );
    minY = Math.min(minY, node.position.y);
    maxY = Math.max(
      maxY,
      node.position.y +
        (node.type === "stateNode" ? STATE_HEIGHT : WORKFLOW_HEIGHT),
    );
  });

  const contentWidth = maxX - minX + 100; // padding
  const contentHeight = maxY - minY + 100;

  return {
    x: -minX + 50,
    y: -minY + 20,
    zoom: 1,
  };
}

/**
 * Transform workflow config into React Flow edges
 */
export function configToEdges(config: FlowspecWorkflowConfig): FlowEdge[] {
  const edges: FlowEdge[] = [];

  config.transitions.forEach((transition, index) => {
    const sourceId = `state-${slugify(transition.from)}`;
    const targetId = `state-${slugify(transition.to)}`;
    const workflowId =
      transition.via !== "manual" &&
      transition.via !== "rework" &&
      transition.via !== "rollback"
        ? `workflow-${transition.via}`
        : null;

    // Check if connected workflow is optional (for dotted lines)
    const workflow = config.workflows[transition.via];
    const isOptional = workflow?.optional === true;
    const optionalStyle = isOptional
      ? { strokeDasharray: "5,5", opacity: 0.7 }
      : undefined;

    // Edge from source state to workflow (if workflow exists)
    if (workflowId && workflow) {
      edges.push({
        id: `edge-${index}-to-workflow`,
        source: sourceId,
        target: workflowId,
        type: "smoothstep",
        animated: false,
        style: optionalStyle,
        data: {
          transition,
          validation: transition.validation,
        },
      });

      // Edge from workflow to target state
      edges.push({
        id: `edge-${index}-from-workflow`,
        source: workflowId,
        target: targetId,
        type: "smoothstep",
        animated: false,
        style: optionalStyle,
        data: {
          transition,
          validation: transition.validation,
        },
      });
    } else {
      // Direct edge for manual/rework/rollback transitions
      edges.push({
        id: `edge-${index}-direct`,
        source: sourceId,
        target: targetId,
        type: "smoothstep",
        animated: transition.via === "rollback",
        style:
          transition.via === "rollback"
            ? { stroke: "var(--destructive)" }
            : undefined,
        data: {
          transition,
          validation: transition.validation,
        },
      });
    }
  });

  return edges;
}

/**
 * Create a slug from a state name
 */
export function slugify(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "-");
}

/**
 * Parse a YAML file string to config object
 * Note: In production, this should use proper YAML parsing
 */
export function parseWorkflowYaml(
  yamlContent: string,
): FlowspecWorkflowConfig | null {
  // This is a placeholder - actual implementation would use js-yaml or similar
  // The API route will handle actual YAML parsing server-side
  return null;
}

/**
 * Serialize config object to YAML string
 * Note: In production, this should use proper YAML serialization
 */
export function serializeWorkflowYaml(config: FlowspecWorkflowConfig): string {
  // This is a placeholder - actual implementation would use js-yaml or similar
  // The API route will handle actual YAML serialization server-side
  return "";
}

/**
 * Get color for validation mode badge
 */
export function getValidationModeColor(mode: ValidationMode): string {
  switch (mode.type) {
    case "NONE":
      return "bg-muted text-muted-foreground";
    case "KEYWORD":
      return "bg-yellow-500/20 text-yellow-600 dark:text-yellow-400";
    case "PULL_REQUEST":
      return "bg-blue-500/20 text-blue-600 dark:text-blue-400";
    default:
      return "bg-muted text-muted-foreground";
  }
}

/**
 * Get icon name for workflow step
 */
export function getWorkflowIcon(workflowId: string): string {
  const icons: Record<string, string> = {
    assess: "ClipboardCheck",
    specify: "FileText",
    research: "Search",
    plan: "GitBranch",
    implement: "Code",
    validate: "CheckCircle",
    operate: "Rocket",
    "submit-n-watch-pr": "GitPullRequest",
  };
  return icons[workflowId] || "Workflow";
}

/**
 * Get color for agent loop type
 */
export function getAgentLoopColor(loop: "inner" | "outer"): string {
  return loop === "inner"
    ? "bg-green-500/20 text-green-600 dark:text-green-400"
    : "bg-purple-500/20 text-purple-600 dark:text-purple-400";
}

/**
 * Check if a state is reachable from another state
 */
export function isStateReachable(
  config: FlowspecWorkflowConfig,
  from: string,
  to: string,
  visited: Set<string> = new Set(),
): boolean {
  if (from === to) return true;
  if (visited.has(from)) return false;

  visited.add(from);

  const outgoingTransitions = config.transitions.filter((t) => t.from === from);
  for (const transition of outgoingTransitions) {
    if (isStateReachable(config, transition.to, to, visited)) {
      return true;
    }
  }

  return false;
}

/**
 * Get all workflows that can run from a given state
 */
export function getValidWorkflowsForState(
  config: FlowspecWorkflowConfig,
  state: string,
): WorkflowStep[] {
  return Object.entries(config.workflows)
    .filter(([, workflow]) => workflow.input_states.includes(state))
    .map(([id, workflow]) => ({ ...workflow, id }));
}

/**
 * Validate workflow config for common issues
 */
export function validateWorkflowConfig(config: FlowspecWorkflowConfig): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check for orphan states (no incoming or outgoing transitions)
  const statesWithIncoming = new Set(config.transitions.map((t) => t.to));
  const statesWithOutgoing = new Set(config.transitions.map((t) => t.from));

  config.states.forEach((state) => {
    if (state !== "To Do" && !statesWithIncoming.has(state)) {
      warnings.push(`State "${state}" has no incoming transitions`);
    }
    if (state !== "Done" && !statesWithOutgoing.has(state)) {
      warnings.push(`State "${state}" has no outgoing transitions`);
    }
  });

  // Check for workflows with no transitions
  Object.keys(config.workflows).forEach((workflowId) => {
    const hasTransition = config.transitions.some((t) => t.via === workflowId);
    if (!hasTransition) {
      warnings.push(`Workflow "${workflowId}" has no associated transitions`);
    }
  });

  // Check for required fields
  if (!config.version) {
    errors.push("Missing version field");
  }
  if (!config.states || config.states.length === 0) {
    errors.push("No states defined");
  }
  if (!config.workflows || Object.keys(config.workflows).length === 0) {
    errors.push("No workflows defined");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
