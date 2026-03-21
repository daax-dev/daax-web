"use client";

import { cn } from "@/lib/utils";
import { Terminal, Bot, Puzzle, Code2 } from "lucide-react";

interface ContentCard {
  icon: React.ReactNode;
  title: string;
  points: string[];
}

export function SharedTerminal({ className }: { className?: string }) {
  return (
    <ContentSlide
      className={className}
      icon={<Terminal className="w-8 h-8 text-cyan-400" />}
      description="A multiplexed terminal that records every keystroke and output. Replay sessions for debugging, training, or audit—complete with timestamps and context markers."
      points={[
        "Asciinema-compatible recording format",
        "Real-time streaming to observers",
        "Searchable command history across sessions",
        "Integration with session events timeline",
      ]}
    />
  );
}

export function AIAgents({ className }: { className?: string }) {
  return (
    <ContentSlide
      className={className}
      icon={<Bot className="w-8 h-8 text-violet-400" />}
      description="Run Claude Code, Aider, Goose, or any CLI-based AI agent in isolated containers. Each agent inherits your permission grants and contributes to the shared session log."
      points={[
        "Pre-configured containers for popular agents",
        "Shared MCP server access across agents",
        "Automatic session recording and decision logging",
        "Hot-swap between agents mid-session",
      ]}
    />
  );
}

export function MCPProtocol({ className }: { className?: string }) {
  return (
    <ContentSlide
      className={className}
      icon={<Puzzle className="w-8 h-8 text-amber-400" />}
      description="Model Context Protocol enables agents to share tools, resources, and context. Define MCP servers once—every agent in your session can use them."
      points={[
        "Unified tool interface across all agents",
        "Server discovery and health monitoring",
        "Permission-scoped tool access",
        "Custom MCP server development kit",
      ]}
    />
  );
}

export function VSCodeIntegration({ className }: { className?: string }) {
  return (
    <ContentSlide
      className={className}
      icon={<Code2 className="w-8 h-8 text-blue-400" />}
      description="Full VS Code experience in your browser via code-server. Extensions, themes, and settings sync—your familiar environment, accessible anywhere."
      points={[
        "code-server with GPU passthrough support",
        "Extension marketplace access",
        "Workspace persistence across sessions",
        "Integrated with daax terminal and recording",
      ]}
    />
  );
}

// Reusable content slide component
function ContentSlide({
  className,
  icon,
  description,
  points,
}: {
  className?: string;
  icon: React.ReactNode;
  description: string;
  points: string[];
}) {
  return (
    <div className={cn("w-full max-w-3xl mx-auto", className)}>
      {/* Icon and description */}
      <div className="flex flex-col items-center text-center mb-8">
        <div className="w-16 h-16 rounded-2xl bg-muted/30 border border-border/50 flex items-center justify-center mb-4">
          {icon}
        </div>
        <p className="text-lg text-muted-foreground max-w-xl">{description}</p>
      </div>

      {/* Key points */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {points.map((point, index) => (
          <div
            key={index}
            className="flex items-start gap-3 p-4 rounded-lg bg-muted/20 border border-border/40"
          >
            <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-semibold text-primary flex-shrink-0">
              {index + 1}
            </div>
            <span className="text-sm text-muted-foreground">{point}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
