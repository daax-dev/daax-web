"use client";

import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { badgeState, isTransitional, type SessionState } from "./state";

const STYLES: Record<ReturnType<typeof badgeState>, string> = {
  creating: "border-primary/40 bg-primary/10 text-primary",
  running: "border-success/40 bg-success/10 text-success",
  suspended: "border-warning/40 bg-warning/10 text-warning",
  ending: "border-muted-foreground/40 bg-muted text-muted-foreground",
  error: "border-destructive/40 bg-destructive/10 text-destructive",
};

/** Persistent session state badge (creating / running / suspended / ending / error). */
export function SessionStateBadge({
  state,
  className,
}: {
  state: SessionState;
  className?: string;
}) {
  const b = badgeState(state);
  const label = state === "suspending" || state === "resuming" ? state : b;
  return (
    <span
      data-testid="session-state"
      data-state={b}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium capitalize whitespace-nowrap",
        STYLES[b],
        className,
      )}
    >
      {isTransitional(state) ? (
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
      ) : (
        <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      )}
      {label}
    </span>
  );
}
