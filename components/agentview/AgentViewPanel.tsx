"use client";

/**
 * Composition root for the Overview tab. Polls node, agents and events every
 * five seconds (skipping a tick while one is in flight), opens the SSE stream
 * once the first page of events has landed, and keeps the in-memory list
 * capped at 500.
 *
 * When the node read fails, the notice is the *only* thing rendered. An empty
 * agents list under a refusal would say "nothing is running" about a daemon
 * that said "I will not tell you", and that is the one rendering this tab
 * must never produce.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type AgentViewNode,
  fetchAgents,
  fetchEvents,
  fetchNode,
  openStream,
  parseInt64,
} from "@/lib/agentview/client";
import type {
  AgentEvent,
  AgentInstance,
  DaemonResult,
} from "@/lib/agentview/types";
// @ts-expect-error TS5097: explicit .tsx disambiguates BreakIn.tsx from breakin.ts on case-insensitive filesystems; both bundlers accept it.
import { BreakIn } from "./BreakIn.tsx";
import { AgentsList } from "./AgentsList";
import { DaemonNotice } from "./DaemonNotice";
import { EventTimeline, type StreamState } from "./EventTimeline";
import { NodeCard } from "./NodeCard";
import { bySequenceDesc } from "./format";

const POLL_MS = 5_000;
const TICK_MS = 15_000;
const EVENT_CAP = 500;
const EVENT_PAGE = 200;

type Failure = Extract<DaemonResult<unknown>, { ok: false }>;

/** Merge two lists by event_id, newest first, capped. */
const mergeEvents = (
  current: AgentEvent[],
  incoming: AgentEvent[],
): AgentEvent[] => {
  const seen = new Map<string, AgentEvent>();
  for (const ev of incoming) seen.set(ev.event_id, ev);
  for (const ev of current)
    if (!seen.has(ev.event_id)) seen.set(ev.event_id, ev);
  return Array.from(seen.values())
    .sort(bySequenceDesc((seq) => parseInt64(seq) ?? 0))
    .slice(0, EVENT_CAP);
};

export function AgentViewPanel() {
  const [node, setNode] = useState<DaemonResult<AgentViewNode> | null>(null);
  const [agents, setAgents] = useState<AgentInstance[]>([]);
  const [agentsFailure, setAgentsFailure] = useState<Failure | null>(null);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [eventsFailure, setEventsFailure] = useState<Failure | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [includeFinished, setIncludeFinished] = useState(false);
  const [streamState, setStreamState] = useState<StreamState>("closed");
  const [now, setNow] = useState(() => Date.now());

  const inFlight = useRef(false);
  const stream = useRef<{ close: () => void } | null>(null);
  const lastSequence = useRef<number>(0);

  // Ages are read when displayed, not when the page loaded.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  const noteSequence = (evs: AgentEvent[]) => {
    for (const ev of evs) {
      const s = parseInt64(ev.sequence);
      if (s !== undefined && s > lastSequence.current) lastSequence.current = s;
    }
  };

  const openLiveStream = useCallback(() => {
    if (stream.current) return;
    const handle = openStream({
      afterSequence: lastSequence.current || undefined,
      onEvent: (event) => {
        noteSequence([event]);
        setEvents((cur) => mergeEvents(cur, [event]));
      },
      onReplayComplete: () => setStreamState("live"),
      onError: () => {
        setStreamState("closed");
        stream.current?.close();
        stream.current = null;
      },
    });
    stream.current = handle;
  }, []);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const [n, a, e] = await Promise.all([
        fetchNode(),
        fetchAgents({ includeFinished }),
        fetchEvents({
          agentId: selectedAgentId ?? undefined,
          limit: EVENT_PAGE,
          descending: true,
        }),
      ]);
      setNode(n);
      if (a.ok) {
        setAgents(a.data.agents ?? []);
        setAgentsFailure(null);
      } else {
        setAgentsFailure(a);
      }
      if (e.ok) {
        const page = e.data.events ?? [];
        noteSequence(page);
        setEvents((cur) => mergeEvents(cur, page));
        setEventsFailure(null);
        if (n.ok) openLiveStream();
      } else {
        setEventsFailure(e);
      }
    } finally {
      inFlight.current = false;
    }
  }, [includeFinished, selectedAgentId, openLiveStream]);

  // First load, then poll. A change of filter reloads immediately.
  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  // Close the stream when the panel unmounts.
  useEffect(
    () => () => {
      stream.current?.close();
      stream.current = null;
    },
    [],
  );

  const nodeFailed = node !== null && !node.ok;
  const visibleEvents = selectedAgentId
    ? events.filter((ev) => ev.agent_id === selectedAgentId)
    : events;

  if (node === null) {
    return (
      <p
        className="py-12 text-center text-sm text-muted-foreground"
        data-testid="agentview-loading"
      >
        asking the daemon…
      </p>
    );
  }

  if (nodeFailed) {
    return (
      <DaemonNotice
        kind={node.kind}
        message={node.message}
        status={node.status}
        daemonUrl={process.env.NEXT_PUBLIC_AGENTVIEW_UI_URL}
      />
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
      <aside className="space-y-6">
        {agentsFailure ? (
          <DaemonNotice
            kind={agentsFailure.kind}
            message={agentsFailure.message}
            status={agentsFailure.status}
          />
        ) : (
          <AgentsList
            agents={agents}
            selectedId={selectedAgentId}
            onSelect={setSelectedAgentId}
            includeFinished={includeFinished}
            onToggleFinished={() => setIncludeFinished((v) => !v)}
            now={now}
          />
        )}
        <NodeCard node={node.data} now={now} />
      </aside>
      <main className="min-w-0 space-y-4">
        {agents
          .filter((agent) => agent.agent_id === selectedAgentId)
          .map((agent) => (
            <BreakIn
              key={agent.agent_id}
              agent={agent}
              events={visibleEvents}
              localNodeId={node.data.node.node_id}
              terminalLocal={node.data.terminalLocal === true}
              now={now}
              observationFailure={
                agentsFailure?.message || eventsFailure?.message
              }
            />
          ))}
        {eventsFailure ? (
          <DaemonNotice
            kind={eventsFailure.kind}
            message={eventsFailure.message}
            status={eventsFailure.status}
          />
        ) : (
          <EventTimeline
            events={visibleEvents}
            streamState={streamState}
            selectedAgentId={selectedAgentId}
            now={now}
          />
        )}
      </main>
    </div>
  );
}
