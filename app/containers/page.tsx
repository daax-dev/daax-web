/**
 * Containers > Running
 *
 * View of Docker containers running on the host (data: GET /api/containers,
 * unfiltered `docker ps`) with per-row lifecycle actions: start, stop,
 * restart, view logs, inspect, and remove (confirmed).
 *
 * Mutating actions POST/DELETE to /api/containers/[id]/* which are guarded
 * by requireAuth() server-side. These are HOST containers, so actions are
 * powerful; remove is gated behind a confirmation dialog.
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Boxes,
  RefreshCw,
  AlertCircle,
  MoreVertical,
  Play,
  Square,
  RotateCw,
  FileText,
  Info,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface HostContainer {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  ports: string[];
}

type ContainerAction = "start" | "stop" | "restart";

function stateVariant(state: string): "default" | "secondary" | "destructive" {
  if (state === "running") return "default";
  if (state === "exited" || state === "dead") return "destructive";
  return "secondary";
}

export default function ContainersRunningPage() {
  const [containers, setContainers] = useState<HostContainer[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Per-container in-flight action lock, so a row's menu disables while its
  // own action is running without blocking other rows.
  const [busy, setBusy] = useState<Set<string>>(new Set());

  // Remove-confirmation target (null = dialog closed).
  const [removeTarget, setRemoveTarget] = useState<HostContainer | null>(null);
  // Logs / inspect modal state.
  const [logsTarget, setLogsTarget] = useState<HostContainer | null>(null);
  const [logsText, setLogsText] = useState<string>("");
  const [logsLoading, setLogsLoading] = useState(false);
  const [inspectTarget, setInspectTarget] = useState<HostContainer | null>(
    null,
  );
  const [inspectData, setInspectData] = useState<unknown>(null);
  const [inspectLoading, setInspectLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/containers${showAll ? "?all=1" : ""}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.hint || data.error || "Failed to load containers");
        setContainers([]);
        return;
      }
      setContainers(data.containers ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load containers");
      setContainers([]);
    } finally {
      setLoading(false);
    }
  }, [showAll]);

  useEffect(() => {
    load();
  }, [load]);

  const setBusyFor = useCallback((id: string, on: boolean) => {
    setBusy((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const runAction = useCallback(
    async (c: HostContainer, action: ContainerAction) => {
      setBusyFor(c.id, true);
      try {
        const res = await fetch(`/api/containers/${c.id}/${action}`, {
          method: "POST",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.details || data.error || `HTTP ${res.status}`);
        }
        toast.success(`${actionVerb(action)} ${c.name}`);
        // Optimistic refresh — re-fetch to reflect the new state.
        await load();
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : `Failed to ${action} ${c.name}`,
        );
      } finally {
        setBusyFor(c.id, false);
      }
    },
    [load, setBusyFor],
  );

  const confirmRemove = useCallback(async () => {
    const c = removeTarget;
    if (!c) return;
    setRemoveTarget(null);
    setBusyFor(c.id, true);
    try {
      const res = await fetch(`/api/containers/${c.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.details || data.error || `HTTP ${res.status}`);
      }
      toast.success(`Removed ${c.name}`);
      // Optimistic local removal — the refresh reconciles.
      setContainers((prev) => prev.filter((x) => x.id !== c.id));
      await load();
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : `Failed to remove ${c.name}`,
      );
    } finally {
      setBusyFor(c.id, false);
    }
  }, [removeTarget, load, setBusyFor]);

  const openLogs = useCallback(async (c: HostContainer) => {
    setLogsTarget(c);
    setLogsText("");
    setLogsLoading(true);
    try {
      const res = await fetch(`/api/containers/${c.id}/logs?tail=500`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.details || data.error || `HTTP ${res.status}`);
      }
      const text = await res.text();
      setLogsText(text || "(no log output)");
    } catch (e) {
      setLogsText(
        `Failed to load logs: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setLogsLoading(false);
    }
  }, []);

  const openInspect = useCallback(async (c: HostContainer) => {
    setInspectTarget(c);
    setInspectData(null);
    setInspectLoading(true);
    try {
      const res = await fetch(`/api/containers/${c.id}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.details || data.error || `HTTP ${res.status}`);
      }
      setInspectData(data);
    } catch (e) {
      setInspectData({
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setInspectLoading(false);
    }
  }, []);

  return (
    <div className="container mx-auto max-w-screen-2xl py-6 px-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Boxes className="h-6 w-6" />
            Running Containers
          </h1>
          <p className="text-sm text-muted-foreground">
            All Docker containers on the host. Lifecycle actions act directly on
            the host daemon.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant={showAll ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setShowAll((v) => !v)}
            aria-pressed={showAll}
            aria-label={
              showAll
                ? "Showing all containers; click to show running only"
                : "Showing running containers only; click to show all"
            }
            aria-controls="containers-list-content"
          >
            {showAll ? "Showing all" : "Running only"}
          </Button>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw
              className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"}
            />
            <span className="ml-1.5">Refresh</span>
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-destructive/50">
          <CardContent className="flex items-center gap-2 py-4 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            {error}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {containers.length} container{containers.length === 1 ? "" : "s"}
          </CardTitle>
        </CardHeader>
        <CardContent id="containers-list-content">
          {!error && containers.length === 0 && !loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No containers found.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Image</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ports</TableHead>
                  <TableHead className="w-12 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {containers.map((c) => {
                  const isBusy = busy.has(c.id);
                  const isRunning = c.state === "running";
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {c.image}
                      </TableCell>
                      <TableCell>
                        <Badge variant={stateVariant(c.state)}>{c.state}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {c.status}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {c.ports.length ? c.ports.join(", ") : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={isBusy}
                              aria-label={`Actions for ${c.name}`}
                            >
                              {isBusy ? (
                                <RefreshCw className="h-4 w-4 animate-spin" />
                              ) : (
                                <MoreVertical className="h-4 w-4" />
                              )}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {isRunning ? (
                              <>
                                <DropdownMenuItem
                                  onClick={() => runAction(c, "stop")}
                                >
                                  <Square className="h-4 w-4 mr-2" />
                                  Stop
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => runAction(c, "restart")}
                                >
                                  <RotateCw className="h-4 w-4 mr-2" />
                                  Restart
                                </DropdownMenuItem>
                              </>
                            ) : (
                              <DropdownMenuItem
                                onClick={() => runAction(c, "start")}
                              >
                                <Play className="h-4 w-4 mr-2" />
                                Start
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => openLogs(c)}>
                              <FileText className="h-4 w-4 mr-2" />
                              View logs
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openInspect(c)}>
                              <Info className="h-4 w-4 mr-2" />
                              Inspect
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setRemoveTarget(c)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Remove
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Remove confirmation */}
      <AlertDialog
        open={removeTarget !== null}
        onOpenChange={(open) => !open && setRemoveTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove container?</AlertDialogTitle>
            <AlertDialogDescription>
              This force-removes{" "}
              <span className="font-mono font-medium">
                {removeTarget?.name}
              </span>{" "}
              from the host. Running containers are stopped first. This cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRemove}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Logs viewer */}
      <Dialog
        open={logsTarget !== null}
        onOpenChange={(open) => !open && setLogsTarget(null)}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Logs — {logsTarget?.name}</DialogTitle>
            <DialogDescription>Last 500 lines.</DialogDescription>
          </DialogHeader>
          <pre className="max-h-[60vh] overflow-auto rounded-md bg-muted p-3 text-xs font-mono whitespace-pre-wrap">
            {logsLoading ? "Loading logs…" : logsText}
          </pre>
        </DialogContent>
      </Dialog>

      {/* Inspect viewer */}
      <Dialog
        open={inspectTarget !== null}
        onOpenChange={(open) => !open && setInspectTarget(null)}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Inspect — {inspectTarget?.name}</DialogTitle>
            <DialogDescription>
              Sanitized detail (env and labels omitted).
            </DialogDescription>
          </DialogHeader>
          <pre className="max-h-[60vh] overflow-auto rounded-md bg-muted p-3 text-xs font-mono whitespace-pre-wrap">
            {inspectLoading ? "Loading…" : JSON.stringify(inspectData, null, 2)}
          </pre>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function actionVerb(action: ContainerAction): string {
  if (action === "start") return "Started";
  if (action === "stop") return "Stopped";
  return "Restarted";
}
