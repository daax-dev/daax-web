/**
 * Backlog.md API Client
 *
 * Client-side library for interacting with the Backlog.md API
 * through Daax's proxy routes.
 */

import type {
  Task,
  TaskCreateInput,
  TaskUpdateInput,
  TaskListFilter,
  BacklogConfig,
  Document,
  Decision,
  Milestone,
  MilestoneSummary,
  SearchResult,
  SearchOptions,
} from "./types";

// ============================================================================
// Types
// ============================================================================

export interface BacklogServerStatus {
  running: boolean;
  healthy: boolean;
  port?: number;
  project?: string;
  pid?: number;
  uptime?: number;
}

export interface BacklogStatistics {
  total: number;
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
  byAssignee: Record<string, number>;
  byMilestone: Record<string, number>;
  completedThisWeek?: number;
  createdThisWeek?: number;
}

export interface Draft {
  id: string;
  content: string;
  createdDate: string;
}

export interface ApiError {
  error: string;
  message?: string;
  status: number;
}

// ============================================================================
// Error Handling
// ============================================================================

export class BacklogApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: unknown,
  ) {
    super(message);
    this.name = "BacklogApiError";
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let errorMessage = `API error: ${response.status}`;
    try {
      const errorData = await response.json();
      errorMessage = errorData.error || errorData.message || errorMessage;
    } catch {
      // Use status text if JSON parsing fails
      errorMessage = response.statusText || errorMessage;
    }
    throw new BacklogApiError(errorMessage, response.status);
  }

  return response.json();
}

// ============================================================================
// Base API Functions
// ============================================================================

const API_BASE = "/api/backlog";

interface FetchOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  params?: Record<string, string | string[] | boolean | number | undefined>;
}

async function apiFetch<T>(
  path: string,
  options: FetchOptions = {},
): Promise<T> {
  const { method = "GET", body, params } = options;

  let url = `${API_BASE}${path}`;

  // Add query params
  if (params) {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined) continue;
      if (Array.isArray(value)) {
        value.forEach((v) => searchParams.append(key, v));
      } else {
        searchParams.set(key, String(value));
      }
    }
    const queryString = searchParams.toString();
    if (queryString) {
      url += `?${queryString}`;
    }
  }

  const fetchOptions: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  };

  if (body && (method === "POST" || method === "PUT" || method === "PATCH")) {
    fetchOptions.body = JSON.stringify(body);
  }

  const response = await fetch(url, fetchOptions);
  return handleResponse<T>(response);
}

// ============================================================================
// Server Status
// ============================================================================

/**
 * Get the current status of the BacklogServer
 */
export async function getServerStatus(): Promise<BacklogServerStatus> {
  return apiFetch<BacklogServerStatus>("/status");
}

/**
 * Start the BacklogServer
 * @param projectName - The project name (relative path from workspace, e.g., "jp/daax")
 * @param port - The port to run the server on
 */
export async function startServer(
  projectName: string,
  port: number = 3001,
): Promise<{ success: boolean; message: string; status: BacklogServerStatus }> {
  return apiFetch("/status", {
    method: "POST",
    body: { action: "start", projectName, port },
  });
}

/**
 * Stop the BacklogServer
 */
export async function stopServer(): Promise<{
  success: boolean;
  message: string;
}> {
  return apiFetch("/status", {
    method: "POST",
    body: { action: "stop" },
  });
}

/**
 * Restart the BacklogServer
 * @param projectName - Optional project name to restart with a different project
 */
export async function restartServer(
  projectName?: string,
): Promise<{ success: boolean; message: string; status: BacklogServerStatus }> {
  return apiFetch("/status", {
    method: "POST",
    body: { action: "restart", projectName },
  });
}

// ============================================================================
// Tasks
// ============================================================================

/**
 * Fetch all tasks with optional filtering
 */
export async function fetchTasks(filter?: TaskListFilter): Promise<Task[]> {
  const params: Record<string, string | string[] | undefined> = {};

  if (filter) {
    if (filter.status) params.status = filter.status;
    if (filter.assignee) params.assignee = filter.assignee;
    if (filter.priority) params.priority = filter.priority;
    if (filter.labels) params.labels = filter.labels.join(",");
    if (filter.parentTaskId) params.parentTaskId = filter.parentTaskId;
  }

  const result = await apiFetch<{ tasks: Task[] } | Task[]>("/tasks", {
    params,
  });

  // Handle both wrapped and unwrapped responses
  return Array.isArray(result) ? result : result.tasks;
}

