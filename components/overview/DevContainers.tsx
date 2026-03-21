"use client";

import { cn } from "@/lib/utils";
import {
  Container,
  Users,
  Bot,
  RefreshCw,
  Zap,
  Shield,
  FileJson,
  CheckCircle,
} from "lucide-react";

export function DevContainers({ className }: { className?: string }) {
  return (
    <div className={cn("w-full max-w-5xl mx-auto", className)}>
      {/* Hero statement */}
      <div className="text-center mb-10">
        <div className="w-20 h-20 rounded-2xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center mx-auto mb-6">
          <Container className="w-10 h-10 text-cyan-400" />
        </div>
        <p className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
          DevContainers eliminate the &ldquo;works on my machine&rdquo; problem—for both humans and AI agents.
          Define your development environment once, and every contributor (human or AI) gets an{" "}
          <span className="text-cyan-400 font-semibold">identical, reproducible workspace</span> in seconds.
        </p>
      </div>

      {/* The Problem / Solution */}
      <div className="grid md:grid-cols-2 gap-6 mb-10">
        <div className="p-6 rounded-xl bg-red-500/5 border border-red-500/20">
          <h3 className="font-semibold text-red-400 mb-4 flex items-center gap-2">
            <span className="text-lg">❌</span> Without DevContainers
          </h3>
          <ul className="space-y-3 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="text-red-400 mt-1">•</span>
              AI agents guess at your toolchain versions and configurations
            </li>
            <li className="flex items-start gap-2">
              <span className="text-red-400 mt-1">•</span>
              Hours lost to environment setup when onboarding or switching projects
            </li>
            <li className="flex items-start gap-2">
              <span className="text-red-400 mt-1">•</span>
              &ldquo;It works locally&rdquo; but breaks in CI because of subtle differences
            </li>
            <li className="flex items-start gap-2">
              <span className="text-red-400 mt-1">•</span>
              Security risk: installing unknown dependencies on your host machine
            </li>
          </ul>
        </div>

        <div className="p-6 rounded-xl bg-green-500/5 border border-green-500/20">
          <h3 className="font-semibold text-green-400 mb-4 flex items-center gap-2">
            <span className="text-lg">✓</span> With DevContainers
          </h3>
          <ul className="space-y-3 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="text-green-400 mt-1">•</span>
              AI agents run in the exact same environment as you—same Node, same Python, same everything
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-400 mt-1">•</span>
              Clone repo → open in VS Code → environment ready in under 60 seconds
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-400 mt-1">•</span>
              CI uses the same container—dev, test, and prod are identical
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-400 mt-1">•</span>
              Isolated from your host: untrusted code can&apos;t touch your system
            </li>
          </ul>
        </div>
      </div>

      {/* How it works */}
      <div className="p-6 rounded-xl bg-muted/20 border border-border/50 mb-10">
        <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
          <FileJson className="w-5 h-5 text-cyan-400" />
          One Config, Everywhere
        </h3>
        <div className="bg-muted/30 rounded-lg p-4 font-mono text-sm overflow-x-auto">
          <pre className="text-muted-foreground">
{`// .devcontainer/devcontainer.json
{
  "name": "my-project",
  "image": "mcr.microsoft.com/devcontainers/typescript-node:20",
  "features": {
    "ghcr.io/devcontainers/features/docker-in-docker:2": {},
    "ghcr.io/devcontainers/features/github-cli:1": {}
  },
  "postCreateCommand": "bun install",
  "customizations": {
    "vscode": {
      "extensions": ["dbaeumer.vscode-eslint", "esbenp.prettier-vscode"]
    }
  }
}`}
          </pre>
        </div>
        <p className="text-sm text-muted-foreground mt-4">
          This single file defines your entire development environment: base image, installed tools,
          VS Code extensions, and post-setup commands. Commit it to your repo and everyone—including
          AI agents—gets the same setup.
        </p>
      </div>

      {/* Key benefits for AI coding */}
      <h3 className="font-semibold text-foreground mb-6 text-center">Why DevContainers Matter for AI Coding</h3>
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            icon: <Bot className="w-5 h-5" />,
            title: "AI Accuracy",
            description: "Agents know exactly what tools are available—no hallucinating package versions",
            color: "text-violet-400 bg-violet-500/20",
          },
          {
            icon: <RefreshCw className="w-5 h-5" />,
            title: "Reproducible",
            description: "Re-run any AI session with the exact same environment months later",
            color: "text-cyan-400 bg-cyan-500/20",
          },
          {
            icon: <Shield className="w-5 h-5" />,
            title: "Isolated",
            description: "AI-generated code runs in a container, not on your host machine",
            color: "text-green-400 bg-green-500/20",
          },
          {
            icon: <Zap className="w-5 h-5" />,
            title: "Fast",
            description: "Pre-built images mean environment setup in seconds, not hours",
            color: "text-amber-400 bg-amber-500/20",
          },
        ].map((benefit) => (
          <div
            key={benefit.title}
            className="p-4 rounded-xl bg-muted/10 border border-border/40"
          >
            <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center mb-3", benefit.color)}>
              {benefit.icon}
            </div>
            <h4 className="font-semibold text-foreground text-sm mb-1">{benefit.title}</h4>
            <p className="text-xs text-muted-foreground">{benefit.description}</p>
          </div>
        ))}
      </div>

      {/* Human + AI parity callout */}
      <div className="mt-10 p-6 rounded-xl bg-gradient-to-r from-cyan-500/10 to-violet-500/10 border border-cyan-500/20">
        <div className="flex items-center gap-4 justify-center mb-4">
          <div className="w-12 h-12 rounded-full bg-cyan-500/20 flex items-center justify-center">
            <Users className="w-6 h-6 text-cyan-400" />
          </div>
          <span className="text-2xl">=</span>
          <div className="w-12 h-12 rounded-full bg-violet-500/20 flex items-center justify-center">
            <Bot className="w-6 h-6 text-violet-400" />
          </div>
        </div>
        <p className="text-center text-muted-foreground">
          When you run <code className="text-xs bg-muted px-1.5 py-0.5 rounded">bun test</code> and
          Claude Code runs <code className="text-xs bg-muted px-1.5 py-0.5 rounded">bun test</code>,
          you get the <span className="text-foreground font-semibold">exact same results</span>. Every time.
        </p>
      </div>
    </div>
  );
}
