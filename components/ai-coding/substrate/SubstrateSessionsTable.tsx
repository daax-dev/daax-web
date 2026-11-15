"use client";

import { Globe, Pause, Play, Plug, Power } from "lucide-react";

import { AGENT_ACCENTS, AGENT_ICONS } from "@/components/icons/AgentIcons";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { SessionView } from "@/lib/substrate/client";
import { cn } from "@/lib/utils";
import { SessionStateBadge } from "./SessionStateBadge";
import {
  AGENT_LABELS,
  SANDBOX_LABELS,
  canAttach,
  canEditEgress,
  canEnd,
  canResume,
  canSuspend,
} from "./state";

function ago(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 1000));
  if (!Number.isFinite(s)) return "—";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export interface SessionRowActions {
  onOpen: (s: SessionView) => void;
  onSuspend: (s: SessionView) => void;
  onResume: (s: SessionView) => void;
  onEnd: (s: SessionView) => void;
  onEgress: (s: SessionView) => void;
}

/**
 * The caller's substrate sessions (dx#123). Admins see every session, with an
 * Owner column. Server-side list only (never React state as the source).
 */
export function SubstrateSessionsTable({
  sessions,
  showOwner,
  busy,
  actions,
}: {
  sessions: SessionView[];
  showOwner: boolean;
  /** Session ids with an action in flight. */
  busy: ReadonlySet<string>;
  actions: SessionRowActions;
}) {
  return (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Session</TableHead>
            <TableHead>State</TableHead>
            <TableHead>Agent</TableHead>
            <TableHead>Class</TableHead>
            {showOwner && <TableHead>Owner</TableHead>}
            <TableHead>Egress</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sessions.map((s) => {
            const Icon = AGENT_ICONS[s.agent as keyof typeof AGENT_ICONS];
            const accent = AGENT_ACCENTS[s.agent as keyof typeof AGENT_ACCENTS];
            const b = busy.has(s.id);
            return (
              <TableRow
                key={s.id}
                data-testid="substrate-session-row"
                data-session={s.id}
              >
                <TableCell className="font-mono text-xs">
                  <div>{s.actorName}</div>
                  {s.lastError && (
                    <div
                      className="text-destructive max-w-[28ch] truncate"
                      title={s.lastError}
                    >
                      {s.lastError}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <SessionStateBadge state={s.state} />
                  {s.actorState && s.actorState !== "MISSING" && (
                    <div className="text-[10px] text-muted-foreground mt-0.5 font-mono">
                      {s.actorState.replace(/^ACTOR_STATE_/, "").toLowerCase()}
                    </div>
                  )}
                  {s.actorState === "MISSING" && s.state !== "creating" && (
                    <div className="text-[10px] text-warning mt-0.5">
                      actor missing
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <span className="flex items-center gap-1.5 text-sm">
                    {Icon && <Icon className={cn("h-3.5 w-3.5", accent)} />}
                    {AGENT_LABELS[s.agent] ?? s.agent}
                  </span>
                </TableCell>
                <TableCell className="text-sm">
                  {SANDBOX_LABELS[s.sandboxClass] ?? s.sandboxClass}
                </TableCell>
                {showOwner && (
                  <TableCell
                    className="font-mono text-xs max-w-[18ch] truncate"
                    title={s.ownerSubject}
                  >
                    {s.ownerSubject}
                  </TableCell>
                )}
                <TableCell className="text-xs text-muted-foreground">
                  {s.egressHosts.length === 0
                    ? "gateway only"
                    : `${s.egressHosts.length} host${s.egressHosts.length === 1 ? "" : "s"}`}
                </TableCell>
                <TableCell
                  className="text-xs text-muted-foreground"
                  title={s.createdAt}
                >
                  {ago(s.createdAt)}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!canAttach(s) || b}
                      onClick={() => actions.onOpen(s)}
                    >
                      <Plug className="h-3.5 w-3.5 mr-1" />
                      Attach
                    </Button>
                    {canResume(s) ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={b}
                        onClick={() => actions.onResume(s)}
                      >
                        <Play className="h-3.5 w-3.5 mr-1" />
                        Resume
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!canSuspend(s) || b}
                        onClick={() => actions.onSuspend(s)}
                      >
                        <Pause className="h-3.5 w-3.5 mr-1" />
                        Suspend
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!canEditEgress(s) || b}
                      onClick={() => actions.onEgress(s)}
                      aria-label="Edit egress"
                      title="Egress allowlist"
                    >
                      <Globe className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      disabled={!canEnd(s) || b}
                      onClick={() => actions.onEnd(s)}
                      aria-label="End session"
                      title="End session"
                    >
                      <Power className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
