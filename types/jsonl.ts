// Core record interface
export interface JsonlRecord {
  id: string;
  timestamp?: string;
  type?: string;
  [key: string]: unknown;
}

export interface JsonlFile {
  name: string;
  path: string;
  recordCount: number;
  lastModified?: Date;
}

// Inferred record categories based on field patterns
export type RecordCategory =
  | "event" // Has event_type field
  | "decision" // Has decision or decision_id field
  | "finding" // Has status + severity + gaps
  | "action" // Has action or phase field
  | "task" // Has task_id or references tasks
  | "unknown";

// File type inference based on filename and content patterns
export type FileCategory =
  | "event-log"
  | "decision-log"
  | "action-plan"
  | "mixed";

export interface DecisionRecord extends JsonlRecord {
  type: "decision";
  title: string;
  description?: string;
  status?: "pending" | "approved" | "rejected" | "implemented";
  rationale?: string;
  alternatives?: string[];
  consequences?: string[];
  tags?: string[];
}

export interface EventRecord extends JsonlRecord {
  type: "event";
  event_type?: string;
  agent_id?: string;
  message?: string;
  context?: Record<string, unknown>;
  decision?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface FindingRecord extends JsonlRecord {
  type: "finding";
  decision?: string;
  description?: string;
  status?: string;
  severity?: "low" | "medium" | "high" | "critical";
  gaps?: string;
}

export interface ActionRecord extends JsonlRecord {
  type: "action";
  phase?: string;
  changes?: string[];
  rationale?: string;
}

export interface IssueRecord extends JsonlRecord {
  type: "issue";
  title: string;
  description?: string;
  status?: "open" | "in_progress" | "resolved" | "closed";
  priority?: "low" | "medium" | "high" | "critical";
  assignee?: string;
}

export type AnyRecord =
  | DecisionRecord
  | EventRecord
  | FindingRecord
  | ActionRecord
  | IssueRecord
  | JsonlRecord;

export interface ParsedJsonlFile {
  file: JsonlFile;
  records: AnyRecord[];
  parseErrors: ParseError[];
  fileCategory: FileCategory;
  correlations: RecordCorrelation[];
}

export interface ParseError {
  line: number;
  error: string;
  rawContent: string;
}

// Cross-file correlation
export interface RecordCorrelation {
  type: "task" | "decision" | "file" | "url";
  value: string;
  sourceFile: string;
  sourceRecordId: string;
  linkedFile?: string;
  linkedRecordId?: string;
}

// Extracted references from records
export interface ExtractedReferences {
  taskIds: string[]; // task-204, task-328, etc.
  decisionIds: string[]; // PLAN-001, D001, DOC-0001, etc.
  urls: string[]; // https://..., http://...
  fileRefs: string[]; // .md files, .jsonl files
}
