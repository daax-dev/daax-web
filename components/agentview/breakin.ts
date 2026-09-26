import type { AgentEvent, AgentInstance } from "@/lib/agentview/types";
import type { SignalReply } from "@/lib/agentview/client";
import { formatAge, stripEnum } from "@/lib/agentview/client";

/** The pre-action row is the baseline; an acknowledgment is never an observation. */
export interface LastSignal {
  kind: "signal" | "resume";
  at: string;
  agentId: string;
  sessionId: string;
  nodeId: string;
  pid?: number;
  reply?: SignalReply;
  reason?: string;
}

/** Protojson omits false: only an explicit true is an observed live process. */
export function hasLiveProcess(agent: AgentInstance): boolean {
  return agent.process_alive === true;
}

/**
 * An exit this far before the signal is read as clock skew between the
 * browser, which stamps the signal, and the daemon, which stamps the exit.
 */
export const SIGNAL_SKEW_MS = 500;

/** How long after the signal the process ended: a delta, never a clock. */
export function afterSignal(signalAt: string, exitAt: string): string {
  const ms = Date.parse(exitAt) - Date.parse(signalAt);
  if (!(ms > 0)) return "at the signal";
  if (ms < 1000) return "under 1s after the signal";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s after the signal`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m after the signal`;
  return `${Math.floor(m / 60)}h after the signal`;
}

const AGENT_STARTED = "EVENT_TYPE_AGENT_STARTED";
const AGENT_STOPPED = "EVENT_TYPE_AGENT_STOPPED";
export const LIFECYCLE_EVENT_TYPES = [AGENT_STARTED, AGENT_STOPPED];

function sequenceOf(event: AgentEvent): bigint {
  try {
    return BigInt(event.sequence);
  } catch {
    return BigInt(-1);
  }
}

/**
 * The signalled process's own end. PROCESS_EXITED also reports every child in
 * the agent's subtree under the agent's id (its MCP servers, npm, gh), so only
 * an event carrying the signalled pid is the agent's process ending.
 *
 * An exit stamped up to SIGNAL_SKEW_MS before the signal is read as clock skew
 * only when the daemon answered "sent": a process that ended on its own just
 * before the click is refused on the daemon's pid re-check, and that refusal
 * is the reading, not an interrupt.
 */
export function signalledExit(
  events: AgentEvent[],
  action: LastSignal,
): AgentEvent | undefined {
  if (action.kind !== "signal" || action.pid === undefined) return undefined;
  const after = Date.parse(action.at);
  const earliest =
    action.reply?.outcome === "sent" ? after - SIGNAL_SKEW_MS : after;
  return events.find(
    (event) =>
      (event.event_type === "EVENT_TYPE_PROCESS_EXITED" ||
        event.event_type === AGENT_STOPPED) &&
      event.node_id === action.nodeId &&
      event.agent_id === action.agentId &&
      event.process_id === action.pid &&
      Date.parse(event.timestamp) > earliest,
  );
}

function actionFor(
  agent: AgentInstance,
  lastSignal: LastSignal | null,
): LastSignal | null {
  return lastSignal?.sessionId === agent.session_id &&
    lastSignal.nodeId === agent.node_id
    ? lastSignal
    : null;
}

/**
 * Resume's precondition: positive evidence that this session's process ended.
 * process_alive is a proto3 bool, so false and "cannot tell" are the same
 * absence on the wire, and neither a missing pid nor a STOPPED state (the
 * sweeper's word for long silence) is an exit. The evidence is the agent
 * process's own events: the latest of its starts and stops for this session
 * is a stop, or this page saw the signalled pid end. A later start undoes it.
 */
/**
 * Transcript records this long after the observed stop mean something else
 * is writing the session. The stop is stamped at the poll that found the
 * process gone, so the session's own last records precede it.
 */
export const REOPENED_SLACK_MS = 5_000;

export const NO_LIFECYCLE =
  "the daemon has recorded no start or stop of its process";

