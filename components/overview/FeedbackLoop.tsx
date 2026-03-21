"use client";

import { cn } from "@/lib/utils";
import { Users, Bot, RefreshCw, Lightbulb, TrendingUp } from "lucide-react";

interface RetroItem {
  role: "human" | "agent";
  question: string;
  insight: string;
}

const retroItems: RetroItem[] = [
  {
    role: "human",
    question: "Where did I provide unclear instructions?",
    insight: "Ambiguous task descriptions led to 3 revision cycles",
  },
  {
    role: "agent",
    question: "What assumptions did I make incorrectly?",
    insight: "Assumed test framework without checking project config",
  },
  {
    role: "human",
    question: "When should I have intervened earlier?",
    insight: "Agent went down wrong path for 12 minutes before correction",
  },
  {
    role: "agent",
    question: "Which tools could I have used more effectively?",
    insight: "Grep would have found the answer faster than reading files",
  },
];

export function FeedbackLoop({ className }: { className?: string }) {
  return (
    <div className={cn("w-full max-w-5xl mx-auto", className)}>
      {/* Central concept */}
      <div className="text-center mb-10">
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          After each session, recorded events power an <span className="text-primary font-semibold">agentic retrospective</span>—
          surfacing insights for both the human and the AI to improve.
        </p>
      </div>

      {/* Feedback loop visualization */}
      <div className="flex items-center justify-center gap-8 mb-12">
        {/* Human side */}
        <div className="flex flex-col items-center">
          <div className="w-16 h-16 rounded-full bg-cyan-500/20 border-2 border-cyan-500/50 flex items-center justify-center">
            <Users className="w-8 h-8 text-cyan-400" />
          </div>
          <span className="mt-2 text-sm font-medium">Human</span>
        </div>

        {/* Central loop icon */}
        <div className="flex flex-col items-center">
          <div className="w-20 h-20 rounded-full bg-muted/30 border-2 border-border flex items-center justify-center">
            <RefreshCw className="w-10 h-10 text-primary animate-spin-slow" />
          </div>
          <span className="mt-2 text-xs text-muted-foreground">Continuous Learning</span>
        </div>

        {/* Agent side */}
        <div className="flex flex-col items-center">
          <div className="w-16 h-16 rounded-full bg-violet-500/20 border-2 border-violet-500/50 flex items-center justify-center">
            <Bot className="w-8 h-8 text-violet-400" />
          </div>
          <span className="mt-2 text-sm font-medium">Agent</span>
        </div>
      </div>

      {/* Retrospective questions grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {retroItems.map((item, index) => (
          <div
            key={index}
            className={cn(
              "p-5 rounded-xl border",
              item.role === "human"
                ? "bg-cyan-500/5 border-cyan-500/30"
                : "bg-violet-500/5 border-violet-500/30"
            )}
          >
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0",
                  item.role === "human" ? "bg-cyan-500/20" : "bg-violet-500/20"
                )}
              >
                {item.role === "human" ? (
                  <Users className="w-4 h-4 text-cyan-400" />
                ) : (
                  <Bot className="w-4 h-4 text-violet-400" />
                )}
              </div>
              <div>
                <p className="font-medium text-foreground text-sm mb-2">
                  {item.question}
                </p>
                <div className="flex items-start gap-2">
                  <Lightbulb className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-muted-foreground">
                    {item.insight}
                  </p>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Outcome */}
      <div className="mt-10 p-6 rounded-xl bg-muted/20 border border-border/50 text-center">
        <div className="flex items-center justify-center gap-2 mb-3">
          <TrendingUp className="w-5 h-5 text-green-400" />
          <span className="font-semibold text-foreground">Outcome</span>
        </div>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          Each retrospective generates actionable improvements—better prompts, refined workflows,
          and calibrated agent behaviors—making every future session more effective.
        </p>
      </div>
    </div>
  );
}
