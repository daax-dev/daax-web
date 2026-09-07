"use client";

/**
 * The canonical event timeline, newest first. The "live" dot reports whether
 * the SSE stream is open; the rows carry their sequence and agent id as data
 * attributes so a test can watch the head advance and the filter hold.
 */

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatAge, stripEnum } from "@/lib/agentview/client";
import type { AgentEvent } from "@/lib/agentview/types";
import { cn } from "@/lib/utils";
import {
  eventFamily,
  eventSummary,
  formatClock,
  shortAgentId,
  type EventFamily,
} from "./format";

export type StreamState = "live" | "closed";

interface EventTimelineProps {
  events: AgentEvent[];
  streamState: StreamState;
  /** The agent the list is filtered to, for the header. */
  selectedAgentId: string | null;
  now?: number;
}

const FAMILY_CLASSES: Record<EventFamily, string> = {
  tool: "border-primary/40 bg-primary/10 text-primary",
  model: "border-success/40 bg-success/10 text-success",
  process: "border-border bg-muted text-muted-foreground",
  file: "border-warning/40 bg-warning/10 text-warning",
  other: "border-border bg-transparent text-foreground",
};

export function EventTimeline({
  events,
  streamState,
  selectedAgentId,
  now: nowProp,
}: EventTimelineProps) {
  const now = nowProp ?? Date.now();
  return (
    <Card className="overflow-hidden" data-testid="agentview-timeline">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <h2 className="text-sm font-medium">
          events{" "}
          <span className="font-mono text-xs text-muted-foreground">
            {events.length}
          </span>
          {selectedAgentId && (
            <span className="ml-2 font-mono text-xs text-muted-foreground">
              · {shortAgentId(selectedAgentId)}
            </span>
          )}
        </h2>
        <span
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
          data-testid="agentview-stream"
          data-state={streamState}
        >
          <span
            className={cn(
              "inline-block h-2 w-2 rounded-full",
              streamState === "live" ? "bg-success" : "bg-muted-foreground/40",
            )}
            aria-hidden
          />
          {streamState === "live" ? "live" : "stream closed"}
        </span>
      </div>
      {events.length === 0 ? (
        <p
          className="px-3 py-8 text-center text-xs text-muted-foreground"
          data-testid="agentview-events-empty"
        >
          no events yet
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">seq</TableHead>
              <TableHead className="w-28">time</TableHead>
              <TableHead className="w-40">type</TableHead>
              <TableHead className="w-40">agent</TableHead>
              <TableHead>summary</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.map((ev) => (
              <TableRow
                key={ev.event_id}
                data-testid="agentview-event"
                data-sequence={ev.sequence}
                data-agent-id={ev.agent_id ?? ""}
              >
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {ev.sequence}
                </TableCell>
                <TableCell
                  className="font-mono text-xs"
                  title={formatAge(ev.timestamp, now)}
                >
                  {formatClock(ev.timestamp)}
                </TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={cn(
                      "font-mono text-[10px]",
                      FAMILY_CLASSES[eventFamily(ev.event_type)],
                    )}
                  >
                    {stripEnum(ev.event_type)}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {ev.agent_id ? shortAgentId(ev.agent_id) : "—"}
                </TableCell>
                <TableCell className="max-w-md truncate font-mono text-xs">
                  {eventSummary(ev)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}
