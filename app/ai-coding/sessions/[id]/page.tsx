"use client";

/**
 * Session Detail — /ai-coding/sessions/[id]
 *
 * Fetches the tool-call timeline for a session from the Watchtower proxy,
 * clusters it into turns via clusterByTurn, and renders each turn with the
 * shared TurnGroup component.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { use } from "react";
import {
  ArrowLeft,
  RefreshCw,
  Activity,
  CheckCircle2,
  XCircle,
  Timer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TurnGroup } from "@/components/session/TurnGroup";
import { clusterByTurn } from "@/lib/turn-cluster";
import type { ToolCall } from "@/lib/turn-cluster";
import type { SessionToolCall } from "@/app/api/watchtower/sessions/[id]/tools/route";

// ─────────────────────────────────────────────────────────────────────────────
// Inner client component — receives the resolved id so tests can render it
// directly without params.
// ─────────────────────────────────────────────────────────────────────────────

interface SessionTimelineProps {
  id: string;
}

export function SessionTimeline({ id }: SessionTimelineProps) {
  const [tools, setTools] = useState<SessionToolCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/watchtower/sessions/${encodeURIComponent(id)}/tools`,
        {
          cache: "no-store",
        },
      );
      const data: unknown = await res.json();
      const list =
        data !== null &&
        typeof data === "object" &&
        "tools" in data &&
        Array.isArray((data as { tools: unknown }).tools)
          ? (data as { tools: SessionToolCall[] }).tools
          : [];
      setTools(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tool data");
      setTools([]);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Cluster tools into turns.
  // SessionToolCall now carries the [key: string]: unknown index signature
  // required by ToolCall, so the cast is safe and structurally correct.
  const groups = clusterByTurn(tools as ToolCall[]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <RefreshCw className="h-5 w-5 animate-spin mr-2" aria-hidden />
        <span>Loading timeline…</span>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="p-6 border-destructive/50 bg-destructive/5">
        <p className="text-sm text-destructive">{error}</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={load}>
          <RefreshCw className="h-4 w-4 mr-1" />
          Retry
        </Button>
      </Card>
    );
  }

  if (groups.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center py-20 text-muted-foreground"
        data-testid="empty-state"
      >
        <Activity className="h-12 w-12 mb-4 opacity-30" aria-hidden />
        <h3 className="font-medium text-sm mb-1">No tool calls recorded</h3>
        <p className="text-xs">
          Tool activity will appear here once the session runs.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {groups.map((group) => (
        <TurnGroup
          key={group.turnIndex}
          group={group}
          renderTool={(tool, i) => <ToolRow key={i} tool={tool} />}
        />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Individual tool row
// ─────────────────────────────────────────────────────────────────────────────

function ToolRow({ tool }: { tool: ToolCall }) {
  const name =
    typeof tool.name === "string" ? tool.name : String(tool.name ?? "tool");
  const durationMs =
    typeof tool.durationMs === "number" ? tool.durationMs : null;
  const hasError = Boolean(tool.error);

  return (
    <div className="flex items-center gap-3 px-3 py-2 text-sm">
      {/* Status icon */}
      {hasError ? (
        <XCircle
          className="h-4 w-4 text-destructive shrink-0"
          aria-label="error"
        />
      ) : (
        <CheckCircle2
          className="h-4 w-4 text-success shrink-0"
          aria-label="ok"
        />
      )}

      {/* Tool name */}
      <span className="font-mono text-xs font-medium flex-1 truncate">
        {name}
      </span>

      {/* Duration */}
      {durationMs !== null && (
        <span className="flex items-center gap-1 text-xs text-muted-foreground tabular-nums shrink-0">
          <Timer className="h-3 w-3" aria-hidden />
          {durationMs < 1000
            ? `${durationMs}ms`
            : `${(durationMs / 1000).toFixed(1)}s`}
        </span>
      )}

      {/* Error badge */}
      {hasError && (
        <Badge variant="destructive" className="text-xs shrink-0">
          error
        </Badge>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page component — resolves the [id] param and delegates to SessionTimeline
// ─────────────────────────────────────────────────────────────────────────────

export default function SessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  return (
    <div className="container max-w-screen-xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/ai-coding/sessions" aria-label="Back to sessions">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-xl font-bold font-mono">{id}</h1>
          <p className="text-sm text-muted-foreground">Tool call timeline</p>
        </div>
      </div>

      {/* Timeline */}
      <SessionTimeline id={id} />
    </div>
  );
}
