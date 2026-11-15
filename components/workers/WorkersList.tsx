"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Play, Plus, RefreshCw, UserCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { workersApi, type WorkersList as ListData } from "./api";
import { MODE_LABEL, StateBadge, relativeTime } from "./format";

export function WorkersList() {
  const [data, setData] = useState<ListData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await workersApi.list());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 10_000);
    return () => clearInterval(t);
  }, [load]);

  const act = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await fn();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const existing = new Set(data?.workers.map((w) => w.slug));
  const missingTemplates =
    data?.templates.filter((t) => !existing.has(t.slug)) ?? [];

  return (
    <div className="space-y-4" data-testid="workers-list">
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {data && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {Object.entries(data.engines).map(([id, e]) => (
            <span
              key={id}
              className="rounded border px-2 py-0.5"
              title={e.note}
            >
              {id}: {e.available ? "ready" : "unavailable"}
            </span>
          ))}
          {!data.schedulerLeader && (
            <span className="rounded border px-2 py-0.5">
              scheduler: standby on this instance
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void load()}
            aria-label="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      )}

      {missingTemplates.map((t) => (
        <Card key={t.slug} className="border-dashed">
          <CardContent className="flex items-center justify-between gap-4 py-4">
            <div>
              <p className="font-medium">{t.name}</p>
              <p className="text-sm text-muted-foreground">{t.description}</p>
            </div>
            <Button
              onClick={() =>
                void act(`create-${t.slug}`, () =>
                  workersApi.createFromTemplate(t.slug),
                )
              }
              disabled={busy !== null}
              data-testid={`create-${t.slug}`}
            >
              <Plus className="mr-1 h-4 w-4" /> Add worker
            </Button>
          </CardContent>
        </Card>
      ))}

      <div className="grid gap-4 md:grid-cols-2">
        {data?.workers.map((w) => (
          <Card key={w.id} data-testid={`worker-card-${w.slug}`}>
            <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
              <div className="flex items-center gap-2">
                <UserCog className="h-5 w-5 text-primary" aria-hidden />
                <CardTitle className="text-base">
                  <Link href={`/workers/${w.slug}`} className="hover:underline">
                    {w.name}
                  </Link>
                </CardTitle>
              </div>
              <StateBadge state={w.state} />
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="text-muted-foreground">{w.description}</p>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <dt className="text-muted-foreground">Mode</dt>
                <dd>
                  {MODE_LABEL[w.runMode]}
                  {w.enabled ? "" : " (paused)"}
                </dd>
                <dt className="text-muted-foreground">Engine</dt>
                <dd>{w.engine}</dd>
                <dt className="text-muted-foreground">Goals</dt>
                <dd>{w.activeGoals} active</dd>
                <dt className="text-muted-foreground">Last run</dt>
                <dd>
                  {w.lastRun
                    ? `${w.lastRun.status}, ${relativeTime(w.lastRun.queuedAt)}`
                    : "never"}
                </dd>
                <dt className="text-muted-foreground">Next run</dt>
                <dd>{relativeTime(w.nextRunAt)}</dd>
              </dl>
              {w.pausedReason && (
                <p className="text-xs text-destructive">{w.pausedReason}</p>
              )}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() =>
                    void act(`run-${w.id}`, () => workersApi.startRun(w.id))
                  }
                  disabled={busy !== null || w.state === "running"}
                >
                  <Play className="mr-1 h-4 w-4" /> Run now
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <Link href={`/workers/${w.slug}`}>Open</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {data && data.workers.length === 0 && missingTemplates.length === 0 && (
        <p className="text-sm text-muted-foreground">No workers yet.</p>
      )}
    </div>
  );
}
