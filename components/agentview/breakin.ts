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
  /** Opened in a daax agent container, whose processes a daemon may not see. */
  container?: boolean;
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

export function breakinState(
  agent: AgentInstance,
  events: AgentEvent[],
  lastSignal: LastSignal | null,
  now: number,
): string {
  const action =
    lastSignal?.sessionId === agent.session_id &&
    lastSignal.nodeId === agent.node_id
      ? lastSignal
      : null;
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
      const exit = events.find(
        (event) =>
          event.event_type === "EVENT_TYPE_PROCESS_EXITED" &&
          event.node_id === action.nodeId &&
          event.agent_id === action.agentId &&
          Date.parse(event.timestamp) > after - SIGNAL_SKEW_MS,
      );
      if (exit)
        return `interrupted (observed): process ${action.pid} ended ${afterSignal(action.at, exit.timestamp)} · signal ${formatAge(action.at, now)}`;
      if (
        agent.agent_id === action.agentId &&
        !hasLiveProcess(agent) &&
        (agent.agent_pid === action.pid || agent.agent_pid === undefined)
      ) {
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
    // Never "running" on the old row's account, and never "resumed" unseen.
    if (action.kind === "resume" && action.container)
      return unknown(
        "the resume runs in a daax agent container and no new process for this session has been observed; a daemon on macOS cannot see container processes",
      );
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
