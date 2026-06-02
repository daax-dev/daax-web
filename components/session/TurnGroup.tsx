"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { TurnGroup as TurnGroupData, ToolCall } from "@/lib/turn-cluster";

/** Minimum tool count that causes a group to be collapsed by default. */
const COLLAPSE_THRESHOLD = 3;

interface TurnGroupProps {
  group: TurnGroupData;
  /** Optional render function for individual tool rows. */
  renderTool?: (tool: ToolCall, index: number) => React.ReactNode;
}

/**
 * Renders a single turn group with a collapsible header chip.
 *
 * Groups with ≥ 3 tools are collapsed by default (aria-expanded="false").
 * Groups with < 3 tools are expanded by default (aria-expanded="true").
 * Clicking the header toggles the expanded state.
 */
export function TurnGroup({ group, renderTool }: TurnGroupProps) {
  const { turnIndex, tools } = group;
  const count = tools.length;
  const toolLabel = count === 1 ? "1 tool" : `${count} tools`;

  const [expanded, setExpanded] = useState(() => count < COLLAPSE_THRESHOLD);

  return (
    <div className="rounded-md border border-border mb-2">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center gap-2 px-3 py-2 text-sm font-medium text-left hover:bg-muted/50 transition-colors rounded-t-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {expanded ? (
          <ChevronDown
            className="h-4 w-4 text-muted-foreground shrink-0"
            aria-hidden
          />
        ) : (
          <ChevronRight
            className="h-4 w-4 text-muted-foreground shrink-0"
            aria-hidden
          />
        )}
        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold">
          Step {turnIndex}
        </span>
        <span className="text-muted-foreground text-xs">{toolLabel}</span>
      </button>

      {expanded && (
        <ul className="divide-y divide-border" role="list">
          {tools.map((tool, i) =>
            renderTool ? (
              <li key={i}>{renderTool(tool, i)}</li>
            ) : (
              <li
                key={i}
                className="px-3 py-2 text-xs font-mono text-muted-foreground"
              >
                {String(tool.name ?? tool.startedAt)}
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}
