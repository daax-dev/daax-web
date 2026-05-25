"use client";

import { cn } from "@/lib/utils";
import { Wrench, Server } from "lucide-react";

export function ToolFreedom({ className }: { className?: string }) {
  return (
    <div className={cn("w-full max-w-3xl mx-auto", className)}>
      <div className="flex flex-col items-center text-center mb-8">
        <div className="w-16 h-16 rounded-2xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center mb-4">
          <Wrench className="w-8 h-8 text-cyan-400" />
        </div>
        <p className="text-lg text-muted-foreground max-w-xl">
          No vendor lock-in. Use any CLI tool, any AI agent, any IDE. daax
          provides the secure execution layer—you choose the tools that work for
          your workflow.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[
          "Bring your own AI: Claude, GPT, Llama, etc.",
          "Any terminal-based tool works",
          "IDE-agnostic: VS Code, Vim, Emacs",
          "Custom MCP servers for proprietary tools",
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

export function DeploymentOptions({ className }: { className?: string }) {
  return (
    <div className={cn("w-full max-w-3xl mx-auto", className)}>
      <div className="flex flex-col items-center text-center mb-8">
        <div className="w-16 h-16 rounded-2xl bg-violet-500/20 border border-violet-500/40 flex items-center justify-center mb-4">
          <Server className="w-8 h-8 text-violet-400" />
        </div>
        <p className="text-lg text-muted-foreground max-w-xl">
          Deploy however you want. Run locally during development, self-host for
          your team, or deploy to the cloud—same interface, same security,
          anywhere.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[
          "Local: Direct on your machine",
          "Docker: Single container deployment",
          "Kubernetes: Scalable team deployment",
          "Cloud: Managed hosting options",
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
