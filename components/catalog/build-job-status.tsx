"use client";

import { useEffect, useState } from "react";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Play,
  Package,
  Upload,
  Shield,
  Circle,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { BuildJob, BuildStatus } from "@/types/catalog";

const STATUS_CONFIG: Record<
  BuildStatus,
  { icon: typeof Circle; label: string; color: string }
> = {
  queued: { icon: Clock, label: "Queued", color: "text-muted-foreground" },
  preparing: { icon: Package, label: "Preparing", color: "text-blue-500" },
  building: { icon: Play, label: "Building", color: "text-yellow-500" },
  pushing: { icon: Upload, label: "Pushing", color: "text-purple-500" },
  scanning: { icon: Shield, label: "Scanning", color: "text-cyan-500" },
  completed: {
    icon: CheckCircle2,
    label: "Completed",
    color: "text-green-500",
  },
  failed: { icon: XCircle, label: "Failed", color: "text-destructive" },
  cancelled: {
    icon: XCircle,
    label: "Cancelled",
    color: "text-muted-foreground",
  },
};

interface BuildJobStatusProps {
  job: BuildJob;
  onRefresh?: () => void;
}

export function BuildJobStatus({ job, onRefresh }: BuildJobStatusProps) {
  const config = STATUS_CONFIG[job.status];
  const StatusIcon = config.icon;
  const isActive = [
    "queued",
    "preparing",
    "building",
    "pushing",
    "scanning",
  ].includes(job.status);

  // Auto-refresh for active jobs
  useEffect(() => {
    if (!isActive || !onRefresh) return;

    const interval = setInterval(onRefresh, 2000);
    return () => clearInterval(interval);
  }, [isActive, onRefresh]);

  return (
    <div className="space-y-4">
      {/* Status Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {isActive ? (
            <Loader2 className={cn("h-6 w-6 animate-spin", config.color)} />
          ) : (
            <StatusIcon className={cn("h-6 w-6", config.color)} />
          )}
          <div>
            <h3 className={cn("font-medium", config.color)}>{config.label}</h3>
            <p className="text-sm text-muted-foreground">
              {job.progress.currentStep || job.progress.stage}
            </p>
          </div>
        </div>
        {job.completedAt && (
          <div className="text-sm text-muted-foreground">
            Completed in {calculateDuration(job.startedAt!, job.completedAt)}
          </div>
        )}
      </div>

      {/* Progress Bar */}
      {isActive && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{job.progress.stage}</span>
            <span className="font-medium">{job.progress.totalProgress}%</span>
          </div>
          <Progress value={job.progress.totalProgress} className="h-2" />
        </div>
      )}

      {/* Build Result */}
      {job.status === "completed" && job.result && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-green-500/10 rounded-lg">
          <div>
            <div className="text-xs text-muted-foreground">Size</div>
            <div className="font-medium">{formatBytes(job.result.size)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Layers</div>
            <div className="font-medium">{job.result.layers}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Build Time</div>
            <div className="font-medium">{job.result.buildTime}s</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Tags</div>
            <div className="font-medium">{job.result.tags.join(", ")}</div>
          </div>
        </div>
      )}

      {/* Error */}
      {job.status === "failed" && job.error && (
        <div className="p-4 bg-destructive/10 rounded-lg">
          <div className="text-sm font-medium text-destructive">
            {job.error.message}
          </div>
          {job.error.details && (
            <pre className="mt-2 text-xs text-muted-foreground overflow-auto">
              {job.error.details}
            </pre>
          )}
        </div>
      )}

      {/* Build Logs */}
      {job.progress.logs.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-2">Build Logs</h4>
          <ScrollArea className="h-[200px] rounded-lg border bg-muted/30">
            <pre className="p-4 text-xs font-mono">
              {job.progress.logs.map((line, i) => (
                <div key={i} className="whitespace-pre-wrap">
                  {line}
                </div>
              ))}
            </pre>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}

function calculateDuration(start: string, end: string): string {
  const duration = new Date(end).getTime() - new Date(start).getTime();
  const seconds = Math.floor(duration / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(2)} GB`;
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(2)} MB`;
  return `${(bytes / 1_000).toFixed(2)} KB`;
}
