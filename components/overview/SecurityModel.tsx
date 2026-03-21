"use client";

import { cn } from "@/lib/utils";
import { Shield, Check, X, AlertCircle } from "lucide-react";

interface Permission {
  name: string;
  description: string;
  granted: boolean;
  category: "filesystem" | "network" | "execution";
}

const samplePermissions: Permission[] = [
  { name: "Read /src/**", description: "Read source code files", granted: true, category: "filesystem" },
  { name: "Write /src/**", description: "Modify source code", granted: true, category: "filesystem" },
  { name: "Read /.env*", description: "Access environment files", granted: false, category: "filesystem" },
  { name: "Execute npm/bun", description: "Run package managers", granted: true, category: "execution" },
  { name: "Execute shell", description: "Run arbitrary shell commands", granted: false, category: "execution" },
  { name: "Network localhost", description: "Access local dev servers", granted: true, category: "network" },
  { name: "Network external", description: "Access external APIs", granted: false, category: "network" },
];

const categoryColors = {
  filesystem: "text-cyan-400 bg-cyan-500/20",
  network: "text-violet-400 bg-violet-500/20",
  execution: "text-amber-400 bg-amber-500/20",
};

export function SecurityModel({ className }: { className?: string }) {
  const grantedCount = samplePermissions.filter((p) => p.granted).length;
  const deniedCount = samplePermissions.filter((p) => !p.granted).length;

  return (
    <div className={cn("w-full max-w-4xl mx-auto", className)}>
      {/* Key principle */}
      <div className="text-center mb-10">
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Agents receive <span className="text-primary font-semibold">only the permissions they need</span>—
          precise guardrails with minimal friction. Explicit grants, explicit denials, no ambiguity.
        </p>
      </div>

      {/* Stats bar */}
      <div className="flex items-center justify-center gap-8 mb-8">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center">
            <Check className="w-4 h-4 text-green-400" />
          </div>
          <span className="text-sm">
            <span className="font-semibold text-foreground">{grantedCount}</span>
            <span className="text-muted-foreground"> granted</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center">
            <X className="w-4 h-4 text-red-400" />
          </div>
          <span className="text-sm">
            <span className="font-semibold text-foreground">{deniedCount}</span>
            <span className="text-muted-foreground"> denied</span>
          </span>
        </div>
      </div>

      {/* Permissions table */}
      <div className="rounded-xl border border-border/50 bg-muted/10 overflow-hidden">
        <div className="p-4 border-b border-border/50 bg-muted/20 flex items-center gap-3">
          <Shield className="w-5 h-5 text-primary" />
          <span className="font-semibold text-foreground">Agent Permission Grants</span>
        </div>

        <div className="divide-y divide-border/30">
          {samplePermissions.map((permission) => (
            <div
              key={permission.name}
              className={cn(
                "flex items-center gap-4 p-4 transition-colors",
                permission.granted ? "hover:bg-green-500/5" : "hover:bg-red-500/5"
              )}
            >
              {/* Status icon */}
              <div
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0",
                  permission.granted ? "bg-green-500/20" : "bg-red-500/20"
                )}
              >
                {permission.granted ? (
                  <Check className="w-4 h-4 text-green-400" />
                ) : (
                  <X className="w-4 h-4 text-red-400" />
                )}
              </div>

              {/* Permission details */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm text-foreground">{permission.name}</span>
                  <span
                    className={cn(
                      "text-xs px-2 py-0.5 rounded capitalize",
                      categoryColors[permission.category]
                    )}
                  >
                    {permission.category}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">{permission.description}</p>
              </div>

              {/* Status label */}
              <span
                className={cn(
                  "text-xs font-medium",
                  permission.granted ? "text-green-400" : "text-red-400"
                )}
              >
                {permission.granted ? "ALLOWED" : "DENIED"}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom note */}
      <div className="mt-6 flex items-start gap-3 p-4 rounded-lg bg-muted/20 border border-border/40">
        <AlertCircle className="w-5 h-5 text-muted-foreground flex-shrink-0 mt-0.5" />
        <p className="text-sm text-muted-foreground">
          Permissions are defined per-session or per-project. Agents operate within these bounds—
          any action outside the grant list is blocked and logged. Security without slowing you down.
        </p>
      </div>
    </div>
  );
}