/**
 * Fetch a single task by ID
 */
export async function fetchTask(taskId: string): Promise<Task> {
  const result = await apiFetch<{ task: Task } | Task>(`/tasks/${taskId}`);
  return "task" in result ? result.task : result;
}

/**
 * Create a new task
 */
export async function createTask(input: TaskCreateInput): Promise<Task> {
  const result = await apiFetch<{ task: Task } | Task>("/tasks", {
    method: "POST",
    body: input,
  });
  return "task" in result ? result.task : result;
}

/**
 * Update an existing task
 */
export async function updateTask(
  taskId: string,
  input: TaskUpdateInput,
): Promise<Task> {
  const result = await apiFetch<{ task: Task } | Task>(`/tasks/${taskId}`, {
    method: "PUT",
    body: input,
  });
  return "task" in result ? result.task : result;
}

/**
 * Partially update a task
 * Note: Backlog.md browser doesn't support PATCH, so we fetch-merge-PUT
 */
export async function patchTask(
  taskId: string,
  input: Partial<TaskUpdateInput>,
): Promise<Task> {
  // Fetch current task first
  const currentTask = await fetchTask(taskId);

  // Merge the updates with current task data
  const merged: TaskUpdateInput = {
    title: input.title ?? currentTask.title,
    description: input.description ?? currentTask.description,
    status: input.status ?? currentTask.status,
    priority: input.priority ?? currentTask.priority,
    labels: input.labels ?? currentTask.labels,
    assignee: input.assignee ?? currentTask.assignee,
    milestone: input.milestone ?? currentTask.milestone,
    dependencies: input.dependencies ?? currentTask.dependencies,
  };

  // Use PUT with merged data
  const result = await apiFetch<{ task: Task } | Task>(`/tasks/${taskId}`, {
    method: "PUT",
    body: merged,
  });
  return "task" in result ? result.task : result;
}

/**
 * Archive/delete a task
 */
export async function archiveTask(taskId: string): Promise<void> {
  await apiFetch<void>(`/tasks/${taskId}`, { method: "DELETE" });
}

/**
 * Complete a task (set status to done/completed)
 */
export async function completeTask(taskId: string): Promise<Task> {
  return patchTask(taskId, { status: "Done" });
}

/**
 * Update task status
 */
export async function updateTaskStatus(
  taskId: string,
  status: string,
): Promise<Task> {
  return patchTask(taskId, { status });
}

// ============================================================================
// Configuration
// ============================================================================

/**
 * Fetch backlog configuration
 */
export async function fetchConfig(): Promise<BacklogConfig> {
  const result = await apiFetch<{ config: BacklogConfig } | BacklogConfig>(
    "/config",
  );
  return "config" in result ? result.config : result;
}

/**
 * Fetch available statuses
 */
export async function fetchStatuses(): Promise<string[]> {
  const result = await apiFetch<{ statuses: string[] } | string[]>("/statuses");
  return Array.isArray(result) ? result : result.statuses;
}

// ============================================================================
// Statistics
// ============================================================================

/**
 * Fetch backlog statistics
 */
export async function fetchStatistics(): Promise<BacklogStatistics> {
  return apiFetch<BacklogStatistics>("/statistics");
}

// ============================================================================
// Milestones
// ============================================================================

/**
 * Fetch all milestones
 */
export async function fetchMilestones(): Promise<Milestone[]> {
  const result = await apiFetch<{ milestones: Milestone[] } | Milestone[]>(
    "/milestones",
  );
  return Array.isArray(result) ? result : result.milestones;
}

/**
 * Fetch milestone summary with task buckets
 */
export async function fetchMilestoneSummary(): Promise<MilestoneSummary> {
  const result = await apiFetch<
    { summary: MilestoneSummary } | MilestoneSummary
  >("/milestones", { params: { summary: "true" } });
  return "summary" in result ? result.summary : result;
}

// ============================================================================
// Search
// ============================================================================

/**
 * Search tasks, documents, and decisions
 */
