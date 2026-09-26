"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { AgentEvent, AgentInstance } from "@/lib/agentview/types";
import {
  checkContainerTranscript,
  formatAge,
  signalAgent,
  stripEnum,
  type TerminalMode,
} from "@/lib/agentview/client";
import {
  containerResumeParams,
  containerResumeReason,
  resumeCommand,
  resumeParams,
  resumeUnavailableReason,
} from "@/lib/agentview/resume";
import { buildTerminalWsUrl } from "@/lib/websocket-utils";
import { breakinState, hasLiveProcess, type LastSignal } from "./breakin";

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
  const [transcript, setTranscript] = useState<
    { exists: boolean } | { reason: string }
  >();
  const control = agent.capabilities?.signals.control;
  const controlReason =
    control?.level === "CAPABILITY_LEVEL_UNAVAILABLE"
      ? control.detail ||
        "the daemon reports control UNAVAILABLE without a detail"
      : !control || control.level === "CAPABILITY_LEVEL_UNSPECIFIED"
        ? "the daemon has not reported whether control is available"
        : undefined;
  const live = hasLiveProcess(agent);
  const passive = agent.state !== "AGENT_STATE_ACTIVE" || !live;
  const interruptReason =
    observationFailure ||
    controlReason ||
    (passive
      ? agent.state !== "AGENT_STATE_ACTIVE"
        ? `nothing to interrupt: this session is ${stripEnum(agent.state)}`
        : "nothing to interrupt: no process has been observed for this session"
      : undefined);
  const command = resumeCommand(agent.agent_type, agent.session_id);
  const remoteReason =
    agent.node_id !== localNodeId
      ? `this session runs on ${agent.node_id}; daax's terminal opens a shell only on ${localNodeId}`
      : undefined;
  const container = terminalMode === "container";
  const containerReason = container
    ? containerResumeReason(agent.agent_type, agent.session_id, agent.cwd)
    : undefined;
  // Asked only once every other container condition holds for a local session.
  const needsTranscript =
    container && !live && !remoteReason && !containerReason;
  useEffect(() => {
    if (!needsTranscript) return;
    let current = true;
    void checkContainerTranscript(agent.session_id).then((result) => {
      if (current) setTranscript(result);
    });
    return () => {
      current = false;
    };
  }, [needsTranscript, agent.session_id]);
  const transcriptReason = !needsTranscript
    ? undefined
    : !transcript
      ? "checking daax's container store for this session's transcript"
      : "reason" in transcript
        ? `daax could not check its container store: ${transcript.reason}`
        : !transcript.exists
          ? `daax's container store has no transcript for this session (.daax/claude/projects/-workspace/${agent.session_id}.jsonl)`
          : undefined;
  const modeReason =
    terminalMode === undefined
      ? "daax did not report whether its terminal runs in host or container mode"
      : containerReason || transcriptReason;
  const resumeLabel = container
    ? "Resume in a daax agent container (whole workspace mounted at /workspace)"
    : "Resume here";
  // Control governs signalling, not resuming: an ended session has no pid to
  // signal and is exactly the one to resume. A live one would be forked.
  const stillRunning = live
    ? `this session's process is still running${agent.agent_pid !== undefined ? ` (pid ${agent.agent_pid})` : ""}; interrupt it first — two processes on one session would fork the conversation`
    : undefined;
  const resumeReason =
    observationFailure ||
    stillRunning ||
    remoteReason ||
    modeReason ||
    (!command ? resumeUnavailableReason(agent.agent_type) : undefined) ||
    (!agent.cwd
      ? "the daemon has not reported this session's cwd"
      : undefined) ||
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
    setLastSignal({ ...snapshot("resume"), ...(container && { container }) });
    setTerminalUrl(
      buildTerminalWsUrl(
        container
          ? containerResumeParams(command)
          : resumeParams(agent.cwd, command),
      ),
    );
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
          : breakinState(agent, events, lastSignal, now)}
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
          {resumeLabel}
          {resumeReason ? ` — ${resumeReason}` : ""}
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
