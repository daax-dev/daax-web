import type { AgentEvent, AgentInstance } from "@/lib/agentview/types";
import type { SignalReply } from "@/lib/agentview/client";
import { formatAge, stripEnum } from "@/lib/agentview/client";

/** The pre-action row is the baseline; an acknowledgment is never an observation. */
export interface LastSignal {
  at: string;
  agentId: string;
  sessionId: string;
  nodeId: string;
  pid?: number;
  reply?: SignalReply;
  reason?: string;
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
      agent.process_alive === true &&
      agent.agent_pid !== undefined &&
      (agent.agent_pid !== action.pid || agent.agent_id !== action.agentId) &&
      Date.parse(agent.agent_process_started_at ?? "") > after
    )
      return "resumed here (observed)";
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
    if (action.reply && agent.agent_type !== "claude")
      return unknown("the vendor records no interrupt");
    return unknown("nothing has been observed yet");
  }
  if (agent.process_alive === true && agent.state === "AGENT_STATE_ACTIVE")
    return "running";
  return unknown(
    `this session is ${stripEnum(agent.state)}; no live active process observed`,
  );
}
