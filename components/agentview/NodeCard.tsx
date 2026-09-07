"use client";

/**
 * The node serving this page: who it is, how long it has been up, what its
 * identity provider looks like from here, and which signals it can see.
 *
 * The identity provider block renders two *ages*, not a verdict: the page does
 * not know the daemon's poll interval, so any threshold would be a judgement
 * it cannot support. The two rows are separate elements so a test can assert
 * they differ — an implementation reading one timestamp and printing it twice
 * would lose the only fact the second field exists for.
 */

import { Server } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatAge } from "@/lib/agentview/client";
import type { NodeResponse } from "@/lib/agentview/types";
import { cn } from "@/lib/utils";
import { CapabilitiesList } from "./CapabilitiesList";

interface NodeCardProps {
  node: NodeResponse;
  /** Read at render time. Defaults to the clock so a caller without a tick still shows a live age. */
  now?: number;
}

function Row({
  label,
  children,
  mono,
}: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-xs">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className={cn("min-w-0 truncate text-right", mono && "font-mono")}>
        {children}
      </span>
    </div>
  );
}

export function NodeCard({ node, now: nowProp }: NodeCardProps) {
  const now = nowProp ?? Date.now();
  const n = node.node;
  const idp = node.identity_provider;
  const idpAvailable = idp?.state === "AVAILABLE";

  return (
    <Card data-testid="agentview-node">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Server className="h-4 w-4 text-muted-foreground" aria-hidden />
          <span className="truncate">{n.hostname}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <Row label="node" mono>
            {n.node_id}
          </Row>
          <Row label="platform">
            {n.os}/{n.arch}
          </Row>
          <Row label="agentd" mono>
            {n.agent_version}
          </Row>
          <Row label="started">{formatAge(n.started_at, now)}</Row>
        </div>

        <Separator />

        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium">identity provider</span>
            {idp ? (
              <Badge
                variant="outline"
                className={cn(
                  "font-mono text-[10px] uppercase",
                  idpAvailable
                    ? "border-success/40 bg-success/15 text-success"
                    : "border-destructive/40 text-destructive",
                )}
                data-testid="agentview-idp-state"
              >
                {idp.state}
              </Badge>
            ) : (
              <span className="text-xs italic text-muted-foreground">
                none configured
              </span>
            )}
          </div>
          {idp && (
            <>
              {idp.issuer && (
                <Row label="issuer" mono>
                  {idp.issuer}
                </Row>
              )}
              <div
                className="flex items-baseline justify-between gap-3 text-xs"
                data-testid="agentview-idp-attempt"
              >
                <span className="text-muted-foreground">last attempt</span>
                <span>{formatAge(idp.last_attempt_at, now)}</span>
              </div>
              <div
                className="flex items-baseline justify-between gap-3 text-xs"
                data-testid="agentview-idp-success"
              >
                <span className="text-muted-foreground">last success</span>
                <span>{formatAge(idp.last_success_at, now)}</span>
              </div>
              {idp.detail && (
                <p className="text-xs text-muted-foreground">{idp.detail}</p>
              )}
            </>
          )}
        </div>

        <Separator />

        <div className="space-y-1">
          <span className="text-xs font-medium">capabilities</span>
          <CapabilitiesList signals={n.capabilities?.signals ?? {}} />
        </div>
      </CardContent>
    </Card>
  );
}
