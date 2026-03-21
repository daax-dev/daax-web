/**
 * Flowspec Workflow Configuration Types
 *
 * These types mirror the flowspec_workflow.yml schema for use in
 * the visual workflow editor.
 */

// ============================================================================
// VALIDATION MODES
// ============================================================================

export type ValidationModeType = "NONE" | "KEYWORD" | "PULL_REQUEST";

export interface ValidationMode {
  type: ValidationModeType;
  keyword?: string; // Only for KEYWORD type
}

export const VALIDATION_MODES: Record<
  ValidationModeType,
  {
    label: string;
    description: string;
    requiresInput: boolean;
    inputPlaceholder?: string;
  }
> = {
  NONE: {
    label: "None",
    description: "Automatic transition after artifacts created",
    requiresInput: false,
  },
  KEYWORD: {
    label: "Keyword",
    description: "User must type exact keyword to proceed",
    requiresInput: true,
    inputPlaceholder: "APPROVED",
  },
  PULL_REQUEST: {
    label: "Pull Request",
    description: "Blocked until PR containing artifact is merged",
    requiresInput: false,
  },
};

// ============================================================================
// AGENT DEFINITIONS
// ============================================================================

export interface AgentAssignment {
  name: string;
  identity: string; // e.g., "@pm-planner"
  description: string;
  responsibilities: string[];
}

export interface AgentInfo {
  name: string;
  identity: string;
  description: string;
  loop: "inner" | "outer";
  responsibilities: string[];
  tools?: string[];
}

// ============================================================================
// WORKFLOW DEFINITIONS
// ============================================================================

export interface WorkflowStep {
  id: string; // e.g., "assess", "specify"
  command: string; // e.g., "/flow:assess"
  description: string;
  agents: AgentAssignment[];
  input_states: string[];
  output_state: string;
  optional: boolean;
  execution_mode?: "sequential" | "parallel";
  creates_backlog_tasks?: boolean;
  requires_backlog_tasks?: boolean;
  builds_constitution?: boolean;
  requires_human_approval?: boolean;
  prompt_template?: string; // Path to prompt file
}

// ============================================================================
// STATE DEFINITIONS
// ============================================================================

export interface WorkflowState {
  name: string;
  description?: string;
}

// ============================================================================
// TRANSITION DEFINITIONS
// ============================================================================

export interface ArtifactReference {
  type: string;
  path: string;
  required?: boolean;
  multiple?: boolean;
}

export interface WorkflowTransition {
  name: string;
  from: string;
  to: string;
  via: string; // Workflow that triggers this transition
  description: string;
  input_artifacts?: ArtifactReference[];
  output_artifacts?: ArtifactReference[];
  validation: ValidationMode;
}

// ============================================================================
// ROLE DEFINITIONS
// ============================================================================

export interface RoleDefinition {
  display_name: string;
  icon: string;
  commands: string[];
  agents: string[];
}

export interface RolesConfig {
  primary: string;
  show_all_commands: boolean;
  definitions: Record<string, RoleDefinition>;
}

// ============================================================================
// AGENT LOOP CLASSIFICATION
// ============================================================================

export interface AgentLoopConfig {
  inner: {
    description: string;
    agents: string[];
  };
  outer: {
    description: string;
    agents: string[];
  };
}

// ============================================================================
// METADATA
// ============================================================================

export interface WorkflowMetadata {
  schema_version: string;
  last_updated: string;
  state_count: number;
  workflow_count: number;
  agent_count: number;
  inner_loop_agent_count: number;
  outer_loop_agent_count: number;
  transition_count: number;
}

// ============================================================================
// FULL CONFIGURATION
// ============================================================================

export interface FlowspecWorkflowConfig {
  version: string;
  roles: RolesConfig;
  states: string[];
  workflows: Record<string, WorkflowStep>;
  transitions: WorkflowTransition[];
  agent_loops: AgentLoopConfig;
  metadata: WorkflowMetadata;
}

// ============================================================================
// REACT FLOW NODE/EDGE TYPES
// ============================================================================

export interface WorkflowNodeData extends Record<string, unknown> {
  label: string;
  type: "state" | "workflow";
  state?: WorkflowState;
  workflow?: WorkflowStep;
  isStart?: boolean;
  isEnd?: boolean;
}

export interface WorkflowEdgeData extends Record<string, unknown> {
  transition: WorkflowTransition;
  validation: ValidationMode;
}

// ============================================================================
// EDITOR STATE
// ============================================================================

export interface WorkflowEditorState {
  config: FlowspecWorkflowConfig | null;
  configPath: string | null;
  isDirty: boolean;
  selectedNode: string | null;
  selectedEdge: string | null;
  error: string | null;
}

// ============================================================================
// API TYPES
// ============================================================================

export interface WorkflowConfigLoadRequest {
  projectPath: string;
}

export interface WorkflowConfigSaveRequest {
  projectPath: string;
  config: FlowspecWorkflowConfig;
}

export interface WorkflowConfigValidateResponse {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface PromptTemplateInfo {
  name: string;
  path: string;
  description: string;
  loop: "inner" | "outer";
}

export interface AvailableAgentsResponse {
  agents: AgentInfo[];
}

export interface AvailablePromptsResponse {
  prompts: PromptTemplateInfo[];
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Parse validation mode string from YAML (e.g., 'KEYWORD["APPROVED"]') to structured format
 */
export function parseValidationMode(raw: string): ValidationMode {
  if (raw === "NONE") {
    return { type: "NONE" };
  }
  if (raw === "PULL_REQUEST") {
    return { type: "PULL_REQUEST" };
  }
  const keywordMatch = raw.match(/^KEYWORD\["(.+)"\]$/);
  if (keywordMatch) {
    return { type: "KEYWORD", keyword: keywordMatch[1] };
  }
  // Default to NONE if unrecognized
  return { type: "NONE" };
}

/**
 * Serialize validation mode to YAML string format
 */
export function serializeValidationMode(mode: ValidationMode): string {
  switch (mode.type) {
    case "NONE":
      return "NONE";
    case "PULL_REQUEST":
      return "PULL_REQUEST";
    case "KEYWORD":
      return `KEYWORD["${mode.keyword || "APPROVED"}"]`;
    default:
      return "NONE";
  }
}

/**
 * Get default workflow step template
 */
export function createDefaultWorkflowStep(id: string): WorkflowStep {
  return {
    id,
    command: `/flow:${id}`,
    description: `Execute ${id} workflow`,
    agents: [],
    input_states: [],
    output_state: "",
    optional: false,
  };
}

/**
 * Get default transition template
 */
export function createDefaultTransition(
  name: string,
  from: string,
  to: string,
  via: string,
): WorkflowTransition {
  return {
    name,
    from,
    to,
    via,
    description: `Transition from ${from} to ${to}`,
    validation: { type: "NONE" },
  };
}
