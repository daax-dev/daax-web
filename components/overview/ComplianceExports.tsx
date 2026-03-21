"use client";

import { cn } from "@/lib/utils";
import { FileJson, Download, Clock, Shield } from "lucide-react";

const exportFormats = [
  {
    format: "JSONL Events",
    description: "Line-delimited JSON for every agent action, decision, and file change",
    extension: ".jsonl",
    icon: <FileJson className="w-5 h-5" />,
  },
  {
    format: "Session Archive",
    description: "Complete session bundle: terminal recordings, screenshots, and metadata",
    extension: ".tar.gz",
    icon: <Download className="w-5 h-5" />,
  },
  {
    format: "Audit Timeline",
    description: "Human-readable chronological report for compliance review",
    extension: ".md / .pdf",
    icon: <Clock className="w-5 h-5" />,
  },
  {
    format: "SLSA Provenance",
    description: "Build provenance attestations in SLSA v1.0 format",
    extension: ".intoto.jsonl",
    icon: <Shield className="w-5 h-5" />,
  },
];

const sampleLog = `{"ts":"2026-01-26T10:30:15Z","event":"file_write","path":"/src/api.ts","agent":"claude-code"}
{"ts":"2026-01-26T10:30:18Z","event":"command_run","cmd":"bun test","exit":0}
{"ts":"2026-01-26T10:30:22Z","event":"decision","reason":"Tests pass, committing changes"}`;

export function ComplianceExports({ className }: { className?: string }) {
  return (
    <div className={cn("w-full max-w-4xl mx-auto", className)}>
      {/* Description */}
      <div className="text-center mb-8">
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Every session generates audit-ready exports. Structured logs for automation,
          human-readable reports for review—compliance without extra effort.
        </p>
      </div>

      {/* Export formats grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        {exportFormats.map((format) => (
          <div
            key={format.format}
            className="p-5 rounded-xl bg-muted/20 border border-border/40 hover:border-border/60 transition-colors"
          >
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center text-primary">
                {format.icon}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-semibold text-foreground">{format.format}</h4>
                  <span className="text-xs text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">
                    {format.extension}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">{format.description}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Sample JSONL preview */}
      <div className="rounded-xl border border-border/50 bg-muted/10 overflow-hidden">
        <div className="p-3 border-b border-border/50 bg-muted/20 flex items-center gap-2">
          <FileJson className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">session-2026-01-26.jsonl</span>
        </div>
        <pre className="p-4 text-xs font-mono text-muted-foreground overflow-x-auto">
          {sampleLog}
        </pre>
      </div>

      {/* Bottom note */}
      <p className="mt-6 text-sm text-muted-foreground text-center">
        Exports integrate with SIEM tools, compliance dashboards, and incident response workflows.
      </p>
    </div>
  );
}
