# Backlog Types Quick Reference

## Import

```typescript
import type {
  Task,
  TaskCreateInput,
  TaskUpdateInput,
  SearchResult,
  DaaxDecision,
} from "@/lib/backlog";
```

## Common Types

### Task

```typescript
interface Task {
  id: string;
  title: string;
  status: string;
  assignee: string[];
  priority?: "high" | "medium" | "low";
  labels: string[];
  milestone?: string;
  acceptanceCriteriaItems?: AcceptanceCriterion[];
}
```

### Create Task

```typescript
const input: TaskCreateInput = {
  title: "Task title",
  description: "Description",
  status: "To Do",
  priority: "high",
  labels: ["feature"],
  assignee: ["@user"],
  acceptanceCriteria: [{ text: "Criterion 1" }],
};
```

### Update Task

```typescript
const update: TaskUpdateInput = {
  status: "In Progress",
  addLabels: ["urgent"],
  checkAcceptanceCriteria: [1],
  appendImplementationNotes: ["Note 1", "Note 2"],
};
```

### Search

```typescript
const options: SearchOptions = {
  query: "auth",
  limit: 10,
  types: ["task", "document"],
  filters: {
    status: "In Progress",
    priority: "high",
  },
};
```

### Decision Log (JSONL)

```typescript
const decision: DaaxDecision = {
  id: "D001",
  timestamp: new Date().toISOString(),
  title: "Decision title",
  context: "Why needed",
  decision: "What we decided",
  alternatives: ["Option A", "Option B"],
  consequences: ["Pro 1", "Con 1"],
  status: "accepted",
  taskId: "task-123",
};
```

## Type Guards

```typescript
// Check if task is editable
if (isLocalEditableTask(task)) {
  // Can edit
}

// Validate decision object
if (isDaaxDecision(record)) {
  // Is valid DaaxDecision
}
```

## Discriminated Unions

```typescript
function handleResult(result: SearchResult) {
  switch (result.type) {
    case "task":
      return result.task.title; // TypeScript knows it's TaskSearchResult
    case "document":
      return result.document.title; // DocumentSearchResult
    case "decision":
      return result.decision.title; // DecisionSearchResult
  }
}
```

## Response Types

```typescript
// API response
interface TaskListResponse {
  tasks: Task[];
  total: number;
}

interface SearchResponse {
  results: SearchResult[];
  total: number;
  query?: string;
}
```

## Complete Example

```typescript
import type {
  Task,
  TaskCreateInput,
  TaskUpdateInput,
  SearchOptions,
  SearchResult,
  DaaxDecision,
} from "@/lib/backlog";
import { isLocalEditableTask, isDaaxDecision } from "@/lib/backlog";

// Create task
const newTask: TaskCreateInput = {
  title: "Implement feature",
  description: "Add new feature",
  status: "To Do",
  priority: "high",
  labels: ["feature"],
  assignee: ["@dev"],
  acceptanceCriteria: [
    { text: "Criterion 1" },
    { text: "Criterion 2" },
  ],
};

// Update task
const update: TaskUpdateInput = {
  status: "In Progress",
  addLabels: ["urgent"],
  checkAcceptanceCriteria: [1],
};

// Search
const searchOpts: SearchOptions = {
  query: "feature",
  limit: 10,
  types: ["task"],
  filters: { status: "In Progress" },
};

// Handle search results
function displayResults(results: SearchResult[]) {
  results.forEach((result) => {
    switch (result.type) {
      case "task":
        console.log(result.task.title);
        break;
      case "document":
        console.log(result.document.title);
        break;
      case "decision":
        console.log(result.decision.title);
        break;
    }
  });
}

// Log decision
const decision: DaaxDecision = {
  id: "D001",
  timestamp: new Date().toISOString(),
  title: "Use TypeScript",
  context: "Need type safety",
  decision: "Use TypeScript with strict mode",
  alternatives: ["JavaScript"],
  consequences: ["Better IDE support"],
  status: "accepted",
  taskId: "task-123",
};

// Validate
if (isDaaxDecision(decision)) {
  // Append to .logs/decisions/task-123.jsonl
}
```

## See Also

- **Full Documentation**: `lib/backlog/README.md`
- **All Examples**: `lib/backlog/examples.ts`
- **Tests**: `lib/backlog/__tests__/types.test.ts`
