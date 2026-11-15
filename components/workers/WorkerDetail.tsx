"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Pause, Play, UserCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { WorkerEngine, WorkerRun, WorkerSummary } from "@/types/workers";
import { workersApi, type EngineInfo, type WorkerDetailData } from "./api";
import { AskBar } from "./AskBar";
import { GoalsTab } from "./GoalsTab";
import { Markdown } from "./Markdown";
import { RunTimeline } from "./RunTimeline";
import { ScheduleTab } from "./ScheduleTab";
import { ToolsTab } from "./ToolsTab";
import {
  MODE_LABEL,
  RunStatusBadge,
  StateBadge,
  localTime,
  relativeTime,
} from "./format";

function RunsTab({
  workerId,
  refreshKey,
}: {
  workerId: string;
  refreshKey: number;
}) {
  const [runs, setRuns] = useState<WorkerRun[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    workersApi
      .runs(workerId, 30)
      .then((r) => {
        setRuns(r.runs);
        setSelected((cur) => cur ?? r.runs[0]?.id ?? null);
      })
      .catch(() => setRuns([]));
  }, [workerId, refreshKey]);

  return (
    <div className="grid gap-4 md:grid-cols-[18rem_1fr]" data-testid="runs-tab">
      <ul className="space-y-1">
        {runs.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => setSelected(r.id)}
              className={`w-full rounded border px-3 py-2 text-left text-xs ${selected === r.id ? "bg-muted" : ""}`}
            >
              <div className="flex items-center justify-between gap-2">
                <RunStatusBadge status={r.status} />
                <span className="text-muted-foreground">
                  {relativeTime(r.queuedAt)}
                </span>
              </div>
              <p className="mt-1 truncate">{r.input || `${r.trigger} run`}</p>
            </button>
          </li>
        ))}
        {runs.length === 0 && (
          <li className="text-sm text-muted-foreground">No runs yet.</li>
        )}
      </ul>
      <div>{selected && <RunTimeline key={selected} runId={selected} />}</div>
    </div>
  );
}

export function WorkerDetail({ slug }: { slug: string }) {
  const [data, setData] = useState<WorkerDetailData | null>(null);
  const [engines, setEngines] = useState<Record<
    WorkerEngine,
    EngineInfo
  > | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async () => {
    try {
      setData(await workersApi.get(slug));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [slug]);

  const changed = useCallback(() => {
    setRefreshKey((k) => k + 1);
    void load();
  }, [load]);

  useEffect(() => {
    void load();
    workersApi
      .list()
      .then((l) => setEngines(l.engines))
      .catch(() => setEngines(null));
    const t = setInterval(() => void load(), 15_000);
    return () => clearInterval(t);
  }, [load]);

  const save = async (patch: Partial<WorkerSummary>) => {
    if (!data) return;
    setError(null);
    try {
      await workersApi.update(data.worker.id, patch);
      changed();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (!data) {
    return error ? (
      <p role="alert" className="text-sm text-destructive">
        {error}
      </p>
    ) : (
      <p className="text-sm text-muted-foreground">Loading…</p>
    );
  }

  const { worker, goals, brief } = data;
  return (
    <div className="space-y-6" data-testid="worker-detail">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild aria-label="All workers">
            <Link href="/workers">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="rounded-lg bg-primary/10 p-2 text-primary">
            <UserCog className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold">
              {worker.name} <StateBadge state={worker.state} />
            </h1>
            <p className="text-sm text-muted-foreground">
              {MODE_LABEL[worker.runMode]} · {worker.engine} · {worker.autonomy}{" "}
              · next run {relativeTime(worker.nextRunAt)}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() =>
              void workersApi
                .startRun(worker.id)
                .then(changed, (e: Error) => setError(e.message))
            }
            disabled={worker.state === "running"}
          >
            <Play className="mr-1 h-4 w-4" /> Run now
          </Button>
          <Button
            variant="outline"
            onClick={() => void save({ enabled: !worker.enabled })}
          >
            {worker.enabled ? (
              <Pause className="mr-1 h-4 w-4" />
            ) : (
              <Play className="mr-1 h-4 w-4" />
            )}
            {worker.enabled ? "Pause" : "Resume"}
          </Button>
        </div>
      </div>

      {worker.pausedReason && (
        <p className="text-sm text-destructive">{worker.pausedReason}</p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <AskBar
        workerId={worker.id}
        workerName={worker.name}
        enabled={worker.enabled}
        brief={brief}
        onChanged={changed}
      />

      <Tabs defaultValue="brief">
        <TabsList>
          <TabsTrigger value="brief">Brief</TabsTrigger>
          <TabsTrigger value="goals">
            Goals ({goals.filter((g) => g.status === "active").length})
          </TabsTrigger>
          <TabsTrigger value="runs">Runs</TabsTrigger>
          <TabsTrigger value="tools">Tools</TabsTrigger>
          <TabsTrigger value="schedule">Schedule</TabsTrigger>
        </TabsList>
        <TabsContent value="brief" className="pt-4">
          {brief?.summary ? (
            <div className="space-y-2" data-testid="brief">
              <p className="text-xs text-muted-foreground">
                Latest report · {localTime(brief.finishedAt)} · {brief.trigger}
              </p>
              <Markdown text={brief.summary} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No report yet. Add goals, then press Run now or ask a question.
            </p>
          )}
        </TabsContent>
        <TabsContent value="goals" className="pt-4">
          <GoalsTab workerId={worker.id} goals={goals} onChanged={changed} />
        </TabsContent>
        <TabsContent value="runs" className="pt-4">
          <RunsTab workerId={worker.id} refreshKey={refreshKey} />
        </TabsContent>
        <TabsContent value="tools" className="pt-4">
          <ToolsTab worker={worker} engines={engines} onSave={save} />
        </TabsContent>
        <TabsContent value="schedule" className="pt-4">
          <ScheduleTab key={worker.updatedAt} worker={worker} onSave={save} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
