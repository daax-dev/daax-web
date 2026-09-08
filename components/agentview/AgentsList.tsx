"use client";

/**
 * One card per agent the daemon observes. An empty list says "no agents
 * observed" — the daemon is up and saw none — which is a different sentence
 * from the refusal and unreachable notices the panel renders in its place.
 */

import type { ComponentType } from "react";
import { Bot, Eye, EyeOff, GitBranch } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { AGENT_ICONS, AGENT_ACCENTS } from "@/components/icons/AgentIcons";
import { formatAge, stripEnum } from "@/lib/agentview/client";
import type { AgentInstance } from "@/lib/agentview/types";
import { cn } from "@/lib/utils";
import { agentSubject, formatStamp, stateClasses } from "./format";

/** The states a card is shown for without asking. Compared by full enum. */
const ACTIVE_STATES = new Set<string>([
  "AGENT_STATE_ACTIVE",
  "AGENT_STATE_WAITING",
]);

interface AgentsListProps {
  agents: AgentInstance[];
  selectedId: string | null;
  onSelect: (agentId: string | null) => void;
  includeFinished: boolean;
  onToggleFinished: () => void;
  now?: number;
}

// Read as a plain map so an agent_type the icon set has never heard of falls
// through to the generic glyph instead of failing to index.
const ICONS: Record<
  string,
  ComponentType<{ className?: string }>
> = AGENT_ICONS;

function AgentCard({
  agent,
  selected,
  onClick,
  now,
}: {
  agent: AgentInstance;
  selected: boolean;
  onClick: () => void;
  now: number;
}) {
  const Icon = ICONS[agent.agent_type] ?? Bot;
  // The brand accent beside the brand mark, from the same canonical map the
  // AI Coding tab strip reads, so Claude is orange here as it is there and on
  // the daemon's own page rather than the text colour of whatever is around it.
  const accent =
    (AGENT_ACCENTS as Record<string, string>)[agent.agent_type] ??
    "text-muted-foreground";
  const subject = agentSubject(agent);
  const pct = agent.stats?.context_used_percent;
  return (
    <Card
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        "cursor-pointer space-y-2 p-3 transition-colors hover:bg-accent/40",
        selected && "ring-2 ring-ring",
      )}
      data-testid="agentview-agent"
      data-agent-id={agent.agent_id}
      data-state={agent.state}
    >
      <div className="flex items-center gap-2">
        <Icon
          className={cn("h-4 w-4 shrink-0", accent)}
          data-testid="agentview-agent-icon"
        />
        <span className="truncate text-sm font-medium">{agent.agent_type}</span>
        <Badge
          variant="outline"
          className={cn(
            "ml-auto font-mono text-[10px] uppercase",
            stateClasses[agent.state] ?? stateClasses.AGENT_STATE_UNSPECIFIED,
          )}
          data-testid="agentview-agent-state"
        >
          {stripEnum(agent.state)}
        </Badge>
      </div>
      {subject && (
        <p className="truncate text-xs" title={agent.cwd}>
          {subject}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {agent.git_branch && (
          <span className="inline-flex min-w-0 items-center gap-1">
            <GitBranch className="h-3 w-3 shrink-0" aria-hidden />
            <span className="truncate font-mono">{agent.git_branch}</span>
          </span>
        )}
        {agent.model && <span className="font-mono">{agent.model}</span>}
      </div>
      {typeof pct === "number" && (
        <div className="space-y-0.5">
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>context</span>
            <span className="font-mono">{Math.round(pct)}%</span>
          </div>
          <Progress
            value={Math.min(100, Math.max(0, pct))}
            className="h-1"
            aria-label="context used"
          />
        </div>
      )}
      {agent.last_activity && (
        <p
          className="text-[11px] text-muted-foreground"
          title={agent.last_activity}
          data-testid="agentview-agent-activity"
        >
          last activity {formatAge(agent.last_activity, now)}
          <span className="font-mono">
            {" "}
            · {formatStamp(agent.last_activity)}
          </span>
        </p>
      )}
    </Card>
  );
}

export function AgentsList({
  agents,
  selectedId,
  onSelect,
  includeFinished,
  onToggleFinished,
  now: nowProp,
}: AgentsListProps) {
  const now = nowProp ?? Date.now();
  // What is worth a card by default is what is running now: ACTIVE, or
  // WAITING on the operator. A session that is idle or has finished still has
  // a history worth reading — that is what the toggle is for — but a list that
  // led with them buried the one thing an operator opens this page to see.
  const shown = includeFinished
    ? agents
    : agents.filter((a) => ACTIVE_STATES.has(a.state));
  const hidden = agents.length - shown.length;
  return (
    <section className="space-y-2" data-testid="agentview-agents">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">
          agents{" "}
          <span
            className="font-mono text-xs text-muted-foreground"
            data-testid="agentview-agents-count"
          >
            {shown.length}
            {hidden > 0 && ` · ${hidden} inactive hidden`}
          </span>
        </h2>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={onToggleFinished}
          aria-pressed={includeFinished}
          data-testid="agentview-toggle-finished"
        >
          {includeFinished ? (
            <EyeOff className="mr-1 h-3.5 w-3.5" aria-hidden />
          ) : (
            <Eye className="mr-1 h-3.5 w-3.5" aria-hidden />
          )}
          {includeFinished ? "hide inactive" : "show inactive"}
        </Button>
      </div>
      {shown.length === 0 ? (
        <p
          className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground"
          data-testid="agentview-agents-empty"
        >
          no agents observed — the daemon is up and saw none
        </p>
      ) : (
        <div className="space-y-2">
          {shown.map((agent) => (
            <AgentCard
              key={agent.agent_id}
              agent={agent}
              selected={selectedId === agent.agent_id}
              onClick={() =>
                onSelect(selectedId === agent.agent_id ? null : agent.agent_id)
              }
              now={now}
            />
          ))}
        </div>
      )}
    </section>
  );
}
