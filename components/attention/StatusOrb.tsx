"use client";

import { motion } from "motion/react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AttentionStatus } from "@/lib/attention/status";

/** Semantic (never hardcoded) colour + copy per status. */
const STATUS_META: Record<
  AttentionStatus,
  { dot: string; label: string; pulse: boolean }
> = {
  working: { dot: "bg-success", label: "Working", pulse: true },
  waiting: { dot: "bg-warning", label: "Waiting for input", pulse: true },
  idle: { dot: "bg-muted-foreground", label: "Idle", pulse: false },
  done: { dot: "bg-success", label: "Done", pulse: false },
  error: { dot: "bg-destructive", label: "Error", pulse: false },
};

export function statusLabel(status: AttentionStatus): string {
  return STATUS_META[status].label;
}

interface StatusOrbProps {
  status: AttentionStatus;
  className?: string;
}

/**
 * A single derived-status orb. Active states (working/waiting) pulse via the
 * motion library; `done` renders a check to disambiguate it from the green
 * `working` orb; `error` is destructive-coloured.
 */
export function StatusOrb({ status, className }: StatusOrbProps) {
  const meta = STATUS_META[status];

  return (
    <span
      role="img"
      aria-label={meta.label}
      title={meta.label}
      className={cn("relative inline-flex h-3 w-3 shrink-0", className)}
    >
      {meta.pulse && (
        <motion.span
          aria-hidden
          className={cn(
            "absolute inline-flex h-full w-full rounded-full opacity-60",
            meta.dot,
          )}
          animate={{ scale: [1, 1.9], opacity: [0.6, 0] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
        />
      )}
      <span
        className={cn(
          "relative inline-flex h-3 w-3 items-center justify-center rounded-full",
          meta.dot,
        )}
      >
        {status === "done" && (
          <Check
            className="h-2 w-2 text-success-foreground"
            strokeWidth={3}
            aria-hidden
          />
        )}
      </span>
    </span>
  );
}
