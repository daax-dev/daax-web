"use client";

import { cn } from "@/lib/utils";

interface SparklineProps {
  /** Bucket counts, oldest-first (from lib/attention/sparkline). */
  data: number[];
  className?: string;
}

/**
 * Minimal inline bar sparkline of tool-call activity. Pure presentational: bars
 * are scaled to the window's peak; a flat/empty window renders as baseline
 * ticks. Uses semantic tokens only.
 */
export function Sparkline({ data, className }: SparklineProps) {
  const peak = data.reduce((m, v) => (v > m ? v : m), 0);

  return (
    <div
      className={cn("flex h-6 items-end gap-0.5", className)}
      aria-label={`Activity: ${data.reduce((a, b) => a + b, 0)} tool calls`}
      role="img"
    >
      {data.map((v, i) => {
        // Percentage height; keep a 12% floor so empty buckets still read as a
        // baseline tick rather than vanishing.
        const pct = peak > 0 ? Math.max(12, (v / peak) * 100) : 12;
        return (
          <span
            key={i}
            aria-hidden="true"
            className={cn("w-1 rounded-sm", v > 0 ? "bg-primary" : "bg-muted")}
            style={{ height: `${pct}%` }}
          />
        );
      })}
    </div>
  );
}
