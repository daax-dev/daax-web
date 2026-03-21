import type {
  AnyRecord,
  ParseError,
  ParsedJsonlFile,
  JsonlFile,
  RecordCategory,
  FileCategory,
  ExtractedReferences,
  RecordCorrelation,
} from "@/types/jsonl";

// Infer record type from field patterns
export function inferRecordCategory(
  record: Record<string, unknown>,
): RecordCategory {
  // Event: has event_type field
  if ("event_type" in record) {
    return "event";
  }

  // Finding: has status + severity or gaps (like audit findings)
  if (("status" in record && "severity" in record) || "gaps" in record) {
    return "finding";
  }

  // Action: has phase or action-related fields
  if ("phase" in record && ("changes" in record || "type" in record)) {
    return "action";
  }

  // Decision: has decision_id, decision field, or category field with decision-like values
  if (
    "decision_id" in record ||
    ("decision" in record && typeof record.decision === "string") ||
    (record.decision &&
      typeof record.decision === "object" &&
      "decision_id" in (record.decision as Record<string, unknown>))
  ) {
    return "decision";
  }

  // Task: references task IDs
  if ("task_id" in record || "task_ids" in record) {
    return "task";
  }

  return "unknown";
}

// Infer file category from filename and content patterns
export function inferFileCategory(
  fileName: string,
  records: AnyRecord[],
): FileCategory {
  const lowerName = fileName.toLowerCase();

  // Check filename patterns
  if (lowerName.includes("event")) return "event-log";
  if (lowerName.includes("decision")) return "decision-log";
  if (lowerName.includes("action") || lowerName.includes("plan"))
    return "action-plan";

  // Infer from record types
  const categories = records.map((r) => r.type || "unknown");
  const uniqueCategories = new Set(categories);

  if (uniqueCategories.size === 1) {
    const cat = categories[0];
    if (cat === "event") return "event-log";
    if (cat === "decision" || cat === "finding") return "decision-log";
    if (cat === "action") return "action-plan";
  }

  return "mixed";
}

