"use client";

/**
 * The full-width notice shown when the daemon could not be read. Three kinds,
 * three different sentences, three different test ids — a refusal, an
 * unreachable daemon and an error are different facts, and rendering any of
 * them as an empty list is the failure dist-agent exists to avoid.
 */

import { ShieldOff, WifiOff, AlertCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { DaemonFailureKind } from "@/lib/agentview/types";

interface DaemonNoticeProps {
  kind: DaemonFailureKind;
  message: string;
  status?: number;
  /** The daemon URL, when the caller knows it. */
  daemonUrl?: string;
}

const TITLES: Record<DaemonFailureKind, string> = {
  refused: "The daemon refused this request",
  unreachable: "Daemon unreachable",
  error: "The daemon returned an error",
};

const ICONS: Record<DaemonFailureKind, typeof ShieldOff> = {
  refused: ShieldOff,
  unreachable: WifiOff,
  error: AlertCircle,
};

const TONES: Record<DaemonFailureKind, string> = {
  refused: "border-warning/40 bg-warning/5 text-warning",
  unreachable: "border-destructive/40 bg-destructive/5 text-destructive",
  error: "border-destructive/40 bg-destructive/5 text-destructive",
};

export function DaemonNotice({
  kind,
  message,
  status,
  daemonUrl,
}: DaemonNoticeProps) {
  const Icon = ICONS[kind];
  return (
    <Card
      className={TONES[kind]}
      data-testid={`agentview-${kind}`}
      role="status"
    >
      <CardContent className="flex items-start gap-3 p-4">
        <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
        <div className="min-w-0 space-y-1">
          <p className="font-medium">
            {TITLES[kind]}
            {kind === "unreachable" && daemonUrl ? ` at ${daemonUrl}` : ""}
            {kind === "refused" && status ? ` (HTTP ${status})` : ""}
          </p>
          <p className="text-sm text-muted-foreground">
            {kind === "refused" &&
              "It is running and answered, but would not say. The agents, capabilities and events below are withheld rather than shown empty. "}
            {kind === "unreachable" &&
              "The proxy could not reach agentd at all, so nothing here is known — not that there are no agents, but that nobody could ask. "}
            {kind === "error" &&
              "The daemon answered with something other than a result. "}
            {message && (
              <span className="break-words font-mono text-xs">{message}</span>
            )}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
