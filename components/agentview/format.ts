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
export const eventSummary = (event: AgentEvent): string => {
  const a = event.attributes ?? {};
  if (a.tool_name) return a.tool_name;
  if (a.command) return truncate(a.command, 80);
  if (a.executable) return a.executable;
  if (a.path) return a.path;
  return "";
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
