"use client";

/**
 * AI Coding > Sessions
 *
 * Surfaces the ground-truth list of `daax-*` containers (active and
 * stray) and provides per-session kill plus an idle-reaper action. The
 * primary teardown path is still WS-close in the terminal server; this
 * page is the safety net for sessions that escaped that.
 *
 * Data source: GET /api/ai/active-sessions (shells out to `docker ps`).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Boxes,
  RefreshCw,
  Skull,
  Trash2,
  Clock,
  AlertTriangle,
  ExternalLink,
  Activity,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";

interface ActiveSession {
  containerName: string;
  containerId: string;
  image: string;
  command: string;
  status: string;
  state: string;
  createdAt: string;
  startedAt: string;
  lastActivityAt: string;
  idleSeconds: number;
  uptimeSeconds: number;
}

const POLL_INTERVAL_MS = 5_000;
const DEFAULT_REAP_MINUTES = 30;

function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "—";
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const m = Math.floor(totalSeconds / 60);
  if (m < 60) return `${m}m ${totalSeconds % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export default function SessionsPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [killing, setKilling] = useState<Set<string>>(new Set());
  const [reaping, setReaping] = useState(false);
  const [reapMinutes, setReapMinutes] = useState(DEFAULT_REAP_MINUTES);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/active-sessions", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setSessions(data.sessions ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sessions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [load]);

  const killOne = useCallback(async (name: string) => {
    setKilling((prev) => new Set(prev).add(name));
    try {
      const res = await fetch(
        `/api/ai/active-sessions/${encodeURIComponent(name)}`,
        { method: "DELETE" },
      );
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      toast.success(`Removed ${name}`);
      // Optimistic local removal — the next poll reconciles.
      setSessions((prev) => prev.filter((s) => s.containerName !== name));
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : `Failed to remove ${name}`,
      );
    } finally {
      setKilling((prev) => {
        const next = new Set(prev);
        next.delete(name);
        return next;
      });
    }
  }, []);

  // Return to a running session: navigate to AI Coding with the container
  // name as a deep-link param. The AI Coding page matches it against a
  // live client-side session (by captured containerName) and focuses it.
  // If no client-side session matches (e.g. a stray from another browser),
  // the page simply lands on AI Coding with nothing focused.
  const returnToSession = useCallback(
    (name: string) => {
      router.push(`/ai-coding?session=${encodeURIComponent(name)}`);
    },
    [router],
  );

  const reapIdle = useCallback(async () => {
    setReaping(true);
    try {
      const res = await fetch("/api/ai/active-sessions/reap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idleThresholdSeconds: Math.max(1, reapMinutes) * 60,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const n = data.reaped ?? 0;
      if (n > 0) toast.success(`Reaped ${n} idle session${n === 1 ? "" : "s"}`);
      else toast.message("No idle sessions to reap");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reap failed");
    } finally {
      setReaping(false);
    }
  }, [reapMinutes, load]);

  const idleThresholdSeconds = reapMinutes * 60;
  // A reap candidate is any session past the idle threshold, regardless of
  // state. The reap endpoint considers every `daax-*` session container
  // (including exited/stopped) — counting only `running` here understated the
  // count and wrongly disabled "Reap now" for stopped strays.
  const isReapCandidate = useCallback(
    (s: ActiveSession) => s.idleSeconds >= idleThresholdSeconds,
    [idleThresholdSeconds],
  );
  const idleCount = useMemo(
    () => sessions.filter(isReapCandidate).length,
    [sessions, isReapCandidate],
  );

  return (
    <div className="container max-w-screen-2xl mx-auto p-6 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Boxes className="h-6 w-6" />
          <div>
            <h1 className="text-2xl font-bold">Sessions</h1>
            <p className="text-sm text-muted-foreground">
              Active and stray AI coding containers. The terminal server kills
              sessions on browser disconnect; anything listed here that you no
              longer own is a stray.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw
              className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>
      </div>

      <Card className="p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Skull className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Reap idle sessions</span>
          </div>
          <div className="flex items-center gap-1 text-sm">
            <span className="text-muted-foreground">idle ≥</span>
            <Input
              type="number"
              min={1}
              max={1440}
              value={reapMinutes}
              onChange={(e) =>
                // Clamp to [1, 1440] (matches the `max` attr and the server's
                // 24h reap clamp) so the candidate count/highlight stays in
                // sync with what the reap endpoint would actually act on.
                setReapMinutes(
                  Math.min(1440, Math.max(1, Number(e.target.value) || 1)),
                )
              }
              className="w-20 h-8"
            />
            <span className="text-muted-foreground">min</span>
          </div>
          <Badge variant={idleCount > 0 ? "destructive" : "secondary"}>
            {idleCount} candidate{idleCount === 1 ? "" : "s"}
          </Badge>
          <Button
            variant="destructive"
            size="sm"
            onClick={reapIdle}
            disabled={reaping || idleCount === 0}
            className="ml-auto"
          >
            <Skull className="h-4 w-4 mr-2" />
            {reaping ? "Reaping…" : "Reap now"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          A session is &quot;idle&quot; when the later of its start time and
          most recent PTY output is older than the threshold. Long-running
          builds that produce output stay protected.
        </p>
      </Card>

      {error && (
        <Card className="p-4 border-destructive/50 bg-destructive/5 text-sm text-destructive flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          {error}
        </Card>
      )}

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[24ch]">Container</TableHead>
              <TableHead>Image</TableHead>
              <TableHead>State</TableHead>
              <TableHead className="text-right">Uptime</TableHead>
              <TableHead className="text-right">Idle</TableHead>
              <TableHead className="w-32 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sessions.length === 0 && !loading && (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center text-muted-foreground py-12"
                >
                  No active sessions.
                </TableCell>
              </TableRow>
            )}
            {sessions.map((s) => {
              const isIdle = isReapCandidate(s);
              return (
                <TableRow key={s.containerId}>
                  <TableCell className="font-mono text-xs">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-block h-2 w-2 rounded-full ${
                          s.state === "running"
                            ? isIdle
                              ? "bg-warning"
                              : "bg-success"
                            : "bg-muted-foreground/50"
                        }`}
                        aria-hidden
                      />
                      <Link
                        href={`/ai-coding/sessions/${encodeURIComponent(s.containerName)}`}
                        className="hover:underline"
                        title={s.containerId}
                      >
                        {s.containerName}
                      </Link>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {s.image}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={s.state === "running" ? "secondary" : "outline"}
                      className="capitalize"
                    >
                      {s.status || s.state}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-xs">
                    {formatDuration(s.uptimeSeconds)}
                  </TableCell>
                  <TableCell
                    className={`text-right tabular-nums text-xs ${
                      isIdle ? "text-warning font-medium" : ""
                    }`}
                  >
                    <span className="inline-flex items-center gap-1 justify-end">
                      {isIdle && <Clock className="h-3 w-3" />}
                      {formatDuration(s.idleSeconds)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <TooltipProvider delayDuration={200}>
                      <div className="flex items-center justify-end gap-1">
                        {/* Timeline link — always visible */}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              asChild
                              aria-label={`View timeline for ${s.containerName}`}
                            >
                              <Link
                                href={`/ai-coding/sessions/${encodeURIComponent(s.containerName)}`}
                              >
                                <Activity className="h-4 w-4" />
                              </Link>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>View tool timeline</TooltipContent>
                        </Tooltip>
                        {s.state === "running" && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => returnToSession(s.containerName)}
                                aria-label={`Return to ${s.containerName}`}
                              >
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              Return to this session
                            </TooltipContent>
                          </Tooltip>
                        )}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={killing.has(s.containerName)}
                              onClick={() => killOne(s.containerName)}
                              aria-label={`Remove ${s.containerName}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <code className="text-xs">
                              docker rm -f {s.containerName}
                            </code>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </TooltipProvider>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
