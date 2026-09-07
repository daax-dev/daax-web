"use client";

/**
 * Every signal the node advertises, with its level and — when the level is
 * not AVAILABLE — the daemon's own sentence saying why. The detail is in the
 * DOM in full (clipped by CSS) so it is assertable and searchable, and the
 * tooltip is how a reader gets the whole sentence without a wide column.
 */

import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { stripEnum } from "@/lib/agentview/client";
import type { Capability, CapabilityLevel } from "@/lib/agentview/types";
import { cn } from "@/lib/utils";

interface CapabilitiesListProps {
  signals: Record<string, Capability>;
}

const LEVEL_CLASSES: Record<CapabilityLevel, string> = {
  CAPABILITY_LEVEL_AVAILABLE: "border-success/40 bg-success/15 text-success",
  CAPABILITY_LEVEL_LIMITED: "border-warning/40 bg-warning/15 text-warning",
  CAPABILITY_LEVEL_UNAVAILABLE:
    "border-destructive/40 bg-transparent text-muted-foreground",
  CAPABILITY_LEVEL_UNSPECIFIED:
    "border-border bg-transparent text-muted-foreground",
};

export function LevelBadge({
  level,
  className,
}: {
  level: CapabilityLevel;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "font-mono text-[10px] uppercase tracking-wide",
        LEVEL_CLASSES[level] ?? LEVEL_CLASSES.CAPABILITY_LEVEL_UNSPECIFIED,
        className,
      )}
    >
      {stripEnum(level)}
    </Badge>
  );
}

export function CapabilitiesList({ signals }: CapabilitiesListProps) {
  const names = Object.keys(signals).sort();
  if (names.length === 0) {
    return (
      <p
        className="text-xs text-muted-foreground"
        data-testid="agentview-caps-empty"
      >
        The node advertised no signals.
      </p>
    );
  }
  return (
    <TooltipProvider delayDuration={200}>
      <ul className="divide-y divide-border/60">
        {names.map((name) => {
          const cap = signals[name];
          const detail = cap.detail ?? "";
          return (
            <li
              key={name}
              className="flex items-start gap-2 py-1.5"
              data-testid={`agentview-cap-${name}`}
              data-level={cap.level}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-mono text-xs">{name}</span>
                  <LevelBadge level={cap.level} />
                </div>
                {detail ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <p className="mt-0.5 cursor-help truncate text-xs text-muted-foreground">
                        {detail}
                      </p>
                    </TooltipTrigger>
                    <TooltipContent
                      side="bottom"
                      align="start"
                      className="max-w-md whitespace-pre-wrap"
                    >
                      {detail}
                    </TooltipContent>
                  </Tooltip>
                ) : cap.level !== "CAPABILITY_LEVEL_AVAILABLE" ? (
                  <p className="mt-0.5 text-xs italic text-muted-foreground">
                    no reason given
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </TooltipProvider>
  );
}
