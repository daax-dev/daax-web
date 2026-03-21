/**
 * Backlog.md Integration Types
 *
 * Type definitions for integrating with Backlog.md task management system.
 * Ported from Backlog.md src/types/index.ts with minimal adaptations for Daax.
 *
 * @see https://github.com/adastreamer/Backlog.md
 */

// ============================================================================
// Task Types
// ============================================================================

export type TaskStatus = string;

export type TaskPriority = "high" | "medium" | "low";

export type TaskSource = "local" | "remote" | "completed" | "local-branch";

/**
 * Structured Acceptance Criterion
 * Used in tasks to track completion requirements with checkbox state
 */
export interface AcceptanceCriterion {
  /** 1-based index */
  index: number;
  /** Criterion description text */
  text: string;
  /** Whether this criterion is checked/completed */
  checked: boolean;
}

/**
 * Input format for creating/updating acceptance criteria
 */
export interface AcceptanceCriterionInput {
  text: string;
  checked?: boolean;
}

/**
 * Core Task entity from Backlog.md
 * Represents a single work item with metadata, status tracking, and acceptance criteria
 */
export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  assignee: string[];
  reporter?: string;
  createdDate: string;
  updatedDate?: string;
  labels: string[];
  milestone?: string;
  dependencies: string[];

  /** Raw markdown content without frontmatter (read-only: do not modify directly) */
  readonly rawContent?: string;

  description?: string;
  implementationPlan?: string;
  implementationNotes?: string;

  /** Structured acceptance criteria parsed from body (checked state + text + index) */
  acceptanceCriteriaItems?: AcceptanceCriterion[];

  parentTaskId?: string;
  subtasks?: string[];
  priority?: TaskPriority;
  branch?: string;
  ordinal?: number;
  filePath?: string;

  // Metadata fields
  lastModified?: Date;
  source?: TaskSource;

  /** Optional per-task callback command to run on status change (overrides global config) */
  onStatusChange?: string;
}

/**
 * Check if a task is locally editable (not from a remote or other local branch)
 */
export function isLocalEditableTask(task: Task): boolean {
  return (
    task.source === undefined ||
    task.source === "local" ||
    task.source === "completed"
  );
}

/**
 * Input for creating a new task
 */
export interface TaskCreateInput {
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  milestone?: string;
  labels?: string[];
  assignee?: string[];
  dependencies?: string[];
  parentTaskId?: string;
  implementationPlan?: string;
  implementationNotes?: string;
  acceptanceCriteria?: AcceptanceCriterionInput[];
  rawContent?: string;
}

/**
 * Input for updating an existing task
 * Supports both replacement and append/remove operations for arrays
 */
export interface TaskUpdateInput {
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  milestone?: string | null;
  labels?: string[];
  addLabels?: string[];
  removeLabels?: string[];
  assignee?: string[];
  ordinal?: number;
  dependencies?: string[];
  addDependencies?: string[];
  removeDependencies?: string[];
  implementationPlan?: string;
  appendImplementationPlan?: string[];
  clearImplementationPlan?: boolean;
  implementationNotes?: string;
  appendImplementationNotes?: string[];
  clearImplementationNotes?: boolean;
  acceptanceCriteria?: AcceptanceCriterionInput[];
  addAcceptanceCriteria?: Array<AcceptanceCriterionInput | string>;
  removeAcceptanceCriteria?: number[];
  checkAcceptanceCriteria?: number[];
  uncheckAcceptanceCriteria?: number[];
  rawContent?: string;
}

/**
 * Filter options for listing tasks
 */
export interface TaskListFilter {
  status?: string;
  assignee?: string;
  priority?: TaskPriority;
  parentTaskId?: string;
  labels?: string[];
}

// ============================================================================
// Milestone Types
// ============================================================================

/**
 * Milestone entity from Backlog.md
 */
export interface Milestone {
  id: string;
  title: string;
  description: string;
  /** Raw markdown content without frontmatter */
  readonly rawContent: string;
}

/**
 * Grouped tasks by milestone for display
 */
