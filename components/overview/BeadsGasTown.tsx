"use client";

import { cn } from "@/lib/utils";
import {
  Flame,
  Users,
  GitBranch,
  Database,
  Zap,
  Brain,
  ExternalLink,
  Truck,
  Crown,
} from "lucide-react";

export function BeadsGasTown({ className }: { className?: string }) {
  return (
    <div className={cn("w-full max-w-5xl mx-auto", className)}>
      {/* Hero statement */}
      <div className="text-center mb-10">
        <div className="w-20 h-20 rounded-2xl bg-orange-500/20 border border-orange-500/40 flex items-center justify-center mx-auto mb-6">
          <Flame className="w-10 h-10 text-orange-400" />
        </div>
        <p className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
          <span className="text-orange-400 font-semibold">Gas Town</span> is Steve Yegge&apos;s vision
          of the IDE for 2026: a multi-agent workspace where you tell{" "}
          <span className="text-foreground font-semibold">The Mayor</span> what you want,
          and coordinated AI agents make it happen. Built on{" "}
          <span className="text-orange-400 font-semibold">Beads</span>—a git-backed issue tracker
          that gives AI agents memory across sessions.
        </p>
      </div>

      {/* Mad Max theme callout */}
      <div className="p-4 rounded-xl bg-orange-500/10 border border-orange-500/20 mb-10 text-center">
        <p className="text-sm text-muted-foreground">
          <span className="text-orange-400">🔥</span> Named after the oil refinery citadel in Mad Max.
          The theme continues: Mayors, Rigs, Polecats, and Convoys.
        </p>
      </div>

      {/* Key Components */}
      <h3 className="font-semibold text-foreground mb-6 text-center">The Gas Town Architecture</h3>
      <div className="grid md:grid-cols-2 gap-6 mb-10">
        <div className="p-6 rounded-xl bg-muted/20 border border-border/50">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
              <Crown className="w-5 h-5 text-amber-400" />
            </div>
            <h4 className="font-semibold text-foreground">The Mayor</h4>
          </div>
          <p className="text-sm text-muted-foreground mb-3">
            Your primary AI coordinator. The Mayor is a Claude Code instance with full context
            about your workspace, projects, and agents. Start here—just tell the Mayor what
            you want to accomplish.
          </p>
          <div className="text-xs text-muted-foreground font-mono bg-muted/30 p-2 rounded">
            &quot;Mayor, I need to refactor the auth module and add OAuth support&quot;
          </div>
        </div>

        <div className="p-6 rounded-xl bg-muted/20 border border-border/50">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-cyan-500/20 flex items-center justify-center">
              <Truck className="w-5 h-5 text-cyan-400" />
            </div>
            <h4 className="font-semibold text-foreground">Rigs</h4>
          </div>
          <p className="text-sm text-muted-foreground mb-3">
            Project containers. Each rig wraps a git repository and manages its associated agents.
            The Mayor delegates work to rigs, which coordinate their own teams of workers.
          </p>
          <div className="text-xs text-muted-foreground font-mono bg-muted/30 p-2 rounded">
            rig:frontend • rig:backend • rig:infrastructure
          </div>
        </div>

        <div className="p-6 rounded-xl bg-muted/20 border border-border/50">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-violet-500/20 flex items-center justify-center">
              <Zap className="w-5 h-5 text-violet-400" />
            </div>
            <h4 className="font-semibold text-foreground">Polecats</h4>
          </div>
          <p className="text-sm text-muted-foreground mb-3">
            Ephemeral worker agents that spawn, complete a task, and disappear.
            No lingering state, no resource hogging—just focused execution.
          </p>
          <div className="text-xs text-muted-foreground font-mono bg-muted/30 p-2 rounded">
            polecat spawned → task complete → polecat terminated
          </div>
        </div>

        <div className="p-6 rounded-xl bg-muted/20 border border-border/50">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
              <Database className="w-5 h-5 text-green-400" />
            </div>
            <h4 className="font-semibold text-foreground">Beads</h4>
          </div>
          <p className="text-sm text-muted-foreground mb-3">
            Work tracking units stored in a <code className="text-xs bg-muted px-1 rounded">.beads</code> directory.
            Git + SQLite backend gives version control to structured data. Agents finally have memory.
          </p>
          <div className="text-xs text-muted-foreground font-mono bg-muted/30 p-2 rounded">
            bd create &quot;Implement OAuth flow&quot; --assign polecat-auth
          </div>
        </div>
      </div>

      {/* The Problem it Solves */}
      <div className="p-6 rounded-xl bg-gradient-to-r from-orange-500/10 to-red-500/10 border border-orange-500/20 mb-10">
        <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
          <Brain className="w-5 h-5 text-orange-400" />
          The &quot;AI Dementia&quot; Problem
        </h3>
        <p className="text-muted-foreground mb-4">
          AI coding agents have no memory between sessions. Every conversation starts fresh.
          Beads solves this by storing tasks, context, and decisions in a git-backed format
          that persists across sessions and can be shared between agents.
        </p>
        <div className="grid md:grid-cols-2 gap-4 text-sm">
          <div className="flex items-start gap-2">
            <span className="text-red-400">❌</span>
            <span className="text-muted-foreground">Without Beads: &quot;What were we working on?&quot;</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-green-400">✓</span>
            <span className="text-muted-foreground">With Beads: Agent reads .beads, knows full context</span>
          </div>
        </div>
      </div>

      {/* Current state and getting started */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="p-5 rounded-xl bg-muted/10 border border-border/40">
          <h4 className="font-semibold text-foreground mb-3">Current State (2026)</h4>
          <p className="text-sm text-muted-foreground">
            Gas Town is wild and evolving fast. $100/hour burn rates are possible.
            It&apos;s for a specific ambition level—teams ready to push the boundaries
            of what multi-agent development can do.
          </p>
        </div>
        <div className="p-5 rounded-xl bg-muted/10 border border-border/40">
          <h4 className="font-semibold text-foreground mb-3">Get Started</h4>
          <div className="space-y-2 text-sm">
            <a
              href="https://github.com/steveyegge/gastown"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-orange-400 hover:underline"
            >
              <GitBranch className="w-4 h-4" />
              github.com/steveyegge/gastown
              <ExternalLink className="w-3 h-3" />
            </a>
            <p className="text-muted-foreground">
              Clone the repo, install Beads, and summon the Mayor.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
