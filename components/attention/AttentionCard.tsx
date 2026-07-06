"use client";

import Link from "next/link";
import { Wrench, FolderGit2, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AttentionCard as AttentionCardData } from "@/lib/attention/adapter";
import { formatAge } from "@/lib/attention/format";
import { StatusOrb, statusLabel } from "./StatusOrb";
import { Sparkline } from "./Sparkline";

interface AttentionCardProps {
  card: AttentionCardData;
  /** Current epoch ms, refreshed by the board so "time-in-state" stays live. */
  now: number;
}

/**
 * One glanceable row per agent session. The whole card deep-links to the
 * existing session detail / TurnGroup timeline.
 */
export function AttentionCard({ card, now }: AttentionCardProps) {
  const age = card.since != null ? formatAge(now - card.since) : "—";

  return (
    <Link
      href={`/ai-coding/sessions/${encodeURIComponent(card.id)}`}
      className={cn(
        "group flex flex-col gap-3 rounded-lg border border-border bg-card p-4",
        "transition-colors hover:border-primary/50 hover:bg-muted/40",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      <div className="flex items-start gap-3">
        <StatusOrb status={card.status} className="mt-1" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium text-foreground">
              {card.label}
            </span>
            <span className="text-xs text-muted-foreground">
              {statusLabel(card.status)}
            </span>
          </div>
          {card.cwd && (
            <p className="truncate font-mono text-xs text-muted-foreground">
              {card.cwd}
            </p>
          )}
        </div>
        <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground tabular-nums">
          <Clock className="h-3 w-3" aria-hidden />
          {age}
        </span>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
          {card.repoBranch && (
            <span className="flex items-center gap-1 truncate">
              <FolderGit2 className="h-3 w-3 shrink-0" aria-hidden />
              {card.repoBranch}
            </span>
          )}
          <span className="flex items-center gap-1 truncate font-mono">
            <Wrench className="h-3 w-3 shrink-0" aria-hidden />
            {card.lastTool ?? "no tools yet"}
          </span>
        </div>
        <Sparkline data={card.sparkline} className="shrink-0" />
      </div>
    </Link>
  );
}
