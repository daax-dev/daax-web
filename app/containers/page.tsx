/**
 * Containers > Running
 *
 * Read-only view of all Docker containers running on the host.
 * Data comes from GET /api/containers (unfiltered `docker ps`).
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import { Boxes, RefreshCw, AlertCircle } from "lucide-react";
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

interface HostContainer {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  ports: string[];
}

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

  return (
    <div className="container max-w-screen-2xl py-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Boxes className="h-6 w-6" />
            Running Containers
          </h1>
          <p className="text-sm text-muted-foreground">
            All Docker containers on the host (read-only).
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {containers.map((c) => (
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
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