export async function search(options: SearchOptions): Promise<SearchResult[]> {
  const result = await apiFetch<{ results: SearchResult[] } | SearchResult[]>(
    "/search",
    {
      method: "POST",
      body: options,
    },
  );
  return Array.isArray(result) ? result : result.results;
}

/**
 * Quick search with just a query string
 */
export async function quickSearch(
  query: string,
  limit = 10,
): Promise<SearchResult[]> {
  return search({ query, limit });
}

// ============================================================================
// Documents
// ============================================================================

/**
 * Fetch all documents
 */
export async function fetchDocs(type?: string): Promise<Document[]> {
  const params = type ? { type } : undefined;
  const result = await apiFetch<{ documents: Document[] } | Document[]>(
    "/docs",
    { params },
  );
  return Array.isArray(result) ? result : result.documents;
}

/**
 * Fetch a single document by ID
 */
export async function fetchDoc(docId: string): Promise<Document> {
  const result = await apiFetch<{ document: Document } | Document>(
    `/docs/${docId}`,
  );
  return "document" in result ? result.document : result;
}

// ============================================================================
// Decisions
// ============================================================================

/**
 * Fetch all decisions
 */
export async function fetchDecisions(): Promise<Decision[]> {
  const result = await apiFetch<{ decisions: Decision[] } | Decision[]>(
    "/decisions",
  );
  return Array.isArray(result) ? result : result.decisions;
}

// ============================================================================
// Drafts
// ============================================================================

/**
 * Fetch all drafts
 */
export async function fetchDrafts(): Promise<Draft[]> {
  const result = await apiFetch<{ drafts: Draft[] } | Draft[]>("/drafts");
  return Array.isArray(result) ? result : result.drafts;
}

/**
 * Fetch a single draft by ID
 */
export async function fetchDraft(draftId: string): Promise<Draft> {
  const result = await apiFetch<{ draft: Draft } | Draft>(`/drafts/${draftId}`);
  return "draft" in result ? result.draft : result;
}

/**
 * Create a new draft
 */
export async function createDraft(content: string): Promise<Draft> {
  const result = await apiFetch<{ draft: Draft } | Draft>("/drafts", {
    method: "POST",
    body: { content },
  });
  return "draft" in result ? result.draft : result;
}

/**
 * Promote a draft to a full task
 */
export async function promoteDraft(
  draftId: string,
  updates?: TaskCreateInput,
): Promise<Task> {
  const result = await apiFetch<{ task: Task } | Task>(`/drafts/${draftId}`, {
    method: "POST",
    body: updates,
  });
  return "task" in result ? result.task : result;
}

/**
 * Delete a draft
 */
export async function deleteDraft(draftId: string): Promise<void> {
  await apiFetch<void>(`/drafts/${draftId}`, { method: "DELETE" });
}

// ============================================================================
// React Query Helpers (for use with @tanstack/react-query)
// ============================================================================

/**
 * Query key factory for React Query
 */
export const backlogKeys = {
  all: ["backlog"] as const,
  status: () => [...backlogKeys.all, "status"] as const,
  config: () => [...backlogKeys.all, "config"] as const,
  statuses: () => [...backlogKeys.all, "statuses"] as const,
  statistics: () => [...backlogKeys.all, "statistics"] as const,
  tasks: () => [...backlogKeys.all, "tasks"] as const,
  tasksList: (filter?: TaskListFilter) =>
    [...backlogKeys.tasks(), "list", filter] as const,
  taskDetail: (id: string) => [...backlogKeys.tasks(), "detail", id] as const,
  milestones: () => [...backlogKeys.all, "milestones"] as const,
  milestoneSummary: () => [...backlogKeys.milestones(), "summary"] as const,
  docs: () => [...backlogKeys.all, "docs"] as const,
  docsList: (type?: string) => [...backlogKeys.docs(), "list", type] as const,
  docDetail: (id: string) => [...backlogKeys.docs(), "detail", id] as const,
  drafts: () => [...backlogKeys.all, "drafts"] as const,
  draftDetail: (id: string) => [...backlogKeys.drafts(), "detail", id] as const,
  search: (options: SearchOptions) =>
    [...backlogKeys.all, "search", options] as const,
};
