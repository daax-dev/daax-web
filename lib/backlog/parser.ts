/**
 * Backlog.md Markdown Parser
 * Adapted from backlog.md/src/markdown/parser.ts (MIT License)
 */

import matter from "gray-matter";
import yaml from "js-yaml";
import type {
  Task,
  TaskPriority,
  TaskStatus,
  Document,
  Decision,
  Milestone,
  BacklogConfig,
  AcceptanceCriterion,
} from "@/types/backlog";

// 1. Preprocess YAML to quote @mentions (backlog.md convention)
const preprocessFrontmatter = (content: string): string => {
  return content.replace(/^(assignee|reporter):\s*@(\w+)/gm, '$1: "@$2"');
};

// 2. Normalize dates to ISO format (YYYY-MM-DD)
const normalizeDate = (date: unknown): string | undefined => {
  if (!date) return undefined;
  if (typeof date === "string") {
    try {
      return new Date(date).toISOString().split("T")[0];
    } catch {
      return undefined;
    }
  }
  return undefined;
};

// 3. Validate priority
const validatePriority = (p: unknown): TaskPriority | undefined => {
  if (!p) return undefined;
  const priority = String(p).toLowerCase();
  if (["critical", "high", "medium", "low"].includes(priority)) {
    // Normalize 'critical' to 'high' to match TaskPriority type
    if (priority === "critical") {
      return "high";
    }
    return priority as TaskPriority;
  }
  return undefined;
};

// 4. Validate status
const validateStatus = (s: unknown): TaskStatus => {
  if (!s) return "Open"; // Default status
  const status = String(s);
  const validStatuses = [
    "Open",
    "In Progress",
    "Review",
    "Done",
    "Blocked",
    "Cancelled",
  ];
  if (validStatuses.includes(status)) {
    return status;
  }
  return "Open";
};

// 5. Coerce to array
const ensureArray = <T>(val: T | T[] | undefined): T[] => {
  if (!val) return [];
  return Array.isArray(val) ? val : [val];
};

// 6. Parse acceptance criteria items from frontmatter
const parseAcceptanceCriteria = (val: unknown): AcceptanceCriterion[] => {
  if (!val) return [];
  const items = ensureArray(val);
  return items.map((item, idx) => {
    if (typeof item === "string") {
      // Simple string format: "Some criterion text"
      return { index: idx + 1, text: item, checked: false };
    }
    if (typeof item === "object" && item !== null) {
      const obj = item as Record<string, unknown>;
      return {
        index: typeof obj.index === "number" ? obj.index : idx + 1,
        text: typeof obj.text === "string" ? obj.text : String(obj.text || ""),
        checked: Boolean(obj.checked),
      };
    }
    return { index: idx + 1, text: String(item), checked: false };
  });
};

// 7. Main task parser
export function parseTask(content: string): Task {
  const preprocessed = preprocessFrontmatter(content);
  const { data, content: body } = matter(preprocessed);

  // Parse acceptance criteria from frontmatter (supports both naming conventions)
  const acceptanceCriteriaItems = parseAcceptanceCriteria(
    data.acceptanceCriteriaItems ||
      data.acceptance_criteria_items ||
      data.acceptanceCriteria ||
      data.acceptance_criteria,
  );

  return {
    id: String(data.id || ""),
    title: String(data.title || ""),
    status: validateStatus(data.status),
    assignee: ensureArray(data.assignee),
    createdDate:
      normalizeDate(data.createdDate || data.created_date) ??
      new Date().toISOString().split("T")[0],
    labels: ensureArray(data.labels),
    dependencies: ensureArray(data.dependencies),

    // Optional fields
    priority: validatePriority(data.priority),
    reporter: data.reporter ? String(data.reporter) : undefined,
    updatedDate: normalizeDate(data.updatedDate || data.updated_date),
    milestone: data.milestone,
    subtasks: ensureArray(data.subtasks),
    acceptanceCriteriaItems:
      acceptanceCriteriaItems.length > 0 ? acceptanceCriteriaItems : undefined,
    description: body.trim() || undefined,
    rawContent: body.trim() || undefined,
  };
}

// 8. Parse document
export function parseDocument(content: string): Document {
  const { data, content: body } = matter(content);

  return {
    id: String(data.id || ""),
    title: String(data.title || ""),
    type: (data.type || data.category || "other") as
      | "readme"
      | "guide"
      | "specification"
      | "other",
    createdDate: normalizeDate(data.createdDate || data.created_date) || "",
    rawContent: body.trim(),
    updatedDate: normalizeDate(data.updatedDate || data.updated_date),
    tags: ensureArray(data.tags),
  };
}

