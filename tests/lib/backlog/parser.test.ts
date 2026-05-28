/**
 * Unit tests for Backlog.md parser functions
 * Tests parsing of tasks, documents, decisions, milestones, and config
 */

import { describe, it, expect } from "vitest";
import {
  parseTask,
  parseDocument,
  parseDecisionLine,
  parseMilestone,
  parseConfig,
  taskToFrontmatter,
  serializeTask,
} from "@/lib/backlog/parser";
import type { Task } from "@/types/backlog";

describe("parseTask", () => {
  describe("valid tasks", () => {
    it("parses a complete task with all fields", () => {
      const content = `---
id: "001"
title: "Implement feature X"
status: "In Progress"
priority: "high"
assignee: ["@jpoley", "@alice"]
reporter: "@bob"
createdDate: "2026-01-15"
updatedDate: "2026-01-20"
labels: ["feature", "backend"]
dependencies: ["task-002", "task-003"]
milestone: "v1.0"
---
This is the task description.

## Implementation Notes
Some implementation details here.
`;
      const task = parseTask(content);

      expect(task.id).toBe("001");
      expect(task.title).toBe("Implement feature X");
      expect(task.status).toBe("In Progress");
      expect(task.priority).toBe("high");
      expect(task.assignee).toEqual(["@jpoley", "@alice"]);
      expect(task.reporter).toBe("@bob");
      expect(task.createdDate).toBe("2026-01-15");
      expect(task.updatedDate).toBe("2026-01-20");
      expect(task.labels).toEqual(["feature", "backend"]);
      expect(task.dependencies).toEqual(["task-002", "task-003"]);
      expect(task.milestone).toBe("v1.0");
      expect(task.description).toContain("task description");
      expect(task.description).toContain("Implementation Notes");
    });

    it("parses minimal task with required fields only", () => {
      const content = `---
id: "002"
title: "Simple task"
status: "Open"
---
`;
      const task = parseTask(content);

      expect(task.id).toBe("002");
      expect(task.title).toBe("Simple task");
      expect(task.status).toBe("Open");
      expect(task.assignee).toEqual([]);
      expect(task.labels).toEqual([]);
      expect(task.dependencies).toEqual([]);
      expect(task.priority).toBeUndefined();
      expect(task.reporter).toBeUndefined();
    });

    it("handles @mention preprocessing in assignee", () => {
      const content = `---
id: "003"
title: "Test mentions"
status: "Open"
assignee: @jpoley
reporter: @bob
---
`;
      const task = parseTask(content);

      expect(task.assignee).toEqual(["@jpoley"]);
      expect(task.reporter).toBe("@bob");
    });

    it("handles single assignee as string (not array)", () => {
      const content = `---
id: "004"
title: "Single assignee"
status: "Open"
assignee: "@alice"
---
`;
      const task = parseTask(content);

      expect(task.assignee).toEqual(["@alice"]);
    });

    it("handles single label as string (not array)", () => {
      const content = `---
id: "005"
title: "Single label"
status: "Open"
labels: "bug"
---
`;
      const task = parseTask(content);

      expect(task.labels).toEqual(["bug"]);
    });
  });

  describe("priority validation", () => {
    it("accepts valid priorities", () => {
      const priorities = ["high", "medium", "low"];
      for (const priority of priorities) {
        const content = `---
id: "test"
title: "Test"
status: "Open"
priority: "${priority}"
---
`;
        const task = parseTask(content);
        expect(task.priority).toBe(priority);
      }
    });

    it("normalizes critical to high", () => {
      const content = `---
id: "test"
title: "Test"
status: "Open"
priority: "critical"
---
`;
      const task = parseTask(content);
      expect(task.priority).toBe("high");
    });

    it("handles case-insensitive priority", () => {
      const content = `---
id: "test"
title: "Test"
status: "Open"
priority: "HIGH"
---
`;
      const task = parseTask(content);
      expect(task.priority).toBe("high");
    });

    it("returns undefined for invalid priority", () => {
      const content = `---
id: "test"
title: "Test"
status: "Open"
priority: "urgent"
---
`;
      const task = parseTask(content);
      expect(task.priority).toBeUndefined();
    });
  });

  describe("status validation", () => {
    it("accepts valid statuses", () => {
      const statuses = [
        "Open",
        "In Progress",
        "Review",
        "Done",
        "Blocked",
        "Cancelled",
      ];
      for (const status of statuses) {
        const content = `---
id: "test"
title: "Test"
status: "${status}"
---
`;
        const task = parseTask(content);
        expect(task.status).toBe(status);
      }
    });

    it("defaults to Open for invalid status", () => {
      const content = `---
id: "test"
title: "Test"
status: "Unknown"
---
`;
      const task = parseTask(content);
      expect(task.status).toBe("Open");
    });

    it("defaults to Open for missing status", () => {
      const content = `---
id: "test"
title: "Test"
---
`;
      const task = parseTask(content);
      expect(task.status).toBe("Open");
    });
  });

  describe("date handling", () => {
    it("normalizes various date formats to ISO", () => {
      const content = `---
id: "test"
title: "Test"
status: "Open"
createdDate: "January 15, 2026"
---
`;
      const task = parseTask(content);
      expect(task.createdDate).toBe("2026-01-15");
    });

    it("handles snake_case date fields", () => {
      const content = `---
id: "test"
title: "Test"
status: "Open"
created_date: "2026-01-15"
updated_date: "2026-01-20"
---
`;
      const task = parseTask(content);
      expect(task.createdDate).toBe("2026-01-15");
      expect(task.updatedDate).toBe("2026-01-20");
    });

    it("generates today's date when createdDate is missing", () => {
      const content = `---
id: "test"
title: "Test"
status: "Open"
---
`;
      const task = parseTask(content);
      expect(task.createdDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe("edge cases", () => {
    it("handles empty frontmatter", () => {
      const content = `---
---
Just some content
`;
      const task = parseTask(content);
      expect(task.id).toBe("");
      expect(task.title).toBe("");
      expect(task.status).toBe("Open");
    });

    it("handles content without frontmatter", () => {
      const content = `Just some content without frontmatter`;
      // gray-matter treats this as content-only
      const task = parseTask(content);
      expect(task.id).toBe("");
    });

    it("handles empty content", () => {
      const content = "";
      const task = parseTask(content);
      expect(task.id).toBe("");
      expect(task.description).toBeUndefined();
    });
  });
});

describe("parseDocument", () => {
  it("parses a complete document", () => {
    const content = `---
id: "doc-001"
title: "Getting Started Guide"
type: "guide"
createdDate: "2026-01-15"
updatedDate: "2026-01-20"
tags: ["onboarding", "documentation"]
---
# Getting Started

This is the getting started guide.
`;
    const doc = parseDocument(content);

    expect(doc.id).toBe("doc-001");
    expect(doc.title).toBe("Getting Started Guide");
    expect(doc.type).toBe("guide");
    expect(doc.createdDate).toBe("2026-01-15");
    expect(doc.updatedDate).toBe("2026-01-20");
    expect(doc.tags).toEqual(["onboarding", "documentation"]);
    expect(doc.rawContent).toContain("Getting Started");
  });

  it("handles category as alias for type", () => {
    const content = `---
id: "doc-002"
title: "API Spec"
category: "specification"
---
`;
    const doc = parseDocument(content);
    expect(doc.type).toBe("specification");
  });

  it("defaults type to other when missing", () => {
    const content = `---
id: "doc-003"
title: "Random Doc"
---
`;
    const doc = parseDocument(content);
    expect(doc.type).toBe("other");
  });

  it("handles single tag as string", () => {
    const content = `---
id: "doc-004"
title: "Tagged Doc"
tags: "important"
---
`;
    const doc = parseDocument(content);
    expect(doc.tags).toEqual(["important"]);
  });
});

describe("parseDecisionLine", () => {
  it("parses valid JSONL decision", () => {
    const line = JSON.stringify({
      id: "D001",
      title: "Use TypeScript",
      date: "2026-01-15T10:00:00Z",
      status: "accepted",
      context: "Need type safety",
      decision: "Use TypeScript with strict mode",
      consequences: "Better IDE support",
      alternatives: ["JavaScript", "Flow"],
    });

    const decision = parseDecisionLine(line);

    expect(decision).not.toBeNull();
    expect(decision!.id).toBe("D001");
    expect(decision!.title).toBe("Use TypeScript");
    expect(decision!.status).toBe("accepted");
    expect(decision!.context).toBe("Need type safety");
    expect(decision!.decision).toBe("Use TypeScript with strict mode");
    expect(decision!.alternatives).toEqual(["JavaScript", "Flow"]);
  });

  it("uses description as fallback for title", () => {
    const line = JSON.stringify({
      id: "D002",
      description: "Use React",
      status: "accepted",
    });

    const decision = parseDecisionLine(line);
    expect(decision!.title).toBe("Use React");
  });

  it("generates ID when missing", () => {
    const line = JSON.stringify({
      title: "Some Decision",
      status: "proposed",
    });

    const decision = parseDecisionLine(line);
    expect(decision!.id).toBeDefined();
    expect(decision!.id.length).toBeGreaterThan(0);
  });

  it("defaults status to accepted", () => {
    const line = JSON.stringify({
      id: "D003",
      title: "Default Status",
    });

    const decision = parseDecisionLine(line);
    expect(decision!.status).toBe("accepted");
  });

  it("returns null for invalid JSON", () => {
    const line = "not valid json";
    const decision = parseDecisionLine(line);
    expect(decision).toBeNull();
  });

  it("returns null for empty line", () => {
    const decision = parseDecisionLine("");
    expect(decision).toBeNull();
  });
});

describe("parseMilestone", () => {
  it("parses a complete milestone", () => {
    const content = `---
id: "v1.0"
title: "Version 1.0 Release"
---
## Goals

- Feature A
- Feature B

## Deadline

End of Q1 2026
`;
    const milestone = parseMilestone(content);

    expect(milestone.id).toBe("v1.0");
    expect(milestone.title).toBe("Version 1.0 Release");
    expect(milestone.description).toContain("Goals");
    expect(milestone.rawContent).toContain("Feature A");
  });

  it("uses frontmatter description as fallback", () => {
    const content = `---
id: "v2.0"
title: "Version 2.0"
description: "Major release"
---
`;
    const milestone = parseMilestone(content);
    expect(milestone.description).toBe("Major release");
  });
});

describe("parseConfig", () => {
  it("parses a complete config.yml", () => {
    const yaml = `
projectName: "My Project"
statuses:
  - Open
  - In Progress
  - Done
labels:
  - bug
  - feature
milestones:
  - v1.0
  - v2.0
dateFormat: "MM/DD/YYYY"
defaultAssignee: "@team"
defaultReporter: "@pm"
defaultStatus: "Open"
`;
    const config = parseConfig(yaml);

    expect(config.projectName).toBe("My Project");
    expect(config.statuses).toEqual(["Open", "In Progress", "Done"]);
    expect(config.labels).toEqual(["bug", "feature"]);
    expect(config.milestones).toEqual(["v1.0", "v2.0"]);
    expect(config.dateFormat).toBe("MM/DD/YYYY");
    expect(config.defaultAssignee).toBe("@team");
    expect(config.defaultReporter).toBe("@pm");
    expect(config.defaultStatus).toBe("Open");
  });

  it("handles project_name as alias for projectName", () => {
    const yaml = `
project_name: "Snake Case Project"
`;
    const config = parseConfig(yaml);
    expect(config.projectName).toBe("Snake Case Project");
  });

  it("provides sensible defaults for missing fields", () => {
    const yaml = `
projectName: "Minimal Config"
`;
    const config = parseConfig(yaml);

    expect(config.projectName).toBe("Minimal Config");
    expect(config.statuses).toEqual([
      "Open",
      "In Progress",
      "Review",
      "Done",
      "Blocked",
    ]);
    expect(config.labels).toEqual([]);
    expect(config.milestones).toEqual([]);
    expect(config.dateFormat).toBe("YYYY-MM-DD");
  });

  it("handles empty config gracefully", () => {
    const config = parseConfig("");

    expect(config.projectName).toBe("Unnamed Project");
    expect(config.statuses).toContain("Open");
  });

  it("handles invalid YAML gracefully", () => {
    const yaml = `
projectName: "Test
  invalid: yaml: here
`;
    const config = parseConfig(yaml);

    // Should return default config
    expect(config.projectName).toBe("Unnamed Project");
  });
});

describe("taskToFrontmatter", () => {
  it("converts task to frontmatter object", () => {
    const task: Task = {
      id: "001",
      title: "Test Task",
      status: "In Progress",
      priority: "high",
      assignee: ["@jpoley"],
      reporter: "@bob",
      createdDate: "2026-01-15",
      updatedDate: "2026-01-20",
      labels: ["feature"],
      dependencies: ["task-002"],
      milestone: "v1.0",
    };

    const frontmatter = taskToFrontmatter(task);

    expect(frontmatter.id).toBe("001");
    expect(frontmatter.title).toBe("Test Task");
    expect(frontmatter.status).toBe("In Progress");
    expect(frontmatter.priority).toBe("high");
    expect(frontmatter.assignee).toEqual(["@jpoley"]);
    expect(frontmatter.reporter).toBe("@bob");
    expect(frontmatter.created_date).toBe("2026-01-15");
    expect(frontmatter.updated_date).toBe("2026-01-20");
    expect(frontmatter.labels).toEqual(["feature"]);
    expect(frontmatter.dependencies).toEqual(["task-002"]);
    expect(frontmatter.milestone).toBe("v1.0");
  });

  it("omits undefined/empty fields", () => {
    const task: Task = {
      id: "002",
      title: "Minimal Task",
      status: "Open",
      assignee: [],
      createdDate: "2026-01-15",
      labels: [],
      dependencies: [],
    };

    const frontmatter = taskToFrontmatter(task);

    expect(frontmatter.id).toBe("002");
    expect(frontmatter.title).toBe("Minimal Task");
    expect(frontmatter.status).toBe("Open");
    expect(frontmatter.priority).toBeUndefined();
    expect(frontmatter.assignee).toBeUndefined();
    expect(frontmatter.labels).toBeUndefined();
    expect(frontmatter.dependencies).toBeUndefined();
  });
});

describe("serializeTask", () => {
  it("serializes task to markdown with frontmatter", () => {
    const task: Task = {
      id: "001",
      title: "Serialize Test",
      status: "Open",
      priority: "medium",
      assignee: ["@jpoley"],
      createdDate: "2026-01-15",
      labels: [],
      dependencies: [],
      description: "This is the description.",
    };

    const markdown = serializeTask(task);

    expect(markdown).toContain("---");
    expect(markdown).toContain("id:"); // gray-matter may use single or double quotes
    expect(markdown).toContain("001");
    expect(markdown).toContain("title: Serialize Test");
    expect(markdown).toContain("This is the description.");
  });

  it("round-trips: parse → serialize → parse produces equivalent task", () => {
    const original = `---
id: "round-trip"
title: "Round Trip Test"
status: "In Progress"
priority: "high"
assignee:
  - "@jpoley"
labels:
  - feature
  - backend
---
This is the task description.

It has multiple paragraphs.
`;
    const parsed = parseTask(original);
    const serialized = serializeTask(parsed);
    const reparsed = parseTask(serialized);

    expect(reparsed.id).toBe(parsed.id);
    expect(reparsed.title).toBe(parsed.title);
    expect(reparsed.status).toBe(parsed.status);
    expect(reparsed.priority).toBe(parsed.priority);
    expect(reparsed.assignee).toEqual(parsed.assignee);
    expect(reparsed.labels).toEqual(parsed.labels);
    expect(reparsed.description?.trim()).toBe(parsed.description?.trim());
  });

  it("uses rawContent as fallback for description", () => {
    const task: Task = {
      id: "003",
      title: "Raw Content Test",
      status: "Open",
      assignee: [],
      createdDate: "2026-01-15",
      labels: [],
      dependencies: [],
      rawContent: "Raw content here",
    };

    const markdown = serializeTask(task);
    expect(markdown).toContain("Raw content here");
  });
});
