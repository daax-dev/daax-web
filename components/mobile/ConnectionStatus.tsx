"use client";

import { motion } from "motion/react";

import type { UnblockStatus } from "@/hooks/useUnblockSession";

interface ConnectionStatusProps {
  status: UnblockStatus;
  sessionId: string | null;
}

// Map each status to a semantic color token + label. No hardcoded hex.
const META: Record<
  UnblockStatus,
  { dot: string; text: string; label: string }
> = {
  connecting: {
    dot: "bg-muted-foreground",
    text: "text-muted-foreground",
    label: "Connecting…",
  },
  open: { dot: "bg-primary", text: "text-foreground", label: "Connected" },
  closed: {
    dot: "bg-muted-foreground",
    text: "text-muted-foreground",
    label: "Disconnected",
  },
  error: {
    dot: "bg-destructive",
    text: "text-destructive",
    label: "Connection error",
  },
  unauthorized: {
    dot: "bg-destructive",
    text: "text-destructive",
    label: "Not authorized",
  },
};

/** Small live connection indicator for the mobile unblock view (#156). */
export function ConnectionStatus({ status, sessionId }: ConnectionStatusProps) {
  const meta = META[status];
  return (
    <div className="flex items-center gap-2 text-sm">
      <motion.span
        aria-hidden
        className={`inline-block h-2.5 w-2.5 rounded-full ${meta.dot}`}
        animate={
          status === "connecting" ? { opacity: [1, 0.3, 1] } : { opacity: 1 }
        }
        transition={
          status === "connecting"
            ? { repeat: Infinity, duration: 1.2 }
            : { duration: 0.2 }
        }
      />
      <span className={meta.text}>{meta.label}</span>
      {sessionId && (
        <span className="ml-auto font-mono text-xs text-muted-foreground">
          {sessionId.slice(0, 8)}
        </span>
      )}
    </div>
  );
}