export interface MilestoneBucket {
  key: string;
  label: string;
  milestone?: string;
  isNoMilestone: boolean;
  tasks: Task[];
  statusCounts: Record<string, number>;
  total: number;
  doneCount: number;
  progress: number;
}

/**
 * Summary of all milestones with their tasks
 */
export interface MilestoneSummary {
  milestones: string[];
  buckets: MilestoneBucket[];
}

// ============================================================================
// Decision Types (Backlog.md format)
// ============================================================================

/**
 * Decision entity from Backlog.md (markdown-based ADR format)
 *
 * NOTE: This is different from Daax's local decision log format.
 * For Daax JSONL decision logs, see DaaxDecision below.
 */
export interface Decision {
  id: string;
  title: string;
  date: string;
  status: "proposed" | "accepted" | "rejected" | "superseded";
  context: string;
  decision: string;
  consequences: string;
  alternatives?: string;
  /** Raw markdown content without frontmatter */
  readonly rawContent: string;
}

// ============================================================================
// Document Types
// ============================================================================

export type DocumentType = "readme" | "guide" | "specification" | "other";

/**
 * Document entity from Backlog.md
 */
export interface Document {
  id: string;
  title: string;
  type: DocumentType;
  createdDate: string;
  updatedDate?: string;
  /** Raw markdown content without frontmatter */
  rawContent: string;
  tags?: string[];

  // Web UI specific fields
  name?: string;
  path?: string;
  lastModified?: string;
}

// ============================================================================
// Search Types
// ============================================================================

export type SearchResultType = "task" | "document" | "decision";

export type SearchPriorityFilter = "high" | "medium" | "low";

/**
 * Match information from fuzzy search
 */
export interface SearchMatch {
  key?: string;
  indices: Array<[number, number]>;
  value?: unknown;
}

/**
 * Filter options for search
 */
export interface SearchFilters {
  status?: string | string[];
  priority?: SearchPriorityFilter | SearchPriorityFilter[];
  assignee?: string | string[];
  labels?: string | string[];
}

/**
 * Search options
 */
export interface SearchOptions {
  query?: string;
  limit?: number;
  types?: SearchResultType[];
  filters?: SearchFilters;
}

/**
 * Task search result
 */
export interface TaskSearchResult {
  type: "task";
  score: number | null;
  task: Task;
  matches?: SearchMatch[];
}

/**
 * Document search result
 */
export interface DocumentSearchResult {
  type: "document";
  score: number | null;
  document: Document;
  matches?: SearchMatch[];
}

/**
 * Decision search result
 */
export interface DecisionSearchResult {
  type: "decision";
  score: number | null;
  decision: Decision;
  matches?: SearchMatch[];
}

/**
 * Union type for all search results
 */
export type SearchResult =
  | TaskSearchResult
  | DocumentSearchResult
  | DecisionSearchResult;

// ============================================================================
// Sequence Types (for dependency ordering)
// ============================================================================

/**
 * Sequence of tasks that can be executed in parallel
 */