// 9. Parse JSONL decision (from .logs/decisions/*.jsonl)
export function parseDecisionLine(line: string): Decision | null {
  try {
    const data = JSON.parse(line);
    return {
      id: data.id || String(Date.now()),
      title: data.title || data.description || "Untitled Decision",
      date: data.date || data.timestamp || new Date().toISOString(),
      status: (data.status || "accepted") as
        | "proposed"
        | "accepted"
        | "rejected"
        | "superseded",
      context: data.context || "",
      decision: data.decision || "",
      consequences: data.consequences || "",
      alternatives: data.alternatives,
      rawContent: data.rawContent || "",
    };
  } catch {
    return null;
  }
}

// 10. Parse milestone
export function parseMilestone(content: string): Milestone {
  const { data, content: body } = matter(content);

  return {
    id: String(data.id || ""),
    title: String(data.title || ""),
    description: body.trim() || data.description || "",
    rawContent: body.trim(),
  };
}

// Type guard for raw YAML config
interface RawBacklogConfig {
  projectName?: unknown;
  project_name?: unknown;
  statuses?: unknown;
  labels?: unknown;
  milestones?: unknown;
  dateFormat?: unknown;
  defaultAssignee?: unknown;
  defaultReporter?: unknown;
  defaultStatus?: unknown;
}

function isRawBacklogConfig(value: unknown): value is RawBacklogConfig {
  return typeof value === "object" && value !== null;
}

// 11. Parse config.yml
export function parseConfig(yamlContent: string): BacklogConfig {
  try {
    const raw = yaml.load(yamlContent);

    if (!isRawBacklogConfig(raw)) {
      throw new Error("Invalid config format: root is not an object");
    }

    const projectName =
      typeof raw.projectName === "string"
        ? raw.projectName
        : typeof raw.project_name === "string"
          ? raw.project_name
          : "Unnamed Project";

    const rawStatuses = raw.statuses;
    const statuses = ensureArray(
      Array.isArray(rawStatuses) || typeof rawStatuses === "string"
        ? rawStatuses
        : ["Open", "In Progress", "Review", "Done", "Blocked"],
    );

    const rawLabels = raw.labels;
    const labels = ensureArray(
      Array.isArray(rawLabels) || typeof rawLabels === "string"
        ? rawLabels
        : [],
    );

    const rawMilestones = raw.milestones;
    const milestones = ensureArray(
      Array.isArray(rawMilestones) || typeof rawMilestones === "string"
        ? rawMilestones
        : [],
    );

    const dateFormat =
      typeof raw.dateFormat === "string" ? raw.dateFormat : "YYYY-MM-DD";

    const defaultAssignee =
      typeof raw.defaultAssignee === "string" ? raw.defaultAssignee : undefined;

    const defaultReporter =
      typeof raw.defaultReporter === "string" ? raw.defaultReporter : undefined;

    const defaultStatus =
      typeof raw.defaultStatus === "string" ? raw.defaultStatus : undefined;

    return {
      projectName,
      statuses,
      labels,
      milestones,
      dateFormat,
      defaultAssignee,
      defaultReporter,
      defaultStatus,
    };
  } catch (error) {
    console.error("Failed to parse config.yml:", error);
    return {
      projectName: "Unnamed Project",
      statuses: ["Open", "In Progress", "Review", "Done", "Blocked"],
      labels: [],
      milestones: [],
      dateFormat: "YYYY-MM-DD",
    };
  }
}

// 12. Convert task back to frontmatter (for writing)
export function taskToFrontmatter(task: Task): Record<string, unknown> {
  const frontmatter: Record<string, unknown> = {
    id: task.id,
    title: task.title,
    status: task.status,
  };

  if (task.priority) frontmatter.priority = task.priority;
  if (task.assignee && task.assignee.length > 0)
    frontmatter.assignee = task.assignee;
  if (task.reporter) frontmatter.reporter = task.reporter;
  if (task.createdDate) frontmatter.created_date = task.createdDate;
  if (task.updatedDate) frontmatter.updated_date = task.updatedDate;
  if (task.labels && task.labels.length > 0) frontmatter.labels = task.labels;
  if (task.dependencies && task.dependencies.length > 0)
    frontmatter.dependencies = task.dependencies;
  if (task.milestone) frontmatter.milestone = task.milestone;
  if (task.subtasks && task.subtasks.length > 0)
    frontmatter.subtasks = task.subtasks;
  if (task.acceptanceCriteriaItems && task.acceptanceCriteriaItems.length > 0) {
    // Use snake_case for consistency with other frontmatter fields (created_date, updated_date)
    frontmatter.acceptance_criteria_items = task.acceptanceCriteriaItems;
  }

  return frontmatter;
}

// 13. Serialize task to markdown
export function serializeTask(task: Task): string {
  const content = task.description || task.rawContent || "";
  return matter.stringify(content, taskToFrontmatter(task));
}