export function endEvidence(
  agent: AgentInstance,
  events: AgentEvent[],
  lastSignal: LastSignal | null,
): { ended: true } | { ended: false; why: string } {
  const action = actionFor(agent, lastSignal);
  // role "cli" is the session's own process. `claude --mcp-server` carries the
  // same --session-id and starts and stops on its own.
  const candidates = events.filter(
    (event) =>
      LIFECYCLE_EVENT_TYPES.includes(event.event_type) &&
      event.attributes?.role === "cli" &&
      event.node_id === agent.node_id &&
      event.session_id === agent.session_id,
  );
  const exit = action ? signalledExit(events, action) : undefined;
  if (exit) candidates.push(exit);
  if (candidates.length === 0) return { ended: false, why: NO_LIFECYCLE };
  const latest = candidates.reduce((a, b) =>
    sequenceOf(b) > sequenceOf(a) ? b : a,
  );
  if (latest.event_type !== AGENT_STARTED) {
    // The daemon links a Claude process to its session only through
    // --session-id or --resume <id>, so `claude -c`, the picker or in-app
    // /resume can reopen it unseen. A transcript that moved after the stop
    // shows that; one reopened and silent at its prompt does not.
    if (
      Date.parse(agent.last_activity ?? "") >
      Date.parse(latest.timestamp) + REOPENED_SLACK_MS
    )
      return {
        ended: false,
        why: "the session's transcript has records after its process was seen to stop; another process may be running it",
      };
    return { ended: true };
  }
  return {
    ended: false,
    why: `the daemon saw its process start${latest.process_id !== undefined ? ` (pid ${latest.process_id})` : ""} and has not seen it stop, but does not report it alive`,
  };
}

export function breakinState(
  agent: AgentInstance,
  events: AgentEvent[],
  lastSignal: LastSignal | null,
  now: number,
): string {
  const action = actionFor(agent, lastSignal);
  // `now` is the page's tick, which can predate a signal sent a moment ago;
  // an action newer than the tick is "just now", never "in the future".
  const age = (at: string | undefined) =>
    at && Date.parse(at) > now ? "just now" : formatAge(at, now);
  const unknown = (reason: string) =>
    `unknown, because ${reason} · ${age(action?.at ?? agent.last_activity)}`;
  if (action) {
    const after = Date.parse(action.at);
    if (
      hasLiveProcess(agent) &&
      agent.agent_pid !== undefined &&
      (agent.agent_pid !== action.pid || agent.agent_id !== action.agentId) &&
      Date.parse(agent.agent_process_started_at ?? "") > after
    )
      return "resumed here (observed)";
    if (action.kind === "signal" && action.pid !== undefined) {
      const exit = signalledExit(events, action);
      if (exit)
        return `interrupted (observed): process ${action.pid} ended ${afterSignal(action.at, exit.timestamp)} · signal ${age(action.at)}`;
    }
    if (
      events.some(
        (event) =>
          event.event_type === "EVENT_TYPE_MODEL_REQUEST" &&
          event.node_id === agent.node_id &&
          event.session_id === agent.session_id &&
          event.attributes?.turn_interrupted === "true" &&
          Date.parse(event.timestamp) > after,
      )
    )
      return "interrupted (observed)";
    if (action.reason) return unknown(action.reason);
    if (
      action.reply?.outcome === "refused" ||
      action.reply?.outcome === "failed"
    )
      return unknown(
        `the daemon ${action.reply.outcome}: ${action.reply.error || action.reply.note}`,
      );
    if (
      action.kind === "signal" &&
      hasLiveProcess(agent) &&
      agent.agent_type !== "claude"
    )
      return unknown("the vendor records no interrupt");
    if (action.kind === "signal")
      return unknown("nothing has been observed yet");
  }
  if (hasLiveProcess(agent))
    return agent.state === "AGENT_STATE_ACTIVE"
      ? "running"
      : `running · the session is ${stripEnum(agent.state)}`;
  return unknown(
    `this session is ${stripEnum(agent.state)}; no live active process observed`,
  );
}