export interface Sequence {
  /** 1-based sequence index */
  index: number;
  /** Tasks that can be executed in parallel within this sequence */
  tasks: Task[];
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Backlog.md project configuration
 */
export interface BacklogConfig {
  projectName: string;
  defaultAssignee?: string;
  defaultReporter?: string;
  statuses: string[];
  labels: string[];
  milestones: string[];
  defaultStatus?: string;
  dateFormat: string;
  maxColumnWidth?: number;
  taskResolutionStrategy?: "most_recent" | "most_progressed";
  defaultEditor?: string;
  autoOpenBrowser?: boolean;
  defaultPort?: number;
  remoteOperations?: boolean;
  autoCommit?: boolean;
  zeroPaddedIds?: number;
  /** Timezone preference: 'UTC', 'America/New_York', or 'local' */
  timezonePreference?: string;
  /** Whether to include time in new dates */
  includeDateTimeInDates?: boolean;
  bypassGitHooks?: boolean;
  /** Check task states across active branches (default: true) */
  checkActiveBranches?: boolean;
  /** How many days a branch is considered active (default: 30) */
  activeBranchDays?: number;
  /** Global callback command to run on any task status change. Supports $TASK_ID, $OLD_STATUS, $NEW_STATUS, $TASK_TITLE variables. */
  onStatusChange?: string;
  mcp?: {
    http?: {
      host?: string;
      port?: number;
      auth?: {
        type?: "bearer" | "basic" | "none";
        token?: string;
        username?: string;
        password?: string;
      };
      cors?: {
        origin?: string | string[];
        credentials?: boolean;
      };
      enableDnsRebindingProtection?: boolean;
      allowedHosts?: string[];
      allowedOrigins?: string[];
    };
  };
}

/**
 * Parsed markdown with frontmatter
 */
export interface ParsedMarkdown {
  frontmatter: Record<string, unknown>;
  content: string;
}

// ============================================================================
// Daax-Specific Types
// ============================================================================

/**
 * Daax Decision Log Entry (JSONL format)
 *
 * This is the format used for Daax's local decision logs stored in
 * .logs/decisions/*.jsonl files. This is SEPARATE from Backlog.md's Decision
 * type which is markdown-based.
 *
 * Each line in a decision log file is a JSON object with this structure.
 *
 * @example
 * ```json
 * {
 *   "id": "D001",
 *   "timestamp": "2026-01-04T10:30:00Z",
 *   "title": "Use TypeScript for type safety",
 *   "context": "Need strong typing for API contracts",
 *   "decision": "Use TypeScript with strict mode enabled",
 *   "alternatives": ["JavaScript with JSDoc", "Flow"],
 *   "consequences": ["Better IDE support", "Longer build times"],
 *   "status": "accepted"
 * }
 * ```
 */
export interface DaaxDecision {
  /** Unique identifier (e.g., "D001", "ARCH-001") */
  id: string;
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Short title/summary of the decision */
  title: string;
  /** Background context explaining why this decision is needed */
  context: string;
  /** The actual decision made */
  decision: string;
  /** Alternative options that were considered */
  alternatives: string[];
  /** Consequences and implications of this decision */
  consequences: string[];
  /** Current status of the decision */
  status: "accepted" | "proposed" | "rejected" | "superseded";
  /** Optional tags for categorization */
  tags?: string[];
  /** Optional reference to related task */
  taskId?: string;
}

/**
 * Type guard to check if a record is a DaaxDecision
 */
export function isDaaxDecision(record: unknown): record is DaaxDecision {
  if (!record || typeof record !== "object") return false;

  const r = record as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    typeof r.timestamp === "string" &&
    typeof r.title === "string" &&
    typeof r.context === "string" &&
    typeof r.decision === "string" &&
    Array.isArray(r.alternatives) &&
    Array.isArray(r.consequences) &&
    (r.status === "accepted" ||
      r.status === "proposed" ||
      r.status === "rejected" ||
      r.status === "superseded")
  );
}

// ============================================================================
// API Response Types
// ============================================================================

/**
 * Response for task list endpoint
 */
export interface TaskListResponse {
  tasks: Task[];
  total: number;
}

/**
 * Response for single task endpoint
 */
export interface TaskResponse {
  task: Task;
}

/**
 * Response for document list endpoint
 */
export interface DocumentListResponse {
  documents: Document[];
  total: number;
}

/**
 * Response for single document endpoint
 */
export interface DocumentResponse {
  document: Document;
}

/**
 * Response for decision list endpoint
 */
export interface DecisionListResponse {
  decisions: Decision[];
  total: number;
}

/**
 * Response for single decision endpoint
 */
export interface DecisionResponse {
  decision: Decision;
}

/**
 * Response for milestone list endpoint
 */
export interface MilestoneListResponse {
  milestones: Milestone[];
  total: number;
}

/**
 * Response for milestone summary endpoint
 */
export interface MilestoneSummaryResponse {
  summary: MilestoneSummary;
}

/**
 * Response for search endpoint
 */
export interface SearchResponse {
  results: SearchResult[];
  total: number;
  query?: string;
}

/**
 * Response for config endpoint
 */
export interface ConfigResponse {
  config: BacklogConfig;
}

/**
 * Generic error response
 */
export interface ErrorResponse {
  error: string;
  message: string;
  details?: unknown;
}
