"use client";

import { RefreshCw, CheckCircle2, XCircle, Clock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { BuildJob, BuildStatus } from "@/types/catalog";

interface BuildJobStatusProps {
  job: BuildJob;
  onRefresh?: () => void;
}

const statusConfig: Record<
  BuildStatus,
  { icon: React.ElementType; color: string; label: string }
> = {
  queued: { icon: Clock, color: "text-muted-foreground", label: "Queued" },
  preparing: { icon: Loader2, color: "text-blue-500", label: "Preparing" },
  building: { icon: Loader2, color: "text-blue-500", label: "Building" },
  pushing: { icon: Loader2, color: "text-blue-500", label: "Pushing" },
  scanning: { icon: Loader2, color: "text-blue-500", label: "Scanning" },
  completed: {
    icon: CheckCircle2,
    color: "text-green-500",
    label: "Completed",
  },
  failed: { icon: XCircle, color: "text-destructive", label: "Failed" },
  cancelled: {
    icon: XCircle,
    color: "text-muted-foreground",
    label: "Cancelled",
  },
};

export function BuildJobStatus({ job, onRefresh }: BuildJobStatusProps) {
  const config = statusConfig[job.status];
  const Icon = config.icon;
  const isActive = ["preparing", "building", "pushing", "scanning"].includes(
    job.status,
  );

  return (
    <div className="space-y-4">
      {/* Status header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon
            className={`h-5 w-5 ${config.color} ${isActive ? "animate-spin" : ""}`}
          />
          <span className="font-medium">{config.label}</span>
          {job.progress.currentStep && (
            <span className="text-sm text-muted-foreground">
              - {job.progress.currentStep}
            </span>
          )}
        </div>
        {onRefresh && (
          <Button variant="ghost" size="icon" onClick={onRefresh}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Progress bar */}
      {isActive && (
        <div className="space-y-2">
          <Progress value={job.progress.totalProgress} />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{job.progress.stage}</span>
            <span>{job.progress.totalProgress}%</span>
          </div>
        </div>
      )}

      {/* Result info */}
      {job.status === "completed" && job.result && (
        <div className="grid grid-cols-2 gap-4 p-3 rounded-lg bg-muted/50">
          <div>
            <div className="text-xs text-muted-foreground">Build Time</div>
            <div className="font-medium">{job.result.buildTime}s</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Size</div>
            <div className="font-medium">
              {(job.result.size / 1024 / 1024).toFixed(1)} MB
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Layers</div>
            <div className="font-medium">{job.result.layers}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Tags</div>
            <div className="flex gap-1 flex-wrap">
              {job.result.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Error info */}
      {job.status === "failed" && job.error && (
        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
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

      {/* Logs */}
      {job.progress.logs.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs font-medium text-muted-foreground">Logs</div>
          <pre className="p-3 rounded-lg bg-muted/50 border text-xs max-h-40 overflow-auto">
            {job.progress.logs.slice(-20).join("\n")}
          </pre>
        </div>
      )}
    </div>
  );
}
