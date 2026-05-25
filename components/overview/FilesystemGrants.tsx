"use client";

import { cn } from "@/lib/utils";
import { Folder, File, Eye, Pencil, X } from "lucide-react";

interface Grant {
  path: string;
  type: "directory" | "file";
  read: boolean;
  write: boolean;
}

const sampleGrants: Grant[] = [
  { path: "/workspace/src", type: "directory", read: true, write: true },
  { path: "/workspace/tests", type: "directory", read: true, write: true },
  { path: "/workspace/docs", type: "directory", read: true, write: false },
  { path: "/workspace/.env", type: "file", read: false, write: false },
  { path: "/workspace/.env.example", type: "file", read: true, write: false },
  { path: "/workspace/package.json", type: "file", read: true, write: true },
  { path: "/etc/passwd", type: "file", read: false, write: false },
];

export function FilesystemGrants({ className }: { className?: string }) {
  return (
    <div className={cn("w-full max-w-4xl mx-auto", className)}>
      {/* Description */}
      <div className="text-center mb-8">
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Agents see only what you explicitly allow. Each path grant specifies
          read, write, or both—everything else is invisible and inaccessible.
        </p>
      </div>

      {/* Grants visualization */}
      <div className="rounded-xl border border-border/50 bg-muted/10 overflow-hidden">
        <div className="p-4 border-b border-border/50 bg-muted/20 flex items-center gap-3">
          <Folder className="w-5 h-5 text-primary" />
          <span className="font-semibold text-foreground">
            Filesystem Access Grants
          </span>
        </div>

        <div className="divide-y divide-border/30">
          {sampleGrants.map((grant) => (
            <div
              key={grant.path}
              className="flex items-center gap-4 p-4 hover:bg-muted/20 transition-colors"
            >
              {/* Icon */}
              {grant.type === "directory" ? (
                <Folder className="w-5 h-5 text-cyan-400" />
              ) : (
                <File className="w-5 h-5 text-muted-foreground" />
              )}

              {/* Path */}
              <span className="font-mono text-sm text-foreground flex-1">
                {grant.path}
              </span>

              {/* Permissions */}
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "flex items-center gap-1.5 px-2 py-1 rounded text-xs",
                    grant.read
                      ? "bg-success/20 text-success"
                      : "bg-destructive/20 text-destructive",
                  )}
                >
                  {grant.read ? (
                    <Eye className="w-3 h-3" />
                  ) : (
                    <X className="w-3 h-3" />
                  )}
                  Read
                </div>
                <div
                  className={cn(
                    "flex items-center gap-1.5 px-2 py-1 rounded text-xs",
                    grant.write
                      ? "bg-success/20 text-success"
                      : "bg-destructive/20 text-destructive",
                  )}
                >
                  {grant.write ? (
                    <Pencil className="w-3 h-3" />
                  ) : (
                    <X className="w-3 h-3" />
                  )}
                  Write
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Key points */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
        <div className="p-4 rounded-lg bg-muted/20 border border-border/40">
          <h4 className="font-semibold text-foreground mb-2">
            Explicit Over Implicit
          </h4>
          <p className="text-muted-foreground">
            No default access. Every file and directory must be explicitly
            granted—fail-safe by design.
          </p>
        </div>
        <div className="p-4 rounded-lg bg-muted/20 border border-border/40">
          <h4 className="font-semibold text-foreground mb-2">
            Glob Patterns Supported
          </h4>
          <p className="text-muted-foreground">
            Use wildcards like{" "}
            <code className="text-xs bg-muted px-1 rounded">/src/**/*.ts</code>{" "}
            to grant access to patterns, not just individual paths.
          </p>
        </div>
      </div>
    </div>
  );
}
