"use client";

import { cn } from "@/lib/utils";
import {
  GitBranch,
  ExternalLink,
  Crown,
  Network,
  Brain,
  Shield,
  Code,
  TestTube,
  FileText,
  Server,
  Wrench,
} from "lucide-react";

const agentCategories = [
  {
    name: "Code Generation",
    icon: <Code className="w-4 h-4" />,
    color: "text-blue-400",
    agents: ["code-architect", "implementer", "refactorer"],
  },
  {
    name: "Quality Assurance",
    icon: <TestTube className="w-4 h-4" />,
    color: "text-green-400",
    agents: ["tester", "reviewer", "debugger"],
  },
  {
    name: "Security",
    icon: <Shield className="w-4 h-4" />,
    color: "text-red-400",
    agents: ["security-auditor", "vuln-scanner", "compliance"],
  },
  {
    name: "Documentation",
    icon: <FileText className="w-4 h-4" />,
    color: "text-yellow-400",
    agents: ["doc-writer", "api-documenter", "changelog"],
  },
  {
    name: "DevOps",
    icon: <Server className="w-4 h-4" />,
    color: "text-purple-400",
    agents: ["deployer", "ci-manager", "infra-planner"],
  },
];

export function ClaudeFlow({ className }: { className?: string }) {
  return (
    <div className={cn("w-full max-w-5xl mx-auto", className)}>
      {/* Hero banner */}
      <div className="mb-10">
        <img
          src="/claude-flow-banner.png"
          alt="Claude Flow"
          className="w-full max-w-3xl mx-auto rounded-xl shadow-lg mb-6"
        />
        <p className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed text-center">
          <span className="text-cyan-400 font-semibold">Claude Flow</span>{" "}
          orchestrates{" "}
          <span className="text-foreground font-semibold">
            60+ specialized agents
          </span>{" "}
          in coordinated swarms. Each agent is purpose-built—coding, review,
          testing, security, documentation, DevOps—and they work together to
          ship complete features.
        </p>
      </div>

      {/* Performance callout */}
      <div className="p-4 rounded-xl bg-cyan-500/10 border border-cyan-500/20 mb-10 text-center">
        <p className="text-sm text-muted-foreground">
          <span className="text-cyan-400">⚡</span> 84.8% SWE-Bench performance
          • 170+ MCP tools • Multi-LLM support (Claude, GPT, Gemini, local
          models)
        </p>
      </div>

      {/* Swarm Patterns */}
      <h3 className="font-semibold text-foreground mb-6 text-center">
        Swarm Coordination Patterns
      </h3>
      <div className="grid md:grid-cols-2 gap-6 mb-10">
        <div className="p-6 rounded-xl bg-muted/20 border border-border/50">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
              <Crown className="w-5 h-5 text-amber-400" />
            </div>
            <h4 className="font-semibold text-foreground">
              Hierarchical Swarms
            </h4>
          </div>
          <p className="text-sm text-muted-foreground mb-3">
            A queen agent coordinates worker agents. The queen breaks down
            tasks, assigns work, reviews outputs, and handles escalations.
            Workers focus on their specialty.
          </p>
          <div className="text-xs text-muted-foreground font-mono bg-muted/30 p-2 rounded">
            queen → [implementer, tester, reviewer] → merged PR
          </div>
        </div>

        <div className="p-6 rounded-xl bg-muted/20 border border-border/50">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-violet-500/20 flex items-center justify-center">
              <Network className="w-5 h-5 text-violet-400" />
            </div>
            <h4 className="font-semibold text-foreground">Mesh Swarms</h4>
          </div>
          <p className="text-sm text-muted-foreground mb-3">
            Agents communicate peer-to-peer without central coordination. Good
            for exploratory tasks where multiple approaches should be tried in
            parallel.
          </p>
          <div className="text-xs text-muted-foreground font-mono bg-muted/30 p-2 rounded">
            agent-a ↔ agent-b ↔ agent-c (consensus)
          </div>
        </div>
      </div>

      {/* Agent Categories */}
      <h3 className="font-semibold text-foreground mb-4 text-center">
        60+ Specialized Agents
      </h3>
      <div className="flex flex-wrap justify-center gap-3 mb-10">
        {agentCategories.map((category) => (
          <div
            key={category.name}
            className="p-4 rounded-xl bg-muted/20 border border-border/40"
          >
            <div className="flex items-center gap-2 mb-2">
              <span className={category.color}>{category.icon}</span>
              <span className="text-sm font-medium text-foreground">
                {category.name}
              </span>
            </div>
            <div className="flex flex-wrap gap-1">
              {category.agents.map((agent) => (
                <span
                  key={agent}
                  className="text-xs px-2 py-0.5 rounded bg-muted/30 text-muted-foreground"
                >
                  {agent}
                </span>
              ))}
            </div>
          </div>
        ))}
        <div className="p-4 rounded-xl bg-muted/20 border border-border/40 flex items-center">
          <span className="text-sm text-muted-foreground">
            + 45 more agents
          </span>
        </div>
      </div>

      {/* Self-Learning */}
      <div className="p-6 rounded-xl bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-500/20 mb-10">
        <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
          <Brain className="w-5 h-5 text-cyan-400" />
          Self-Learning System
        </h3>
        <p className="text-muted-foreground mb-4">
          Claude Flow remembers what works. Successful patterns—which agents to
          combine, what order to run them, how to handle specific codebases—are
          stored and reused. The system gets better at your specific workflows
          over time.
        </p>
        <div className="grid md:grid-cols-2 gap-4 text-sm">
          <div className="flex items-start gap-2">
            <span className="text-cyan-400">✓</span>
            <span className="text-muted-foreground">
              Pattern recognition across tasks
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-cyan-400">✓</span>
            <span className="text-muted-foreground">
              Codebase-specific optimizations
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-cyan-400">✓</span>
            <span className="text-muted-foreground">
              Agent performance metrics
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-cyan-400">✓</span>
            <span className="text-muted-foreground">
              Workflow templates from history
            </span>
          </div>
        </div>
      </div>

      {/* Get started */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="p-5 rounded-xl bg-muted/10 border border-border/40">
          <h4 className="font-semibold text-foreground mb-3 flex items-center gap-2">
            <Wrench className="w-4 h-4 text-cyan-400" />
            Quick Start
          </h4>
          <div className="text-sm font-mono bg-muted/30 p-3 rounded mb-3">
            npx claude-flow@v3alpha init
          </div>
          <p className="text-sm text-muted-foreground">
            Initializes Claude Flow in your project with default agent
            configurations and MCP tool integrations.
          </p>
        </div>
        <div className="p-5 rounded-xl bg-muted/10 border border-border/40">
          <h4 className="font-semibold text-foreground mb-3">Learn More</h4>
          <div className="space-y-2 text-sm">
            <a
              href="https://github.com/ruvnet/claude-flow"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-cyan-400 hover:underline"
            >
              <GitBranch className="w-4 h-4" />
              github.com/ruvnet/claude-flow
              <ExternalLink className="w-3 h-3" />
            </a>
            <p className="text-muted-foreground">
              Full documentation, agent catalog, and swarm configuration
              examples.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
