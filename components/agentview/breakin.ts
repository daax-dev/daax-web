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
          Date.parse(event.timestamp) > after,
      );
      if (exit)
        return `interrupted (observed): process ${action.pid} ended ${formatAge(exit.timestamp, now)} after the signal`;
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
