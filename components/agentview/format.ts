/**
 * Display-only helpers for the Agent View tab. Nothing here talks to the
 * daemon; the wire helpers (`stripEnum`, `formatAge`, `parseInt64`) live in
 * `@/lib/agentview/client` and are the ones every component uses for values
 * that came off the wire.
 */

import type {
  AgentEvent,
  AgentInstance,
  AgentState,
} from "@/lib/agentview/types";

/** Last path segment of a directory, for a card that has no project name. */
export const basename = (path: string): string => {
  const trimmed = path.replace(/\/+$/, "");
  const idx = trimmed.lastIndexOf("/");
  return idx === -1 ? trimmed : trimmed.slice(idx + 1);
};

/** `HH:MM:SS.mmm` in the browser's local zone. */
export const formatClock = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
};

/**
 * `node/type/session` → `type · sess1234`. The agent id carries the node too,
 * which is noise on a single-node page; the first eight of the session are
 * enough to tell two sessions of one vendor apart.
 */
export const shortAgentId = (agentId: string): string => {
  const parts = agentId.split("/");
  if (parts.length < 3) return agentId;
  const type = parts[1];
  const session = parts.slice(2).join("/");
  return `${type} · ${session.slice(0, 8)}`;
};

export type EventFamily = "tool" | "model" | "process" | "file" | "other";

/** Which colour family a stripped event type belongs to. */
export const eventFamily = (eventType: string): EventFamily => {
  const t = eventType.replace(/^EVENT_TYPE_/, "");
  if (t.startsWith("TOOL_")) return "tool";
  if (t.startsWith("MODEL_")) return "model";
  if (t.startsWith("PROCESS_")) return "process";
  if (t.startsWith("FILE_")) return "file";
  return "other";
};

export const truncate = (s: string, max: number): string =>
  s.length <= max ? s : `${s.slice(0, max - 1)}…`;

/**
 * One line from an event's attributes, in order of how much it says:
 * the tool, the command, the executable, the path — or nothing.
 */
/**
 * The same rule the daemon's own page uses for a timeline row
 * (DETAIL_SUBJECT_KEY and DETAIL_ARGUMENT_KEYS in internal/api/web/index.html):
 * the subject is the tool's name when there is one, and the argument is the
 * first attribute, in most-specific-first order, that says what was done — a
 * command line before a serialized argument list, a preview of what the model
 * said before nothing. A row that showed only "Bash" for a tool call and
 * nothing for a model response was reporting the event type twice and the
 * event not at all.
 */
export const DETAIL_ARGUMENT_KEYS = [
  "prompt_preview",
  "text_preview",
  "command",
  "arguments_preview",
  "path",
  "query",
  "url",
  "subject",
  "branch",
  "result_preview",
  "executable",
  "changed_files",
  "error",
] as const;

/** Previews arrive capped at 512 characters by the adapters; one row is one line. */
export const DETAIL_VALUE_MAX = 120;

const collapse = (v: string): string => v.replace(/\s+/g, " ").trim();

export const eventSummary = (event: AgentEvent): string => {
  const a = event.attributes ?? {};
  const subject = a.tool_name ? collapse(a.tool_name) : "";
  const key = DETAIL_ARGUMENT_KEYS.find((k) => a[k]);
  const argument = key ? truncate(collapse(a[key]!), DETAIL_VALUE_MAX) : "";
  if (subject && argument) return `${subject} · ${argument}`;
  if (subject || argument) return subject || argument;
  // Nothing canonical matched. A few raw attributes beat an empty cell — the
  // daemon's page does the same — bounded in count and length, and without
  // the payload marker, which says a payload exists rather than what happened.
  return Object.entries(a)
    .filter(([k]) => k !== "raw_payload_bytes")
    .slice(0, 3)
    .map(([k, v]) => `${k}=${truncate(collapse(v), 40)}`)
    .join("  ");
};

/** Sort newest first by numeric sequence. */
export const bySequenceDesc = (
  toNumber: (s: string) => number,
): ((a: AgentEvent, b: AgentEvent) => number) => {
  return (a, b) => toNumber(b.sequence) - toNumber(a.sequence);
};

/** What a card shows as its subject: the project if known, else the cwd's basename. */
export const agentSubject = (agent: AgentInstance): string =>
  agent.project_name || (agent.cwd ? basename(agent.cwd) : "");

/** Tailwind classes for the state pill; compared by full enum, never by prefix. */
export const stateClasses: Record<AgentState, string> = {
  AGENT_STATE_ACTIVE: "border-success/40 bg-success/15 text-success",
  AGENT_STATE_WAITING: "border-warning/40 bg-warning/15 text-warning",
  AGENT_STATE_IDLE: "border-transparent bg-muted text-muted-foreground",
  AGENT_STATE_STOPPED: "border-border bg-transparent text-muted-foreground",
  AGENT_STATE_UNSPECIFIED: "border-border bg-transparent text-muted-foreground",
};
