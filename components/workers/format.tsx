"use client";

import { Badge } from "@/components/ui/badge";
import type { RunStatus, WorkerSummary } from "@/types/workers";

export function relativeTime(
  iso: string | null | undefined,
  now = Date.now(),
): string {
  if (!iso) return "—";
  const diff = new Date(iso).getTime() - now;
  const abs = Math.abs(diff);
  const units: [number, string][] = [
    [86_400_000, "d"],
    [3_600_000, "h"],
    [60_000, "m"],
  ];
  for (const [ms, label] of units) {
    if (abs >= ms) {
      const n = Math.round(abs / ms);
      return diff < 0 ? `${n}${label} ago` : `in ${n}${label}`;
    }
  }
  return diff < 0 ? "just now" : "in <1m";
}

export function localTime(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleString() : "—";
}

const STATE_VARIANT: Record<
  WorkerSummary["state"],
  "default" | "secondary" | "destructive" | "outline"
> = {
  running: "default",
  idle: "secondary",
  paused: "outline",
  failing: "destructive",
};

export function StateBadge({ state }: { state: WorkerSummary["state"] }) {
  return (
    <Badge variant={STATE_VARIANT[state]} data-testid="worker-state">
      {state}
    </Badge>
  );
}

const RUN_VARIANT: Record<
  RunStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  queued: "outline",
  running: "default",
  succeeded: "secondary",
  failed: "destructive",
  timeout: "destructive",
  cancelled: "outline",
};

export function RunStatusBadge({ status }: { status: RunStatus }) {
  return <Badge variant={RUN_VARIANT[status]}>{status}</Badge>;
}

export const MODE_LABEL: Record<WorkerSummary["runMode"], string> = {
  schedule: "Scheduled",
  adhoc: "Ad hoc",
  continuous: "Continuous",
};
