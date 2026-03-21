/**
 * Type validation tests for Backlog.md integration types
 */

import { describe, it, expect } from "vitest";
import type {
  Task,
  TaskCreateInput,
  TaskUpdateInput,
  DaaxDecision,
  SearchResult,
  TaskSearchResult,
  DocumentSearchResult,
  DecisionSearchResult,
} from "../types";
import { isLocalEditableTask, isDaaxDecision } from "../types";

describe("Backlog Types", () => {
  describe("Task types", () => {
    it("should accept valid Task object", () => {
      const task: Task = {
        id: "task-001",
        title: "Test task",
        status: "To Do",
        assignee: ["@user"],
        createdDate: "2026-01-04",
        labels: ["test"],
        dependencies: [],
      };

      expect(task.id).toBe("task-001");
      expect(task.title).toBe("Test task");
    });

    it("should accept valid TaskCreateInput", () => {
      const input: TaskCreateInput = {
        title: "New task",
        description: "Task description",
        status: "To Do",
        priority: "high",
        labels: ["feature"],
        assignee: ["@user"],
      };

      expect(input.title).toBe("New task");
      expect(input.priority).toBe("high");
    });

    it("should accept valid TaskUpdateInput with append operations", () => {
      const update: TaskUpdateInput = {
        status: "In Progress",
        addLabels: ["urgent"],
        removeLabels: ["backlog"],
        appendImplementationPlan: ["Step 1: Setup", "Step 2: Implementation"],
        checkAcceptanceCriteria: [1, 2],
      };

      expect(update.status).toBe("In Progress");
      expect(update.addLabels).toContain("urgent");
    });
  });

  describe("isLocalEditableTask", () => {
    it("should return true for local tasks", () => {
      expect(isLocalEditableTask({ source: "local" } as Task)).toBe(true);
      expect(isLocalEditableTask({ source: "completed" } as Task)).toBe(true);
      expect(isLocalEditableTask({} as Task)).toBe(true);
    });

    it("should return false for remote tasks", () => {
      expect(isLocalEditableTask({ source: "remote" } as Task)).toBe(false);
      expect(isLocalEditableTask({ source: "local-branch" } as Task)).toBe(
        false,
      );
    });
  });

  describe("DaaxDecision", () => {
    it("should accept valid decision object", () => {
      const decision: DaaxDecision = {
        id: "D001",
        timestamp: "2026-01-04T10:00:00Z",
        title: "Use TypeScript",
        context: "Need type safety",
        decision: "Use TypeScript with strict mode",
        alternatives: ["JavaScript", "Flow"],
        consequences: ["Better IDE support", "Longer build times"],
        status: "accepted",
      };

      expect(decision.id).toBe("D001");
      expect(decision.status).toBe("accepted");
    });

    it("should validate decision with isDaaxDecision", () => {
      const validDecision = {
        id: "D001",
        timestamp: "2026-01-04T10:00:00Z",
        title: "Use TypeScript",
        context: "Need type safety",
        decision: "Use TypeScript",
        alternatives: ["JavaScript"],
        consequences: ["Type safety"],
        status: "accepted",
      };

      expect(isDaaxDecision(validDecision)).toBe(true);
    });

    it("should reject invalid decision objects", () => {
      expect(isDaaxDecision({})).toBe(false);
      expect(isDaaxDecision(null)).toBe(false);
      expect(isDaaxDecision({ id: "D001" })).toBe(false);
      expect(
        isDaaxDecision({
          id: "D001",
          timestamp: "2026-01-04",
          title: "Test",
          context: "Context",
          decision: "Decision",
          alternatives: [],
          consequences: [],
          status: "invalid-status",
        }),
      ).toBe(false);
    });
  });

  describe("SearchResult union types", () => {
    it("should accept TaskSearchResult", () => {
      const result: TaskSearchResult = {
        type: "task",
        score: 0.95,
        task: {
          id: "task-001",
          title: "Test",
          status: "To Do",
          assignee: [],
          createdDate: "2026-01-04",
          labels: [],
          dependencies: [],
        },
        matches: [],
      };

      expect(result.type).toBe("task");
    });

    it("should accept DocumentSearchResult", () => {
      const result: DocumentSearchResult = {
        type: "document",
        score: 0.85,
        document: {
          id: "doc-001",
          title: "Guide",
          type: "guide",
          createdDate: "2026-01-04",
          rawContent: "# Guide content",
        },
      };

      expect(result.type).toBe("document");
    });

    it("should accept DecisionSearchResult", () => {
      const result: DecisionSearchResult = {
        type: "decision",
        score: 0.75,
        decision: {
          id: "ADR-001",
          title: "Architecture Decision",
          date: "2026-01-04",
          status: "accepted",
          context: "Context",
          decision: "Decision",
          consequences: "Consequences",
          rawContent: "# ADR content",
        },
      };

      expect(result.type).toBe("decision");
    });

    it("should accept SearchResult union", () => {
      const results: SearchResult[] = [
        {
          type: "task",
          score: 0.9,
          task: {
            id: "task-001",
            title: "Test",
            status: "To Do",
            assignee: [],
            createdDate: "2026-01-04",
            labels: [],
            dependencies: [],
          },
        },
        {
          type: "document",
          score: 0.8,
          document: {
            id: "doc-001",
            title: "Guide",
            type: "guide",
            createdDate: "2026-01-04",
            rawContent: "Content",
          },
        },
      ];

      expect(results).toHaveLength(2);
      expect(results[0].type).toBe("task");
      expect(results[1].type).toBe("document");
    });
  });
});
