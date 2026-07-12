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

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
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
  Activity,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  ExternalLink,
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
  memoryUsageBytes: number | null;
  memoryLimitBytes: number | null;
  imageSizeBytes: number | null;
  startedAt: string | null;
}

interface ContainerStatsDetail {
  id: string;
  name: string;
  image: string;
  state: string;
  cpuPercent: number | null;
  memory: {
    usageBytes: number | null;
    limitBytes: number | null;
    percent: number | null;
  };
  network: { rxBytes: number | null; txBytes: number | null };
  blockIO: { readBytes: number | null; writeBytes: number | null };
  pids: number | null;
  imageSizeBytes: number | null;
}

type ContainerAction = "start" | "stop" | "restart";

function stateVariant(state: string): "default" | "secondary" | "destructive" {
  if (state === "running") return "default";
  if (state === "exited" || state === "dead") return "destructive";
  return "secondary";
}

function formatBytes(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes)) return "—";
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(2)} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

function formatPercent(pct: number | null): string {
  if (pct === null || !Number.isFinite(pct)) return "—";
  return `${pct.toFixed(1)}%`;
}

// Elapsed running time as a compact label: "42s", "5m", "3h", "2d".
function formatUptime(startedAt: string | null): string {
  if (!startedAt) return "—";
  const ms = Date.now() - new Date(startedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

// Splits a docker image reference ("host/path:tag", "path@sha256:digest",
// "name:tag", or bare "name") into its registry host (null when implicit
// Docker Hub) and repository path, dropping any tag/digest suffix. Mirrors
// docker's own resolution rule: the reference is host-qualified only when
// the first "/"-segment contains a "." or ":" or is literally "localhost".
function parseImageRef(image: string): { host: string | null; path: string } {
  let ref = image.split("@")[0]; // drop a digest suffix, if present
  const lastSlash = ref.lastIndexOf("/");
  const lastColon = ref.lastIndexOf(":");
  if (lastColon > lastSlash) ref = ref.slice(0, lastColon); // drop ":tag"

  const firstSlash = ref.indexOf("/");
  const firstSegment = firstSlash === -1 ? ref : ref.slice(0, firstSlash);
  const isHost =
    firstSegment.includes(".") ||
    firstSegment.includes(":") ||
    firstSegment === "localhost";

  return isHost
    ? { host: firstSegment, path: ref.slice(firstSlash + 1) }
    : { host: null, path: ref };
}

// Best-effort "view this image online" link, opened in a new tab. Resolves
// the same way `docker pull` would: unqualified names go to Docker Hub,
// ghcr.io/<owner>/<pkg> goes to its GitHub Packages page, anything else
// falls back to the registry host + path. Locally-built images that were
// never pushed anywhere will 404 — there's no way to tell from the name
// alone — and bare digest references (no repository name at all) get no
// link, since there's nothing meaningful to resolve.
function imageRegistryUrl(image: string): string | null {
  if (!image || image.startsWith("sha256:")) return null;
  const { host, path } = parseImageRef(image);
  if (!path) return null;

  if (!host) {
    const parts = path.split("/");
    return parts.length === 1
      ? `https://hub.docker.com/_/${parts[0]}`
      : `https://hub.docker.com/r/${path}`;
  }
  if (host === "ghcr.io") {
    const pkg = path.split("/").pop();
    return `https://github.com/${path.split("/")[0]}/${pkg}/pkgs/container/${pkg}`;
  }
  return `https://${host}/${path}`;
}

type SortKey = "name" | "image" | "state" | "memory" | "imageSize" | "uptime";

const SORT_ACCESSORS: Record<
  SortKey,
  (c: HostContainer) => string | number | null
> = {
  name: (c) => c.name.toLowerCase(),
  image: (c) => c.image.toLowerCase(),
  state: (c) => c.state.toLowerCase(),
  memory: (c) => c.memoryUsageBytes,
  imageSize: (c) => c.imageSizeBytes,
  uptime: (c) =>
    c.startedAt ? Date.now() - new Date(c.startedAt).getTime() : null,
};

function sortContainers(
  containers: HostContainer[],
  sortKey: SortKey | null,
  sortDir: "asc" | "desc",
): HostContainer[] {
  if (!sortKey) return containers;
  const accessor = SORT_ACCESSORS[sortKey];
  const dir = sortDir === "asc" ? 1 : -1;
  return [...containers].sort((a, b) => {
    const va = accessor(a);
    const vb = accessor(b);
    // Nulls (unknown/unavailable values) always sort last, regardless of direction.
    if (va === null && vb === null) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    if (va < vb) return -1 * dir;
    if (va > vb) return 1 * dir;
    return 0;
  });
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
  // Detailed stats modal state.
  const [statsTarget, setStatsTarget] = useState<HostContainer | null>(null);
  const [statsData, setStatsData] = useState<ContainerStatsDetail | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  // Column sort state (client-side; the API returns unsorted).
  const [sort, setSort] = useState<{
    key: SortKey | null;
    dir: "asc" | "desc";
  }>({
    key: null,
    dir: "asc",
  });

  const toggleSort = useCallback((key: SortKey) => {
    setSort((prev) => ({
      key,
      dir: prev.key === key && prev.dir === "asc" ? "desc" : "asc",
    }));
  }, []);

  const sortedContainers = useMemo(
    () => sortContainers(containers, sort.key, sort.dir),
    [containers, sort],
  );

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

  const openStats = useCallback(async (c: HostContainer) => {
    setStatsTarget(c);
    setStatsData(null);
    setStatsError(null);
    setStatsLoading(true);
    try {
      const res = await fetch(`/api/containers/${c.id}/stats`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.details || data.error || `HTTP ${res.status}`);
      }
      setStatsData(data);
    } catch (e) {
      setStatsError(e instanceof Error ? e.message : String(e));
    } finally {
      setStatsLoading(false);
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
                  <SortableHead sortKey="name" sort={sort} onSort={toggleSort}>
                    Name
                  </SortableHead>
                  <SortableHead sortKey="image" sort={sort} onSort={toggleSort}>
                    Image
                  </SortableHead>
                  <SortableHead sortKey="state" sort={sort} onSort={toggleSort}>
                    State
                  </SortableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ports</TableHead>
                  <SortableHead
                    sortKey="memory"
                    sort={sort}
                    onSort={toggleSort}
                  >
                    Memory
                  </SortableHead>
                  <SortableHead
                    sortKey="imageSize"
                    sort={sort}
                    onSort={toggleSort}
                  >
                    Image Size
                  </SortableHead>
                  <SortableHead
                    sortKey="uptime"
                    sort={sort}
                    onSort={toggleSort}
                  >
                    Uptime
                  </SortableHead>
                  <TableHead className="w-12 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedContainers.map((c) => {
                  const isBusy = busy.has(c.id);
                  const isRunning = c.state === "running";
                  const imageUrl = imageRegistryUrl(c.image);
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="max-w-xs break-all text-muted-foreground">
                        {imageUrl ? (
                          <a
                            href={imageUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 hover:text-foreground hover:underline"
                          >
                            {c.image}
                            <ExternalLink className="h-3 w-3 shrink-0" />
                          </a>
                        ) : (
                          c.image
                        )}
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
                      <TableCell className="text-muted-foreground">
                        {formatBytes(c.memoryUsageBytes)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatBytes(c.imageSizeBytes)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatUptime(c.startedAt)}
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
                            <DropdownMenuItem onClick={() => openStats(c)}>
                              <Activity className="h-4 w-4 mr-2" />
                              Stats
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

      {/* Detailed stats drill-in */}
      <Dialog
        open={statsTarget !== null}
        onOpenChange={(open) => !open && setStatsTarget(null)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Stats — {statsTarget?.name}</DialogTitle>
            <DialogDescription>
              Live one-shot resource snapshot.
            </DialogDescription>
          </DialogHeader>
          {statsLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Loading…
            </p>
          ) : statsError ? (
            <p className="py-6 text-center text-sm text-destructive">
              {statsError}
            </p>
          ) : statsData ? (
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <StatRow
                label="CPU"
                value={formatPercent(statsData.cpuPercent)}
              />
              <StatRow
                label="PIDs"
                value={statsData.pids !== null ? String(statsData.pids) : "—"}
              />
              <StatRow
                label="Memory usage"
                value={formatBytes(statsData.memory.usageBytes)}
              />
              <StatRow
                label="Memory limit"
                value={formatBytes(statsData.memory.limitBytes)}
              />
              <StatRow
                label="Memory %"
                value={formatPercent(statsData.memory.percent)}
              />
              <StatRow
                label="Image size"
                value={formatBytes(statsData.imageSizeBytes)}
              />
              <StatRow
                label="Network RX"
                value={formatBytes(statsData.network.rxBytes)}
              />
              <StatRow
                label="Network TX"
                value={formatBytes(statsData.network.txBytes)}
              />
              <StatRow
                label="Block I/O read"
                value={formatBytes(statsData.blockIO.readBytes)}
              />
              <StatRow
                label="Block I/O write"
                value={formatBytes(statsData.blockIO.writeBytes)}
              />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SortableHead({
  sortKey,
  sort,
  onSort,
  children,
}: {
  sortKey: SortKey;
  sort: { key: SortKey | null; dir: "asc" | "desc" };
  onSort: (key: SortKey) => void;
  children: ReactNode;
}) {
  const active = sort.key === sortKey;
  const Icon = active
    ? sort.dir === "asc"
      ? ArrowUp
      : ArrowDown
    : ArrowUpDown;
  return (
    <TableHead
      aria-sort={
        active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"
      }
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="flex items-center gap-1 hover:text-foreground"
      >
        {children}
        <Icon
          className={`h-3 w-3 ${active ? "text-foreground" : "text-muted-foreground"}`}
        />
      </button>
    </TableHead>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

function actionVerb(action: ContainerAction): string {
  if (action === "start") return "Started";
  if (action === "stop") return "Stopped";
  return "Restarted";
}
