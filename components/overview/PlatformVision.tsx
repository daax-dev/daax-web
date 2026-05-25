"use client";

import { cn } from "@/lib/utils";
import { Users, Bot, ArrowRight, RefreshCw, Settings } from "lucide-react";

export function PlatformVision({ className }: { className?: string }) {
  return (
    <div className={cn("w-full max-w-4xl mx-auto", className)}>
      {/* Main vision statement */}
      <div className="text-center mb-12">
        <p className="text-xl md:text-2xl text-muted-foreground leading-relaxed">
          Secure{" "}
          <span className="text-primary font-semibold">
            agentic pair programming
          </span>{" "}
          with a continuous{" "}
          <span className="text-primary font-semibold">feedback loop</span>,
          fully <span className="text-primary font-semibold">customizable</span>{" "}
          to your workflow.
        </p>
      </div>

      {/* Visual diagram of the pair programming loop */}
      <div className="relative flex items-center justify-center gap-8 md:gap-16 py-8">
        {/* Human */}
        <div className="flex flex-col items-center gap-3">
          <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-cyan-500/20 border-2 border-cyan-500/50 flex items-center justify-center">
            <Users className="w-10 h-10 md:w-12 md:h-12 text-cyan-400" />
          </div>
          <span className="text-sm font-medium text-foreground">Human</span>
          <span className="text-xs text-muted-foreground">
            Intent & Oversight
          </span>
        </div>

        {/* Bidirectional arrows with feedback loop indicator */}
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2">
            <ArrowRight className="w-6 h-6 text-cyan-400" />
            <div className="w-16 h-0.5 bg-gradient-to-r from-cyan-500 to-violet-500" />
            <ArrowRight className="w-6 h-6 text-violet-400 rotate-180" />
          </div>
          <RefreshCw className="w-5 h-5 text-muted-foreground animate-spin-slow" />
          <span className="text-xs text-muted-foreground">
            Continuous Feedback
          </span>
        </div>

        {/* AI Agent */}
        <div className="flex flex-col items-center gap-3">
          <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-violet-500/20 border-2 border-violet-500/50 flex items-center justify-center">
            <Bot className="w-10 h-10 md:w-12 md:h-12 text-violet-400" />
          </div>
          <span className="text-sm font-medium text-foreground">AI Agent</span>
          <span className="text-xs text-muted-foreground">
            Execution & Insights
          </span>
        </div>
      </div>

      {/* Three pillars */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
        <div className="p-6 rounded-xl bg-muted/30 border border-border/50">
          <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center mb-4">
            <svg
              className="w-5 h-5 text-green-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
              />
            </svg>
          </div>
          <h3 className="font-semibold text-foreground mb-2">
            Secure by Design
          </h3>
          <p className="text-sm text-muted-foreground">
            Sandboxed execution, signed attestations, and granular permissions
            keep agents bounded.
          </p>
        </div>

        <div className="p-6 rounded-xl bg-muted/30 border border-border/50">
          <div className="w-10 h-10 rounded-lg bg-cyan-500/20 flex items-center justify-center mb-4">
            <RefreshCw className="w-5 h-5 text-cyan-400" />
          </div>
          <h3 className="font-semibold text-foreground mb-2">Feedback Loop</h3>
          <p className="text-sm text-muted-foreground">
            Every session generates insights for retrospectives—helping both
            human and agent improve.
          </p>
        </div>

        <div className="p-6 rounded-xl bg-muted/30 border border-border/50">
          <div className="w-10 h-10 rounded-lg bg-violet-500/20 flex items-center justify-center mb-4">
            <Settings className="w-5 h-5 text-violet-400" />
          </div>
          <h3 className="font-semibold text-foreground mb-2">Your Workflow</h3>
          <p className="text-sm text-muted-foreground">
            Plug in your preferred tools, agents, and processes—daax adapts to
            how you work.
          </p>
        </div>
      </div>
    </div>
  );
}