// Extract references (task IDs, decision IDs, URLs, file refs) from a record
export function extractReferences(
  record: Record<string, unknown>,
): ExtractedReferences {
  const jsonStr = JSON.stringify(record);

  // Task IDs: task-XXX, task-XXX.XX patterns
  const taskIds = [...new Set(jsonStr.match(/task-\d+(?:\.\d+)?/gi) || [])];

  // Decision IDs: PLAN-XXX, D00X, DOC-XXXX, MW-XXX, etc.
  const decisionIds = [
    ...new Set(jsonStr.match(/(?:PLAN|DOC|MW|D)-?\d+/gi) || []),
  ];

  // URLs: http:// or https://
  const urls = [...new Set(jsonStr.match(/https?:\/\/[^\s"',\]})]+/gi) || [])];

  // File references: .md, .jsonl, .ts, .yaml files
  const fileRefs = [
    ...new Set(
      jsonStr.match(/[\w\-./]+\.(?:md|jsonl|ts|yaml|yml|json)/gi) || [],
    ),
  ];

  return { taskIds, decisionIds, urls, fileRefs };
}

// Get a meaningful title/summary from a record
export function getRecordTitle(record: AnyRecord): string {
  // Try various common title fields
  if (record.message && typeof record.message === "string")
    return record.message;
  if (record.title && typeof record.title === "string") return record.title;
  if (record.description && typeof record.description === "string")
    return record.description;
  if (record.decision && typeof record.decision === "string")
    return record.decision;

  // For event types, use event_type
  if (record.event_type && typeof record.event_type === "string") {
    return record.event_type.replace(/[._]/g, " ");
  }

  // For records with decision objects
  if (record.decision && typeof record.decision === "object") {
    const dec = record.decision as Record<string, unknown>;
    if (dec.decision_id) return `Decision ${dec.decision_id}`;
  }

  // Fallback to decision_id if present
  if (record.decision_id) return `Decision ${record.decision_id}`;

  return "Untitled Record";
}

// Get secondary info (agent, source, category, etc.)
export function getRecordMeta(
  record: AnyRecord,
): { label: string; value: string }[] {
  const meta: { label: string; value: string }[] = [];

  if (record.agent_id)
    meta.push({ label: "Agent", value: String(record.agent_id) });
  if (record.status)
    meta.push({ label: "Status", value: String(record.status) });
  if (record.severity)
    meta.push({ label: "Severity", value: String(record.severity) });
  if (record.category)
    meta.push({ label: "Category", value: String(record.category) });
  if (record.phase) meta.push({ label: "Phase", value: String(record.phase) });

  // Nested decision info
  if (record.decision && typeof record.decision === "object") {
    const dec = record.decision as Record<string, unknown>;
    if (dec.category)
      meta.push({ label: "Category", value: String(dec.category) });
    if (dec.reversibility && typeof dec.reversibility === "object") {
      const rev = dec.reversibility as Record<string, unknown>;
      if (rev.type)
        meta.push({ label: "Reversibility", value: String(rev.type) });
    }
  }

  return meta;
}

export function parseJsonlContent(content: string): {
  records: AnyRecord[];
  errors: ParseError[];
} {
  const lines = content.split("\n").filter((line) => line.trim());
  const records: AnyRecord[] = [];
  const errors: ParseError[] = [];

  lines.forEach((line, index) => {
    try {
      const parsed = JSON.parse(line);
      // Add an ID if not present
      if (!parsed.id) {
        parsed.id = `line-${index + 1}`;
      }
      // Infer and set type if not present
      if (!parsed.type) {
        parsed.type = inferRecordCategory(parsed);
      }
      records.push(parsed);
    } catch (e) {
      errors.push({
        line: index + 1,
        error: e instanceof Error ? e.message : "Unknown parse error",
        rawContent: line,
      });
    }
  });

  return { records, errors };
}

export function parseJsonlFile(
  fileName: string,
  content: string,
): ParsedJsonlFile {
  const { records, errors } = parseJsonlContent(content);
  const fileCategory = inferFileCategory(fileName, records);

  // Build correlations from all records
  const correlations: RecordCorrelation[] = [];
  for (const record of records) {
    const refs = extractReferences(record as Record<string, unknown>);

    for (const taskId of refs.taskIds) {
      correlations.push({
        type: "task",
        value: taskId,
        sourceFile: fileName,
        sourceRecordId: record.id,
      });
    }

    for (const decisionId of refs.decisionIds) {
      correlations.push({
        type: "decision",
        value: decisionId,
        sourceFile: fileName,
        sourceRecordId: record.id,
      });
    }

    for (const url of refs.urls) {
      correlations.push({
        type: "url",
        value: url,
        sourceFile: fileName,
        sourceRecordId: record.id,
      });
    }

    for (const fileRef of refs.fileRefs) {
      correlations.push({
        type: "file",
        value: fileRef,
        sourceFile: fileName,
        sourceRecordId: record.id,
      });
    }
  }

  const file: JsonlFile = {
    name: fileName,
    path: fileName,
    recordCount: records.length,
  };

  return {
    file,
    records,
    parseErrors: errors,
    fileCategory,
    correlations,
  };
}

export function groupRecordsByType(
  records: AnyRecord[],
): Map<string, AnyRecord[]> {
  const grouped = new Map<string, AnyRecord[]>();

  for (const record of records) {
    const type = record.type || "unknown";
    const existing = grouped.get(type) || [];
    existing.push(record);
    grouped.set(type, existing);
  }

  return grouped;
}

export function getRecordFields(records: AnyRecord[]): string[] {
  const fields = new Set<string>();

  for (const record of records) {
    for (const key of Object.keys(record)) {
      fields.add(key);
    }
  }

  return Array.from(fields).sort();
}

export function filterRecords(
  records: AnyRecord[],
  query: string,
): AnyRecord[] {
  if (!query.trim()) return records;

  const lowerQuery = query.toLowerCase();

  return records.filter((record) => {
    const jsonString = JSON.stringify(record).toLowerCase();
    return jsonString.includes(lowerQuery);
  });
}

export function formatRecordValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "—";
  }
  if (typeof value === "object") {
    return JSON.stringify(value, null, 2);
  }
  return String(value);
}

// Build cross-file correlation index
export function buildCorrelationIndex(
  files: ParsedJsonlFile[],
): Map<
  string,
  { type: string; occurrences: { file: string; recordId: string }[] }
> {
  const index = new Map<
    string,
    { type: string; occurrences: { file: string; recordId: string }[] }
  >();

  for (const file of files) {
    for (const corr of file.correlations) {
      const key = `${corr.type}:${corr.value}`;
      const existing = index.get(key) || { type: corr.type, occurrences: [] };
      existing.occurrences.push({
        file: corr.sourceFile,
        recordId: corr.sourceRecordId,
      });
      index.set(key, existing);
    }
  }

  return index;
}

// Get correlations that appear in multiple files
export function getCrossFileCorrelations(
  files: ParsedJsonlFile[],
): { type: string; value: string; files: string[] }[] {
  const index = buildCorrelationIndex(files);
  const crossFile: { type: string; value: string; files: string[] }[] = [];

  for (const [key, data] of index.entries()) {
    const uniqueFiles = [...new Set(data.occurrences.map((o) => o.file))];
    if (uniqueFiles.length > 1) {
      const [type, ...valueParts] = key.split(":");
      crossFile.push({ type, value: valueParts.join(":"), files: uniqueFiles });
    }
  }

  return crossFile.sort((a, b) => b.files.length - a.files.length);
}
