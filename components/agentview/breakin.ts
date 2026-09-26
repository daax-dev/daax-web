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
 */
export function signalledExit(
  events: AgentEvent[],
  action: LastSignal,
): AgentEvent | undefined {
  if (action.kind !== "signal" || action.pid === undefined) return undefined;
  const after = Date.parse(action.at);
  return events.find(
    (event) =>
      (event.event_type === "EVENT_TYPE_PROCESS_EXITED" ||
        event.event_type === AGENT_STOPPED) &&
      event.node_id === action.nodeId &&
      event.agent_id === action.agentId &&
      event.process_id === action.pid &&
      Date.parse(event.timestamp) > after - SIGNAL_SKEW_MS,
  );
}

/**
 * The row still records the signalled pid and no longer reports it alive. A
 * row with no pid proves nothing: the daemon also shows that for a live
 * process it has not linked yet.
 */
function rowShowsSignalledEnd(
  agent: AgentInstance,
  action: LastSignal,
): boolean {
  return (
    action.kind === "signal" &&
    action.pid !== undefined &&
    agent.agent_id === action.agentId &&
    agent.agent_pid === action.pid &&
    !hasLiveProcess(agent)
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
 * Resume's precondition: this session's process is known to have ended. The
 * latest of the agent process's own start and stop events decides it, so a
 * later start (resumed elsewhere) undoes an earlier stop; failing any such
 * event, only this page's own signalled-exit reading counts.
 */
export function processKnownEnded(
  agent: AgentInstance,
  events: AgentEvent[],
  lastSignal: LastSignal | null,
): boolean {
  if (hasLiveProcess(agent)) return false;
  if (agent.process_alive === false) return true;
  const action = actionFor(agent, lastSignal);
  const candidates = events.filter(
    (event) =>
      LIFECYCLE_EVENT_TYPES.includes(event.event_type) &&
      event.node_id === agent.node_id &&
      event.session_id === agent.session_id,
  );
  const exit = action ? signalledExit(events, action) : undefined;
  if (exit) candidates.push(exit);
  if (candidates.length === 0)
    return !!action && rowShowsSignalledEnd(agent, action);
  const latest = candidates.reduce((a, b) =>
    sequenceOf(b) > sequenceOf(a) ? b : a,
  );
  return latest.event_type !== AGENT_STARTED;
}

export function breakinState(
  agent: AgentInstance,
  events: AgentEvent[],
  lastSignal: LastSignal | null,
  now: number,
): string {
  const action = actionFor(agent, lastSignal);
  const unknown = (reason: string) =>
    `unknown, because ${reason} · ${formatAge(action?.at ?? agent.last_activity, now)}`;
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
        return `interrupted (observed): process ${action.pid} ended ${afterSignal(action.at, exit.timestamp)} · signal ${formatAge(action.at, now)}`;
      if (rowShowsSignalledEnd(agent, action)) {
        // The row proves an end, but has no exit timestamp: label the signal's
        // age rather than assigning that timestamp to the process exit.
        return `interrupted (observed): process ${action.pid} ended after the signal · signal ${formatAge(action.at, now)}`;
      }
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
  if (hasLiveProcess(agent) && agent.state === "AGENT_STATE_ACTIVE")
    return "running";
  return unknown(
    `this session is ${stripEnum(agent.state)}; no live active process observed`,
  );
}
