/**
 * Usage examples for Backlog.md integration types
 *
 * This file demonstrates how to use the types and serves as a type validation check.
 * These examples are not meant to be executed, just type-checked.
 */

import type {
  Task,
  TaskCreateInput,
  TaskUpdateInput,
  TaskListFilter,
  DaaxDecision,
  SearchOptions,
  SearchResult,
  BacklogConfig,
  MilestoneSummary,
} from "./types";

// ============================================================================
// Example 1: Creating a new task
// ============================================================================

const createTaskExample: TaskCreateInput = {
  title: "Implement user authentication",
  description: "Add login and registration functionality",
  status: "To Do",
  priority: "high",
  labels: ["feature", "security"],
  assignee: ["@backend-engineer"],
  acceptanceCriteria: [
    { text: "User can register with email and password" },
    { text: "User can login with credentials" },
    { text: "Session management implemented" },
  ],
  implementationPlan: [
    "1. Design database schema",
    "2. Implement registration endpoint",
    "3. Implement login endpoint",
    "4. Add session middleware",
  ].join("\n"),
};

// ============================================================================
// Example 2: Updating a task
// ============================================================================

const updateTaskExample: TaskUpdateInput = {
  status: "In Progress",
  addLabels: ["urgent"],
  checkAcceptanceCriteria: [1], // Check first criterion
  appendImplementationNotes: [
    "Started with database schema design",
    "Using bcrypt for password hashing",
  ],
};

// ============================================================================
// Example 3: Filtering tasks
// ============================================================================

const filterTasksExample: TaskListFilter = {
  status: "In Progress",
  assignee: "@backend-engineer",
  priority: "high",
  labels: ["feature"],
};

// ============================================================================
// Example 4: Complete task object
// ============================================================================

const completeTaskExample: Task = {
  id: "task-025",
  title: "Define TypeScript types for Backlog.md integration",
  status: "In Progress",
  assignee: ["@backend-engineer"],
  reporter: "@architect",
  createdDate: "2026-01-04",
  updatedDate: "2026-01-04T18:00:00Z",
  labels: ["foundation", "types"],
  milestone: "v1.0",
  dependencies: [],
  description: "Port and adapt type definitions from Backlog.md",
  implementationPlan: [
    "1. Read Backlog.md types",
    "2. Create lib/backlog/types.ts",
    "3. Port all types with adaptations",
    "4. Add Daax-specific JSONL decision type",
    "5. Export all types",
  ].join("\n"),
  acceptanceCriteriaItems: [
    {
      index: 1,
      text: "Types exported from lib/backlog/types.ts",
      checked: true,
    },
    {
      index: 2,
      text: "All Backlog.md API response types covered",
      checked: true,
    },
    {
      index: 3,
      text: "Daax decision JSONL type defined separately",
      checked: true,
    },
  ],
  priority: "high",
  branch: "adare/task-025/backlog-types",
  source: "local",
};

// ============================================================================
// Example 5: Daax decision log entry
// ============================================================================

const decisionLogExample: DaaxDecision = {
  id: "D025-001",
  timestamp: "2026-01-04T18:00:00Z",
  title: "Port all Backlog.md types without modification",
  context: "Need to integrate with Backlog.md API but maintain compatibility",
  decision: "Port all types from Backlog.md as-is with only JSDoc enhancements",
  alternatives: [
    "Create simplified subset of types",
    "Redesign types to match Daax patterns",
    "Use Backlog.md as dependency",
  ],
  consequences: [
    "Full API compatibility with Backlog.md",
    "Easier to sync with upstream changes",
    "May include types not immediately used",
  ],
  status: "accepted",
  tags: ["types", "architecture"],
  taskId: "task-025",
};

// ============================================================================
// Example 6: Search operations
// ============================================================================

const searchOptionsExample: SearchOptions = {
  query: "authentication",
  limit: 10,
  types: ["task", "document"],
  filters: {
    status: ["To Do", "In Progress"],
    priority: "high",
    labels: "security",
  },
};

// Type narrowing with discriminated union
function handleSearchResult(result: SearchResult): string {
  switch (result.type) {
    case "task":
      return `Task: ${result.task.title} (${result.task.status})`;
    case "document":
      return `Document: ${result.document.title} (${result.document.type})`;
    case "decision":
      return `Decision: ${result.decision.title} (${result.decision.status})`;
  }
}

// ============================================================================
// Example 7: Backlog configuration
// ============================================================================

const configExample: BacklogConfig = {
  projectName: "Daax",
  defaultAssignee: "@backend-engineer",
  statuses: ["To Do", "In Progress", "Review", "Done"],
  labels: ["feature", "bug", "enhancement", "foundation"],
  milestones: ["v1.0", "v2.0"],
  defaultStatus: "To Do",
  dateFormat: "YYYY-MM-DD",
  timezonePreference: "UTC",
  includeDateTimeInDates: true,
  checkActiveBranches: true,
  activeBranchDays: 30,
  mcp: {
    http: {
      host: "localhost",
      port: 3100,
      auth: {
        type: "bearer",
        token: "secret-token",
      },
      cors: {
        origin: ["http://localhost:4200"],
        credentials: true,
      },
    },
  },
};

// ============================================================================
// Example 8: Milestone summary
// ============================================================================

const milestoneSummaryExample: MilestoneSummary = {
  milestones: ["v1.0", "v2.0", "backlog"],
  buckets: [
    {
      key: "v1.0",
      label: "v1.0 Release",
      milestone: "v1.0",
      isNoMilestone: false,
      tasks: [completeTaskExample],
      statusCounts: {
        "To Do": 5,
        "In Progress": 3,
        Done: 2,
      },
      total: 10,
      doneCount: 2,
      progress: 20,
    },
  ],
};

// ============================================================================
// Export examples for type checking (not for runtime use)
// ============================================================================

export const examples = {
  createTaskExample,
  updateTaskExample,
  filterTasksExample,
  completeTaskExample,
  decisionLogExample,
  searchOptionsExample,
  handleSearchResult,
  configExample,
  milestoneSummaryExample,
};
