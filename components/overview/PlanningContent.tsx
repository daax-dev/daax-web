"use client";

import { cn } from "@/lib/utils";
import { Layers, ArrowRightLeft } from "lucide-react";

export function MultiProjectView({ className }: { className?: string }) {
  return (
    <div className={cn("w-full max-w-3xl mx-auto", className)}>
      <div className="flex flex-col items-center text-center mb-8">
        <div className="w-16 h-16 rounded-2xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center mb-4">
          <Layers className="w-8 h-8 text-cyan-400" />
        </div>
        <p className="text-lg text-muted-foreground max-w-xl">
          Manage multiple projects from a single interface. Visualize dependencies between repos,
          track cross-project tasks, and coordinate work across your entire codebase.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[
          "Hierarchical project organization",
          "Cross-repo dependency graphs",
          "Unified backlog across projects",
          "Workspace-level search and navigation",
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

export function ContextSwitching({ className }: { className?: string }) {
  return (
    <div className={cn("w-full max-w-3xl mx-auto", className)}>
      <div className="flex flex-col items-center text-center mb-8">
        <div className="w-16 h-16 rounded-2xl bg-violet-500/20 border border-violet-500/40 flex items-center justify-center mb-4">
          <ArrowRightLeft className="w-8 h-8 text-violet-400" />
        </div>
        <p className="text-lg text-muted-foreground max-w-xl">
          Switch projects seamlessly. daax detects your current directory, loads the relevant CLAUDE.md,
          and configures tools automatically—zero manual setup on context switches.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[
          "Auto-detect project from working directory",
          "Load CLAUDE.md instructions per-project",
          "Persist session context across switches",
          "Quick-switch keyboard shortcuts",
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
