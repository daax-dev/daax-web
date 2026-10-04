"use client";

import { useEffect, useRef, useState } from "react";
import { Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  TERMINAL_RUN_STATUSES,
  type WorkerRun,
  type WorkerRunEvent,
} from "@/types/workers";
import { workersApi } from "./api";
import { RunStatusBadge, localTime } from "./format";
import { Markdown } from "./Markdown";

const POLL_MS = 2_000;

/** Follows a run: polls new events until the run reaches a terminal status. */
export function useRunFollower(runId: string | null) {
  const [run, setRun] = useState<WorkerRun | null>(null);
  const [events, setEvents] = useState<WorkerRunEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const lastSeq = useRef(-1);

  useEffect(() => {
    lastSeq.current = -1;
    setEvents([]);
    setRun(null);
    setError(null);
    if (!runId) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const res = await workersApi.run(runId, lastSeq.current);
        if (stopped) return;
        setRun(res.run);
        if (res.events.length) {
          lastSeq.current = res.events[res.events.length - 1].seq;
          setEvents((prev) => [...prev, ...res.events]);
        }
        // Keep draining pages before stopping, so a finished run with more
        // than one page of events is shown in full.
        if (res.hasMore) {
          if (!stopped) timer = setTimeout(() => void poll(), 0);
          return;
        }
        if (TERMINAL_RUN_STATUSES.includes(res.run.status)) return;
      } catch (e) {
        if (!stopped) setError((e as Error).message);
      }
      if (!stopped) timer = setTimeout(() => void poll(), POLL_MS);
    };
    void poll();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [runId]);

  return { run, events, error };
}

function EventLine({ e }: { e: WorkerRunEvent }) {
  const label =
    e.type === "tool_call" || e.type === "tool_result"
      ? `${e.type} ${e.tool ?? ""}`
      : e.type;
  return (
    <li className="grid grid-cols-[5.5rem_8rem_1fr] gap-2 border-b py-1 text-xs last:border-0">
      <span className="text-muted-foreground">
        {new Date(e.at).toLocaleTimeString()}
      </span>
      <span className="truncate font-mono" title={label}>
        {label}
      </span>
      <span className="whitespace-pre-wrap break-words">
        {e.text ??
          (e.data !== undefined ? JSON.stringify(e.data).slice(0, 300) : "")}
      </span>
    </li>
  );
}

export function RunTimeline({
  runId,
  showSummary = true,
}: {
  runId: string;
  showSummary?: boolean;
}) {
  const { run, events, error } = useRunFollower(runId);
  const active = run && !TERMINAL_RUN_STATUSES.includes(run.status);

  return (
    <div className="space-y-3" data-testid="run-timeline">
      {run && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <RunStatusBadge status={run.status} />
          <span>{run.trigger}</span>
          <span>{run.engine}</span>
          <span>queued {localTime(run.queuedAt)}</span>
          {run.usage.costUsd !== undefined && (
            <span>${run.usage.costUsd.toFixed(3)}</span>
          )}
          {run.usage.turns !== undefined && (
            <span>{run.usage.turns} turns</span>
          )}
          {active && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => void workersApi.cancelRun(run.id)}
            >
              <Square className="mr-1 h-3 w-3" /> Cancel
            </Button>
          )}
        </div>
      )}
      {run?.input && <p className="text-sm">&ldquo;{run.input}&rdquo;</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {run?.error && <p className="text-sm text-destructive">{run.error}</p>}
      {showSummary && run?.summary && (
        <div className="rounded border p-3">
          <Markdown text={run.summary} />
        </div>
      )}
      <details open={Boolean(active)}>
        <summary className="cursor-pointer text-xs text-muted-foreground">
          Activity ({events.length} events)
        </summary>
        <ul className="mt-2 max-h-96 overflow-y-auto">
          {events.map((e) => (
            <EventLine key={e.seq} e={e} />
          ))}
        </ul>
      </details>
    </div>
  );
}
