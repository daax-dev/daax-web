"use client";

import { cn } from "@/lib/utils";
import { ShieldCheck, Crosshair, FileSearch, Bug } from "lucide-react";

export function DeveloperSecurity({ className }: { className?: string }) {
  return (
    <div className={cn("w-full max-w-3xl mx-auto", className)}>
      <div className="flex flex-col items-center text-center mb-8">
        <div className="w-16 h-16 rounded-2xl bg-green-500/20 border border-green-500/40 flex items-center justify-center mb-4">
          <ShieldCheck className="w-8 h-8 text-green-400" />
        </div>
        <p className="text-lg text-muted-foreground max-w-xl">
          Shift security left. Run SAST, secrets scanning, and dependency checks directly in your workflow—
          catch vulnerabilities before they reach production.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[
          "Semgrep for pattern-based SAST",
          "Gitleaks / truffleHog for secrets",
          "Trivy for dependency vulnerabilities",
          "Pre-commit hooks integration",
        ].map((point, index) => (
          <div
            key={index}
            className="flex items-start gap-3 p-4 rounded-lg bg-muted/20 border border-border/40"
          >
            <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center text-xs font-semibold text-green-400 flex-shrink-0">
              {index + 1}
            </div>
            <span className="text-sm text-muted-foreground">{point}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CyberToolkit({ className }: { className?: string }) {
  return (
    <div className={cn("w-full max-w-3xl mx-auto", className)}>
      <div className="flex flex-col items-center text-center mb-8">
        <div className="w-16 h-16 rounded-2xl bg-red-500/20 border border-red-500/40 flex items-center justify-center mb-4">
          <Crosshair className="w-8 h-8 text-red-400" />
        </div>
        <p className="text-lg text-muted-foreground max-w-xl">
          Professional penetration testing tools in a sandboxed environment. Run vulnerability assessments
          and security audits without risking your host system.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[
          "OWASP ZAP for web app testing",
          "Nuclei for vulnerability scanning",
          "Nmap for network discovery",
          "Isolated execution prevents accidents",
        ].map((point, index) => (
          <div
            key={index}
            className="flex items-start gap-3 p-4 rounded-lg bg-muted/20 border border-border/40"
          >
            <div className="w-6 h-6 rounded-full bg-red-500/20 flex items-center justify-center text-xs font-semibold text-red-400 flex-shrink-0">
              {index + 1}
            </div>
            <span className="text-sm text-muted-foreground">{point}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SemgrepIntegration({ className }: { className?: string }) {
  return (
    <div className={cn("w-full max-w-3xl mx-auto", className)}>
      <div className="flex flex-col items-center text-center mb-8">
        <div className="w-16 h-16 rounded-2xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center mb-4">
          <FileSearch className="w-8 h-8 text-cyan-400" />
        </div>
        <p className="text-lg text-muted-foreground max-w-xl">
          Pattern-based static analysis with Semgrep. Use community rules or write custom patterns
          for your codebase—find bugs, enforce standards, and prevent anti-patterns.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[
          "2000+ community rules out of the box",
          "Custom rule authoring in YAML",
          "Language-aware pattern matching",
          "CI/CD pipeline integration",
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

export function TrivyScanning({ className }: { className?: string }) {
  return (
    <div className={cn("w-full max-w-3xl mx-auto", className)}>
      <div className="flex flex-col items-center text-center mb-8">
        <div className="w-16 h-16 rounded-2xl bg-violet-500/20 border border-violet-500/40 flex items-center justify-center mb-4">
          <Bug className="w-8 h-8 text-violet-400" />
        </div>
        <p className="text-lg text-muted-foreground max-w-xl">
          Comprehensive vulnerability scanning with Trivy. Scan container images, filesystems, and IaC
          for CVEs, misconfigurations, and license issues in one tool.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[
          "Container image vulnerability scanning",
          "Filesystem and repo scanning",
          "IaC misconfiguration detection",
          "SBOM generation and analysis",
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
