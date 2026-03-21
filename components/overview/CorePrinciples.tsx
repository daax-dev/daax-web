"use client";

import { cn } from "@/lib/utils";
import { Shield, Eye, Unlock, FileCheck, Fingerprint, RefreshCw } from "lucide-react";

interface Principle {
  icon: React.ReactNode;
  title: string;
  description: string;
  color: string;
}

const principles: Principle[] = [
  {
    icon: <Shield className="w-6 h-6" />,
    title: "Security First",
    description: "Every agent runs in isolation with explicit permissions. Hardware-level sandboxing via microVMs ensures defense in depth.",
    color: "text-green-400 bg-green-500/20",
  },
  {
    icon: <Eye className="w-6 h-6" />,
    title: "Full Observability",
    description: "Record every action, decision, and output. Screen captures, terminal logs, and decision trails create a complete audit history.",
    color: "text-cyan-400 bg-cyan-500/20",
  },
  {
    icon: <Unlock className="w-6 h-6" />,
    title: "Developer Freedom",
    description: "Use any AI agent, any tool, any IDE. daax provides the infrastructure—you choose the workflow that fits your team.",
    color: "text-violet-400 bg-violet-500/20",
  },
  {
    icon: <FileCheck className="w-6 h-6" />,
    title: "SBOM Generation",
    description: "Automatically generate Software Bills of Materials for every build. Know exactly what dependencies are in your artifacts.",
    color: "text-amber-400 bg-amber-500/20",
  },
  {
    icon: <Fingerprint className="w-6 h-6" />,
    title: "Signed Attestations",
    description: "Cryptographically sign build provenance. Verify that artifacts came from trusted sources and haven't been tampered with.",
    color: "text-rose-400 bg-rose-500/20",
  },
  {
    icon: <RefreshCw className="w-6 h-6" />,
    title: "Continuous Feedback",
    description: "Post-session retrospectives powered by recorded context. Learn what worked, what didn't, and improve for next time.",
    color: "text-blue-400 bg-blue-500/20",
  },
];

export function CorePrinciples({ className }: { className?: string }) {
  return (
    <div className={cn("w-full max-w-5xl mx-auto", className)}>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {principles.map((principle) => (
          <div
            key={principle.title}
            className="p-6 rounded-xl bg-muted/20 border border-border/40 hover:border-border/60 transition-colors"
          >
            <div className={cn("w-12 h-12 rounded-lg flex items-center justify-center mb-4", principle.color)}>
              {principle.icon}
            </div>
            <h3 className="font-semibold text-foreground mb-2">{principle.title}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {principle.description}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
