"use client";

import { cn } from "@/lib/utils";
import {
  GitBranch,
  ExternalLink,
  FileText,
  Sparkles,
  ArrowRight,
  CheckCircle,
  Brain,
  RefreshCw,
  Zap,
} from "lucide-react";

const workflowSteps = [
  {
    step: "1",
    title: "spec.md",
    description: "Write what you want in plain language",
    detail: "AI-friendly format optimized for LLM comprehension",
  },
  {
    step: "2",
    title: "Clarify",
    description: "AI asks targeted questions",
    detail: "Fills gaps, resolves ambiguity, confirms assumptions",
  },
  {
    step: "3",
    title: "plan.md",
    description: "AI generates implementation plan",
    detail: "File-by-file breakdown with dependencies",
  },
  {
    step: "4",
    title: "Implement",
    description: "AI executes the plan",
    detail: "You approve or redirect as needed",
  },
];

export function GetShitDone({ className }: { className?: string }) {
  return (
    <div className={cn("w-full max-w-5xl mx-auto", className)}>
      {/* Hero with terminal screenshot */}
      <div className="text-center mb-10">
        <div className="flex justify-center mb-6">
          <img
            src="/gsd-terminal.svg"
            alt="get-shit-done CLI"
            className="max-w-md w-full rounded-lg shadow-lg"
          />
        </div>
        <p className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
          <span className="text-violet-400 font-semibold">get-shit-done</span>{" "}
          is spec-driven development that actually works. You write a spec in
          plain language, AI asks clarifying questions, generates a plan, and
          executes it—all while{" "}
          <span className="text-foreground font-semibold">
            keeping you in control
          </span>
          .
        </p>
      </div>

      {/* Philosophy callout */}
      <div className="p-4 rounded-xl bg-violet-500/10 border border-violet-500/20 mb-10 text-center">
        <p className="text-sm text-muted-foreground">
          <span className="text-violet-400">💡</span> The complexity belongs in
          the system, not in your head. Write what you want, not how to build
          it.
        </p>
      </div>

      {/* Workflow Steps */}
      <h3 className="font-semibold text-foreground mb-6 text-center">
        The Workflow
      </h3>
      <div className="flex flex-col md:flex-row gap-4 mb-10">
        {workflowSteps.map((step, index) => (
          <div key={step.step} className="flex-1 relative">
            <div className="p-4 rounded-xl bg-muted/20 border border-border/50 h-full">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-6 h-6 rounded-full bg-violet-500/30 text-violet-400 text-xs font-bold flex items-center justify-center">
                  {step.step}
                </span>
                <span className="font-semibold text-foreground text-sm">
                  {step.title}
                </span>
              </div>
              <p className="text-sm text-muted-foreground mb-1">
                {step.description}
              </p>
              <p className="text-xs text-muted-foreground/70">{step.detail}</p>
            </div>
            {index < workflowSteps.length - 1 && (
              <ArrowRight className="hidden md:block absolute -right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground/40 z-10" />
            )}
          </div>
        ))}
      </div>

      {/* Key Features */}
      <h3 className="font-semibold text-foreground mb-6 text-center">
        Why It Works
      </h3>
      <div className="grid md:grid-cols-2 gap-6 mb-10">
        <div className="p-6 rounded-xl bg-muted/20 border border-border/50">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
              <FileText className="w-5 h-5 text-green-400" />
            </div>
            <h4 className="font-semibold text-foreground">AI-Native Specs</h4>
          </div>
          <p className="text-sm text-muted-foreground">
            Specs are written in a format optimized for AI comprehension—not
            traditional PRDs. Clear acceptance criteria, explicit constraints,
            and testable outcomes.
          </p>
        </div>

        <div className="p-6 rounded-xl bg-muted/20 border border-border/50">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-cyan-500/20 flex items-center justify-center">
              <Brain className="w-5 h-5 text-cyan-400" />
            </div>
            <h4 className="font-semibold text-foreground">
              Clarify Before Building
            </h4>
          </div>
          <p className="text-sm text-muted-foreground">
            Before writing any code, Claude asks up to 5 targeted clarifying
            questions. This catches ambiguity early, when it&apos;s cheap to
            fix.
          </p>
        </div>

        <div className="p-6 rounded-xl bg-muted/20 border border-border/50">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
              <RefreshCw className="w-5 h-5 text-amber-400" />
            </div>
            <h4 className="font-semibold text-foreground">
              Iterative Refinement
            </h4>
          </div>
          <p className="text-sm text-muted-foreground">
            Review the generated plan before execution. Redirect, add
            constraints, or approve. The human stays in the loop without
            micromanaging every line.
          </p>
        </div>

        <div className="p-6 rounded-xl bg-muted/20 border border-border/50">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-violet-500/20 flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-violet-400" />
            </div>
            <h4 className="font-semibold text-foreground">
              Verifiable Outcomes
            </h4>
          </div>
          <p className="text-sm text-muted-foreground">
            Every spec has acceptance criteria that can be tested. Did the
            feature work? Check the criteria. No ambiguity about what
            &quot;done&quot; means.
          </p>
        </div>
      </div>

      {/* The Spec Format */}
      <div className="p-6 rounded-xl bg-gradient-to-r from-violet-500/10 to-purple-500/10 border border-violet-500/20 mb-10">
        <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-violet-400" />
          The spec.md Format
        </h3>
        <div className="bg-muted/30 rounded-lg p-4 font-mono text-sm overflow-x-auto">
          <pre className="text-muted-foreground">
            {`# Feature: User Authentication

## Goal
Allow users to sign in with email/password or OAuth providers.

## Constraints
- Must support Google and GitHub OAuth
- Session expires after 7 days of inactivity
- Rate limit: 5 failed attempts per 15 minutes

## Acceptance Criteria
- [ ] User can sign up with email/password
- [ ] User can sign in with Google OAuth
- [ ] User can sign in with GitHub OAuth
- [ ] Session persists across browser restarts
- [ ] Rate limiting blocks brute force attempts`}
          </pre>
        </div>
        <p className="text-sm text-muted-foreground mt-4">
          Clear, testable, AI-friendly. Claude knows exactly what to build and
          how to verify it.
        </p>
      </div>

      {/* Get started */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="p-5 rounded-xl bg-muted/10 border border-border/40">
          <h4 className="font-semibold text-foreground mb-3 flex items-center gap-2">
            <Zap className="w-4 h-4 text-violet-400" />
            Get Started
          </h4>
          <p className="text-sm text-muted-foreground mb-3">
            Works with Claude Code out of the box. Just create a{" "}
            <code className="text-xs bg-muted px-1 rounded">spec.md</code> file
            and ask Claude to implement it using the spec-driven workflow.
          </p>
          <div className="text-xs font-mono bg-muted/30 p-2 rounded">
            &quot;Implement the feature in spec.md using /spec:implement&quot;
          </div>
        </div>
        <div className="p-5 rounded-xl bg-muted/10 border border-border/40">
          <h4 className="font-semibold text-foreground mb-3">Learn More</h4>
          <div className="space-y-2 text-sm">
            <a
              href="https://github.com/glittercowboy/get-shit-done"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-violet-400 hover:underline"
            >
              <GitBranch className="w-4 h-4" />
              github.com/glittercowboy/get-shit-done
              <ExternalLink className="w-3 h-3" />
            </a>
            <p className="text-muted-foreground">
              Templates, examples, and the full specification format guide.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
