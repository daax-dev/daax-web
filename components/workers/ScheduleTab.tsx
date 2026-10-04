"use client";

import { useMemo, useState } from "react";
import { Cron } from "croner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  WORKER_RUN_MODES,
  type WorkerRunMode,
  type WorkerSummary,
} from "@/types/workers";
import { MODE_LABEL, localTime } from "./format";

/** Next `n` fire times for a cron expression, or an error message. */
export function cronPreview(
  expr: string,
  n = 3,
  from = new Date(),
): { times: Date[]; error: string | null } {
  try {
    const job = new Cron(expr, { timezone: "UTC", paused: true });
    return { times: job.nextRuns(n, from), error: null };
  } catch (e) {
    return { times: [], error: (e as Error).message };
  }
}

export function ScheduleTab({
  worker,
  onSave,
}: {
  worker: WorkerSummary;
  onSave: (patch: Partial<WorkerSummary>) => Promise<void>;
}) {
  const [mode, setMode] = useState<WorkerRunMode>(worker.runMode);
  const [cron, setCron] = useState(worker.cron ?? "0 8 * * 1-5");
  const [cooldown, setCooldown] = useState(
    String(Math.round(worker.cooldownSeconds / 60)),
  );
  const [cap, setCap] = useState(String(worker.maxRunsPerDay));
  const [timeout, setTimeoutMin] = useState(
    String(Math.round(worker.timeoutSeconds / 60)),
  );
  const [workingDir, setWorkingDir] = useState(worker.workingDir ?? "");
  const preview = useMemo(
    () => (mode === "schedule" ? cronPreview(cron) : null),
    [mode, cron],
  );

  const save = () =>
    onSave({
      runMode: mode,
      cron: mode === "schedule" ? cron.trim() : worker.cron,
      cooldownSeconds: Number(cooldown) * 60,
      maxRunsPerDay: Number(cap),
      timeoutSeconds: Number(timeout) * 60,
      workingDir: workingDir.trim() || null,
    });

  return (
    <div className="max-w-2xl space-y-5" data-testid="schedule-tab">
      <div className="flex items-center gap-3">
        <Switch
          id="worker-enabled"
          checked={worker.enabled}
          onCheckedChange={(v) => void onSave({ enabled: v })}
        />
        <Label htmlFor="worker-enabled">
          {worker.enabled ? "Automatic runs on" : "Automatic runs paused"}
        </Label>
      </div>

      <div className="space-y-2">
        <Label>Run mode</Label>
        <Select value={mode} onValueChange={(v) => setMode(v as WorkerRunMode)}>
          <SelectTrigger className="w-60" aria-label="Run mode">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {WORKER_RUN_MODES.map((m) => (
              <SelectItem key={m} value={m}>
                {MODE_LABEL[m]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {mode === "schedule" &&
            "Runs on the cron schedule below (UTC). Missed runs while daax is down are skipped."}
          {mode === "continuous" &&
            "Starts the next run after the cooldown once the previous one finishes."}
          {mode === "adhoc" &&
            "Runs only when asked — from this page, the CLI, or by voice."}
        </p>
      </div>

      {mode === "schedule" && (
        <div className="space-y-2">
          <Label htmlFor="worker-cron">Cron (UTC)</Label>
          <Input
            id="worker-cron"
            value={cron}
            onChange={(e) => setCron(e.target.value)}
            className="w-60 font-mono"
          />
          {preview?.error ? (
            <p className="text-xs text-destructive">{preview.error}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Next:{" "}
              {preview?.times
                .map((t) => localTime(t.toISOString()))
                .join(" · ")}
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label htmlFor="worker-cooldown">Cooldown (min)</Label>
          <Input
            id="worker-cooldown"
            type="number"
            min={5}
            value={cooldown}
            onChange={(e) => setCooldown(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="worker-cap">Max automatic runs / day</Label>
          <Input
            id="worker-cap"
            type="number"
            min={1}
            max={288}
            value={cap}
            onChange={(e) => setCap(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="worker-timeout">Timeout (min)</Label>
          <Input
            id="worker-timeout"
            type="number"
            min={1}
            max={60}
            value={timeout}
            onChange={(e) => setTimeoutMin(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="worker-dir">
          Working directory (inside the workspace)
        </Label>
        <Input
          id="worker-dir"
          value={workingDir}
          onChange={(e) => setWorkingDir(e.target.value)}
          placeholder="Relative to the workspace, e.g. dx/src/daax-web (workspace root when empty)"
          className="font-mono"
        />
      </div>

      <Button onClick={() => void save()} disabled={Boolean(preview?.error)}>
        Save schedule
      </Button>
    </div>
  );
}
