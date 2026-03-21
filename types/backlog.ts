/**
 * Backlog.md Type Definitions
 *
 * This file re-exports types from lib/backlog/types.ts which is the authoritative
 * source for Backlog.md integration types. Additional Daax-specific types are added here.
 */

// Re-export all types from lib/backlog/types
export type {
  TaskStatus,
  TaskPriority,
  TaskSource,
  AcceptanceCriterion,
  AcceptanceCriterionInput,
  Task,
  TaskCreateInput,
  TaskUpdateInput,
  TaskListFilter,
  Milestone,
  MilestoneBucket,
  MilestoneSummary,
  Decision,
  DocumentType,
  Document,
  SearchResultType,
  SearchPriorityFilter,
  SearchMatch,
  SearchFilters,
  SearchOptions,
  TaskSearchResult,
  DocumentSearchResult,
  DecisionSearchResult,
  SearchResult,
  Sequence,
  BacklogConfig,
  ParsedMarkdown,
  DaaxDecision,
  TaskListResponse,
  TaskResponse,
  DocumentListResponse,
  DocumentResponse,
  DecisionListResponse,
  DecisionResponse,
  MilestoneListResponse,
  MilestoneSummaryResponse,
  SearchResponse,
  ConfigResponse,
  ErrorResponse,
} from '../lib/backlog/types';

export { isLocalEditableTask, isDaaxDecision } from '../lib/backlog/types';

// Daax-specific multi-backlog types
import type { Task, Document, Decision, Milestone, BacklogConfig } from '../lib/backlog/types';

export interface BacklogProject {
  path: string;                // Absolute path to project directory
  name: string;                // From config.yml
  tasks: Task[];
  documents: Document[];
  decisions: Decision[];
  milestones: Milestone[];
  config: BacklogConfig;

  // Metadata
  taskCount?: number;
  lastUpdated?: string;
}

// API Response Types for multi-backlog endpoints
export interface BacklogProjectsResponse {
  projects: BacklogProject[];
}

export interface BacklogTasksResponse {
  tasks: Task[];
  project: string;
  total: number;
}

export interface BacklogTaskUpdateRequest {
  project: string;
  taskId: string;
  updates: Partial<Task>;
}

// Multi-Store Event Types
export type BacklogStoreEvent =
  | 'projects-loaded'
  | 'project-loaded'
  | 'project-switched'
  | 'project-error'
  | 'project-removed'
  | 'tasks-updated'
  | 'task-created'
  | 'task-updated'
  | 'task-deleted'
  | 'error';

export interface BacklogStoreEventData {
  event: BacklogStoreEvent;
  projectPath?: string;
  taskId?: string;
  error?: Error;
  errorType?: 'missing' | 'read-error';
  data?: unknown;
}
