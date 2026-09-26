"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { AgentEvent, AgentInstance } from "@/lib/agentview/types";
import {
  fetchEvents,
  formatAge,
  signalAgent,
  type TerminalMode,
} from "@/lib/agentview/client";
import {
  containerResumeReason,
  resumeCommand,
  resumeParams,
  resumeUnavailableReason,
} from "@/lib/agentview/resume";
import { buildTerminalWsUrl } from "@/lib/websocket-utils";
import {
  breakinState,
  hasLiveProcess,
  endEvidence,
  LIFECYCLE_EVENT_TYPES,
  NO_LIFECYCLE,
  type LastSignal,
} from "./breakin";

/**
 * Resume needs positive evidence the session's process ended; without it a
 * resume could run beside the live process and fork the conversation.
 */
const CANNOT_TELL = "daax cannot tell whether this session is still running";

// This existing terminal owns the ticketed WebSocket, xterm, input and cleanup.
const Terminal = dynamic(
  () => import("@/components/terminal/Terminal").then((m) => m.Terminal),
  { ssr: false },
);

export interface BreakInProps {
  agent: AgentInstance;
  events: AgentEvent[];
  localNodeId: string;
  /** From daax's node header; undefined when daax did not say. */
  terminalMode?: TerminalMode;
  now: number;
  observationFailure?: string;
}

