# Backlog.md Integration

This module provides TypeScript types and utilities for integrating Daax with [Backlog.md](https://github.com/adastreamer/Backlog.md), a markdown-based task management system with MCP support.

## Overview

Backlog.md is used for task tracking and project management across the JP Workspace projects. Daax integrates with Backlog.md to:

- Display tasks and their status
- Create and update tasks
- Search across tasks, documents, and decisions
- Track milestones and dependencies
- View backlog configuration

## Types

All types are exported from `lib/backlog/types.ts`:

```typescript
import type {
  Task,
  TaskCreateInput,
  TaskUpdateInput,
  Document,
  Decision,
  DaaxDecision,
  SearchResult,
  BacklogConfig,
} from "@/lib/backlog";
```

### Core Entities

- **Task**: Work item with status, assignees, labels, acceptance criteria
- **Document**: Markdown document (guides, specs, READMEs)
- **Decision**: Architecture decision record (Backlog.md format)
- **Milestone**: Project milestone grouping

### Daax Extensions

- **DaaxDecision**: JSONL decision log format used in `.logs/decisions/`
  - This is DIFFERENT from Backlog.md's markdown-based `Decision` type
  - Used for local decision logging during task execution

### API Types

- **TaskCreateInput**: Payload for creating tasks
- **TaskUpdateInput**: Payload for updating tasks (supports append/remove operations)
- **TaskListFilter**: Filter options for listing tasks
- **SearchOptions**: Search query with filters
- **SearchResult**: Union type for task/document/decision search results

### Response Types

- **TaskListResponse**: API response with tasks array and total count
- **SearchResponse**: Search results with metadata
- **ConfigResponse**: Backlog configuration

## Examples

See `lib/backlog/examples.ts` for complete usage examples.

### Creating a Task

```typescript
const newTask: TaskCreateInput = {
  title: "Implement feature X",
  description: "Detailed description",
  status: "To Do",
  priority: "high",
  labels: ["feature"],
  assignee: ["@engineer"],
  acceptanceCriteria: [
    { text: "Criterion 1" },
    { text: "Criterion 2" },
  ],
};
```

### Updating a Task

```typescript
const update: TaskUpdateInput = {
  status: "In Progress",
  addLabels: ["urgent"],
  checkAcceptanceCriteria: [1], // Check first criterion
  appendImplementationNotes: ["Started implementation"],
};
```

### Logging a Decision

```typescript
const decision: DaaxDecision = {
  id: "D001",
  timestamp: new Date().toISOString(),
  title: "Use React for UI",
  context: "Need modern UI framework",
  decision: "Use React with Next.js",
  alternatives: ["Vue", "Svelte"],
  consequences: ["Large bundle size", "Good ecosystem"],
  status: "accepted",
  taskId: "task-123",
};

// Append to .logs/decisions/task-123.jsonl
```

### Searching

```typescript
const searchOptions: SearchOptions = {
  query: "authentication",
  limit: 10,
  types: ["task", "document"],
  filters: {
    status: "In Progress",
    priority: "high",
  },
};

// Handle discriminated union
function handleResult(result: SearchResult) {
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
}
```

## Type Compatibility

These types are **ported directly** from Backlog.md's `src/types/index.ts` to ensure full API compatibility. When Backlog.md types are updated, these should be synced.

### Differences from Backlog.md

1. **DaaxDecision** is an addition for local JSONL decision logging
2. **API Response Types** are added for frontend use
3. **JSDoc comments** are enhanced for better IDE support

## Testing

Run type validation tests:

```bash
bun test lib/backlog/__tests__/types.test.ts
```

## Future Work

- API client implementation (`lib/backlog/client.ts`)
- React hooks for task management (`hooks/useBacklog.ts`)
- UI components for task display (`components/backlog/`)
