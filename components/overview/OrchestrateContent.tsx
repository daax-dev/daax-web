"use client";

import { cn } from "@/lib/utils";
import { Monitor, Cloud, Sliders } from "lucide-react";

export function LocalAgents({ className }: { className?: string }) {
  return (
    <div className={cn("w-full max-w-3xl mx-auto", className)}>
      <div className="flex flex-col items-center text-center mb-8">
        <div className="w-16 h-16 rounded-2xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center mb-4">
          <Monitor className="w-8 h-8 text-cyan-400" />
        </div>
        <p className="text-lg text-muted-foreground max-w-xl">
          Run agents directly on your machine with full access to local
          resources. Zero network latency, maximum privacy—your code never
          leaves your hardware.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[
          "Native Docker or Podman integration",
          "Direct filesystem access with grants",
          "GPU passthrough for ML workloads",
          "Offline-capable operation",
        ].map((point, index) => (
          <div
            key={index}
            className="flex items-start gap-3 p-4 rounded-lg bg-muted/20 border border-border/40"
          >
            <div className="w-6 h-6 rounded-full bg-cyan-500/20 flex items-center justify-center text-xs font-semibold text-cyan-400 flex-shrink-0">
              {index + 1}
            </div>
            <span className="text-sm text-muted-foreground">{point}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function RemoteAgents({ className }: { className?: string }) {
  return (
    <div className={cn("w-full max-w-3xl mx-auto", className)}>
      <div className="flex flex-col items-center text-center mb-8">
        <div className="w-16 h-16 rounded-2xl bg-violet-500/20 border border-violet-500/40 flex items-center justify-center mb-4">
          <Cloud className="w-8 h-8 text-violet-400" />
        </div>
        <p className="text-lg text-muted-foreground max-w-xl">
          Execute agents on remote machines via Tailscale mesh networking.
          End-to-end encrypted, no port forwarding—access powerful cloud
          resources as if they were local.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[
          "Tailscale mesh for secure connectivity",
          "Agent handoff between local and remote",
          "Resource pooling across machines",
          "Session continuity on network changes",
        ].map((point, index) => (
          <div
            key={index}
            className="flex items-start gap-3 p-4 rounded-lg bg-muted/20 border border-border/40"
          >
            <div className="w-6 h-6 rounded-full bg-violet-500/20 flex items-center justify-center text-xs font-semibold text-violet-400 flex-shrink-0">
              {index + 1}
            </div>
            <span className="text-sm text-muted-foreground">{point}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AutonomyControls({ className }: { className?: string }) {
  return (
    <div className={cn("w-full max-w-3xl mx-auto", className)}>
      <div className="flex flex-col items-center text-center mb-8">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center mb-4">
          <Sliders className="w-8 h-8 text-amber-400" />
        </div>
        <p className="text-lg text-muted-foreground max-w-xl">
          Control how much freedom agents have. Set approval gates for
          destructive operations, auto-approve safe actions—calibrate autonomy
          to your comfort level.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[
          "Tiered approval: auto, confirm, block",
          "Per-action and per-file-path rules",
          "Time-boxed autonomous sessions",
          "Real-time intervention capability",
        ].map((point, index) => (
          <div
            key={index}
            className="flex items-start gap-3 p-4 rounded-lg bg-muted/20 border border-border/40"
          >
            <div className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center text-xs font-semibold text-amber-400 flex-shrink-0">
              {index + 1}
            </div>
            <span className="text-sm text-muted-foreground">{point}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