export function BreakIn({
  agent,
  events,
  localNodeId,
  terminalMode,
  now,
  observationFailure,
}: BreakInProps) {
  const [lastSignal, setLastSignal] = useState<LastSignal | null>(null);
  const [pending, setPending] = useState(false);
  const [signalRefusal, setSignalRefusal] = useState<string>();
  const [terminalRefusal, setTerminalRefusal] = useState<string>();
  const [terminalUrl, setTerminalUrl] = useState<string>();
  const control = agent.capabilities?.signals.control;
  const controlReason =
    control?.level === "CAPABILITY_LEVEL_UNAVAILABLE"
      ? control.detail ||
        "the daemon reports control UNAVAILABLE without a detail"
      : !control || control.level === "CAPABILITY_LEVEL_UNSPECIFIED"
        ? "the daemon has not reported whether control is available"
        : undefined;
  const live = hasLiveProcess(agent);
  // In a take-over Interrupt ends the process so it can be resumed; the daemon's
  // SIGINT ends Claude Code at its prompt as well as mid-turn. So a live process
  // is enough, whatever the transcript says the session is doing.
  const interruptReason =
    observationFailure ||
    controlReason ||
    (!live
      ? "nothing to interrupt: no live process has been observed for this session"
      : undefined);
  const command = resumeCommand(agent.agent_type, agent.session_id);
  const remoteReason =
    agent.node_id !== localNodeId
      ? `this session runs on ${agent.node_id}; daax's terminal opens a shell only on ${localNodeId}`
      : undefined;
  const modeReason =
    terminalMode === undefined
      ? "daax did not report whether its terminal runs in host or container mode"
      : terminalMode === "container"
        ? containerResumeReason(agent.agent_type, agent.cwd)
        : undefined;
  // Fixed facts: nothing observed later can change them.
  const fixedReason =
    remoteReason ||
    modeReason ||
    (!command ? resumeUnavailableReason(agent.agent_type) : undefined) ||
    (!agent.cwd ? "the daemon has not reported this session's cwd" : undefined);
  // The agent process's own start/stop events, which the timeline's window may
  // not reach. Re-read whenever the row's view of the process changes.
  const [lifecycle, setLifecycle] = useState<
    { events: AgentEvent[] } | { reason: string }
  >();
  const needsLifecycle = !live && !fixedReason;
  useEffect(() => {
    if (!needsLifecycle) return;
    let current = true;
    void fetchEvents({
      sessionId: agent.session_id,
      eventTypes: LIFECYCLE_EVENT_TYPES,
      descending: true,
      limit: 20,
    }).then((result) => {
      if (current)
        setLifecycle(
          result.ok
            ? { events: result.data.events ?? [] }
            : { reason: result.message },
        );
    });
    return () => {
      current = false;
    };
  }, [
    needsLifecycle,
    agent.session_id,
    agent.state,
    agent.agent_pid,
    agent.process_alive,
    lastSignal,
  ]);
  const observed =
    lifecycle && "events" in lifecycle
      ? [...events, ...lifecycle.events]
      : events;
  const evidence = endEvidence(agent, observed, lastSignal);
  // With no start or stop at all, say why the daemon could not link one.
  const vendorNote =
    evidence.ended || evidence.why !== NO_LIFECYCLE
      ? ""
      : agent.agent_type === "codex"
        ? "; for codex the daemon often cannot link a session to its process at all, so Resume waits for an observed exit"
        : agent.agent_type === "claude"
          ? "; it ties a Claude process to its session only when it was started with --session-id or --resume <id>, so a plain claude, claude -c or the picker cannot be linked"
          : "";
  const endedReason =
    live || evidence.ended
      ? undefined
      : !lifecycle
        ? "checking the daemon for whether this session's process has ended"
        : "reason" in lifecycle
          ? `${CANNOT_TELL}: the daemon's record of its process could not be read: ${lifecycle.reason}`
          : `${CANNOT_TELL}: ${evidence.why}${vendorNote}`;
  // Control governs signalling, not resuming: an ended session has no pid to
  // signal and is exactly the one to resume. A live one would be forked.
  const stillRunning = live
    ? `this session's process is still running${agent.agent_pid !== undefined ? ` (pid ${agent.agent_pid})` : ""}; interrupt it first — two processes on one session would fork the conversation`
    : undefined;
  const resumeReason =
    observationFailure ||
    stillRunning ||
    fixedReason ||
    endedReason ||
    terminalRefusal;
  const snapshot = (kind: LastSignal["kind"]): LastSignal => ({
    kind,
    at: new Date().toISOString(),
    agentId: agent.agent_id,
    sessionId: agent.session_id,
    nodeId: agent.node_id,
    pid: agent.agent_pid,
  });

  const interrupt = async () => {
    setSignalRefusal(undefined);
    if (interruptReason || pending) return;
    setPending(true);
    const before = snapshot("signal");
    setLastSignal(before);
    const result = await signalAgent(agent.agent_id);
    setLastSignal({ ...before, ...result });
    if (result.reason || (result.status && result.status >= 400))
      setSignalRefusal(
        result.reason || result.reply?.error || result.reply?.note,
      );
    setPending(false);
  };
  const resume = () => {
    if (resumeReason || !command || !agent.cwd || terminalUrl) return;
    setLastSignal(snapshot("resume"));
    setTerminalUrl(buildTerminalWsUrl(resumeParams(agent.cwd, command)));
  };
  const terminalError = (reason: string) => {
    setTerminalRefusal(reason);
    setLastSignal((previous) => ({
      ...(previous ?? snapshot("resume")),
      reason: `the terminal server refused: ${reason}`,
    }));
    setTerminalUrl(undefined);
  };
  // A relayed row or a 404 refusal names the peer control URL. Permit web links
  // only; never treat arbitrary reason text as an executable URL.
  const reason = lastSignal?.reply?.error || controlReason || "";
  const peerUrl = reason
    .match(/(?:reachable at|control surface at) (https?:\/\/[^\s,;)]+)/)?.[1]
    ?.replace(/[.!?:]+$/, "");

  return (
    <section
      className="space-y-3 rounded-lg border border-border p-4 text-sm"
      aria-label="Break in"
      data-testid="agentview-breakin"
    >
      <p className="break-all text-muted-foreground">{agent.agent_id}</p>
      <p role="status" data-testid="agentview-breakin-state">
        {observationFailure
          ? `unknown, because ${observationFailure} · ${formatAge(agent.last_activity, now)}`
          : breakinState(agent, observed, lastSignal, now)}
      </p>
      {signalRefusal && (
        <p data-testid="agentview-signal-refusal">{signalRefusal}</p>
      )}
      {lastSignal?.reply && (
        <p data-testid="agentview-signal-reply">
          {lastSignal.reply.outcome} ·{" "}
          {lastSignal.reply.recorded
            ? `event ${lastSignal.reply.event_id ?? "id not returned"}`
            : "not recorded"}{" "}
          · {lastSignal.reply.note}
        </p>
      )}
      {peerUrl && (
        <a
          className="underline"
          href={peerUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open control surface on the owning node
        </a>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          className="rounded border border-border px-3 py-2 disabled:opacity-60"
          disabled={!!interruptReason || pending}
          onClick={() => void interrupt()}
        >
          Interrupt{interruptReason ? ` — ${interruptReason}` : ""}
        </button>
        <button
          className="rounded border border-border px-3 py-2 disabled:opacity-60"
          disabled={!!resumeReason || !!terminalUrl || pending}
          onClick={resume}
        >
          Resume here{resumeReason ? ` — ${resumeReason}` : ""}
        </button>
      </div>
      {terminalUrl && (
        <Terminal
          wsUrl={terminalUrl}
          onError={terminalError}
          className="h-96"
        />
      )}
    </section>
  );
}
