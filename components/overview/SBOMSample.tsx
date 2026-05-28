"use client";

import { cn } from "@/lib/utils";
import { Package, AlertTriangle, CheckCircle, Info } from "lucide-react";

// Sample SBOM data in a simplified view
const sampleSBOM = {
  format: "CycloneDX 1.5",
  component: {
    name: "daax-web",
    version: "1.2.0",
    type: "application",
  },
  dependencies: [
    { name: "next", version: "16.0.0", license: "MIT", vulnerabilities: 0 },
    { name: "react", version: "19.0.0", license: "MIT", vulnerabilities: 0 },
    {
      name: "typescript",
      version: "5.7.3",
      license: "Apache-2.0",
      vulnerabilities: 0,
    },
    {
      name: "tailwindcss",
      version: "4.0.0",
      license: "MIT",
      vulnerabilities: 0,
    },
    { name: "lodash", version: "4.17.21", license: "MIT", vulnerabilities: 1 },
  ],
  metadata: {
    timestamp: "2026-01-26T10:30:00Z",
    tools: ["syft", "trivy"],
  },
};

export function SBOMSample({ className }: { className?: string }) {
  const totalDeps = sampleSBOM.dependencies.length;
  const vulnCount = sampleSBOM.dependencies.reduce(
    (sum, d) => sum + d.vulnerabilities,
    0,
  );

  return (
    <div className={cn("w-full max-w-4xl mx-auto", className)}>
      {/* Header info */}
      <div className="flex flex-wrap items-center gap-4 mb-6 text-sm">
        <span className="px-3 py-1 rounded-full bg-cyan-500/20 text-cyan-400 font-medium">
          {sampleSBOM.format}
        </span>
        <span className="text-muted-foreground">
          Generated: {new Date(sampleSBOM.metadata.timestamp).toLocaleString()}
        </span>
      </div>

      {/* Main SBOM display */}
      <div className="rounded-xl border border-border/50 bg-muted/10 overflow-hidden">
        {/* Component header */}
        <div className="p-4 border-b border-border/50 bg-muted/20">
          <div className="flex items-center gap-3">
            <Package className="w-5 h-5 text-primary" />
            <div>
              <span className="font-semibold text-foreground">
                {sampleSBOM.component.name}
              </span>
              <span className="text-muted-foreground ml-2">
                v{sampleSBOM.component.version}
              </span>
            </div>
            <span className="ml-auto text-xs px-2 py-1 rounded bg-muted text-muted-foreground">
              {sampleSBOM.component.type}
            </span>
          </div>
        </div>

        {/* Stats bar */}
        <div className="px-4 py-3 border-b border-border/30 flex items-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground">
              {totalDeps} dependencies
            </span>
          </div>
          {vulnCount > 0 ? (
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <span className="text-amber-400">
                {vulnCount} known vulnerability
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-400" />
              <span className="text-green-400">No known vulnerabilities</span>
            </div>
          )}
        </div>

        {/* Dependencies table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/30 text-muted-foreground">
                <th className="text-left p-3 font-medium">Package</th>
                <th className="text-left p-3 font-medium">Version</th>
                <th className="text-left p-3 font-medium">License</th>
                <th className="text-left p-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {sampleSBOM.dependencies.map((dep) => (
                <tr
                  key={dep.name}
                  className="border-b border-border/20 hover:bg-muted/20"
                >
                  <td className="p-3 font-mono text-foreground">{dep.name}</td>
                  <td className="p-3 text-muted-foreground">{dep.version}</td>
                  <td className="p-3">
                    <span className="px-2 py-0.5 rounded text-xs bg-muted text-muted-foreground">
                      {dep.license}
                    </span>
                  </td>
                  <td className="p-3">
                    {dep.vulnerabilities > 0 ? (
                      <span className="flex items-center gap-1.5 text-amber-400">
                        <AlertTriangle className="w-4 h-4" />
                        {dep.vulnerabilities} CVE
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-green-400">
                        <CheckCircle className="w-4 h-4" />
                        Secure
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 bg-muted/10 text-xs text-muted-foreground">
          Tools: {sampleSBOM.metadata.tools.join(", ")} • Formats: CycloneDX,
          SPDX
        </div>
      </div>

      {/* What it enables */}
      <div className="mt-6 text-sm text-muted-foreground text-center">
        SBOMs provide complete transparency into your software supply chain—
        enabling vulnerability tracking, license compliance, and incident
        response.
      </div>
    </div>
  );
}
