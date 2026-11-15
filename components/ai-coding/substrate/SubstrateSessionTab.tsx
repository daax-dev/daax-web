"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Circle,
  GitBranch,
  Globe,
  Pause,
  Play,
  Plug,
  Power,
  VideoOff,
} from "lucide-react";

import { Terminal } from "@/components/terminal/Terminal";
import { TerminalErrorBoundary } from "@/components/terminal/TerminalErrorBoundary";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  openSubstrateTerminal,
  type SessionView,
} from "@/lib/substrate/client";
import { getSettings } from "@/lib/settings";
import type { OpenTab } from "./open-tabs";
import { SessionStateBadge } from "./SessionStateBadge";
import {
  SANDBOX_LABELS,
  canAttach,
  canEditEgress,
  canEnd,
  canResume,
  canSuspend,
  sessionLabel,
} from "./state";

/**
 * One substrate session tab (dx#123): daax's xterm terminal over
 * `openSubstrateTerminal` (a fresh grant on every (re)connect), a persistent
 * state badge, the recording state, and explicit Suspend / Resume / End.
 *
 * The terminal is mounted only while the session is running. A detach
 * (`{type:"detached"}` or a dropped socket) re-reads the session: still
 * running -> reattach; anything else -> stay detached and show the state.
 * This component never sends a `command` message: the template's AGENT is
 * the entrypoint.
 */
export function SubstrateSessionTab({
  session,
  tab,
  active,
  busy,
  refresh,
  onSuspend,
  onResume,
  onEnd,
  onEgress,
}: {
  session: SessionView;
  tab: OpenTab;
  active: boolean;
  busy: boolean;
  /** Re-read this session from the server; null when it is gone. */
  refresh: () => Promise<SessionView | null>;
  onSuspend: () => void;
  onResume: () => void;
  onEnd: () => void;
  onEgress: () => void;
}) {
  const [epoch, setEpoch] = useState(0);
  const [recording, setRecording] = useState(false);
  const [detached, setDetached] = useState<string | null>(null);
  const record = useMemo(() => {
    try {
      return getSettings().terminalRecordingEnabled !== false;
    } catch {
      return true;
    }
  }, []);

  const connect = useCallback(() => {
    setDetached(null);
    return openSubstrateTerminal(session.id, {
      record,
      sessionType: "ai-coding",
    });
  }, [session.id, record]);

  const onDetached = useCallback(
    async (reason: string) => {
      const s = await refresh();
      const again = !!s && s.state === "running";
      if (!again) setDetached(reason);
      return again;
    },
    [refresh],
  );

  const running = canAttach(session);

  // Back to running (resumed here or elsewhere): attach again on its own.
  const prevState = useRef(session.state);
  useEffect(() => {
    if (session.state === "running" && prevState.current !== "running") {
      setDetached(null);
      setEpoch((e) => e + 1);
    }
    prevState.current = session.state;
  }, [session.state]);

  return (
    <div
      className={active ? "flex flex-col h-full" : "hidden"}
      role="tabpanel"
      id={`substrate-tabpanel-${session.id}`}
      aria-labelledby={`substrate-tab-${session.id}`}
    >
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2 bg-muted/20">
        <span className="text-sm font-medium">{sessionLabel(session)}</span>
        <SessionStateBadge state={session.state} />
        <Badge variant="outline">
          {SANDBOX_LABELS[session.sandboxClass] ?? session.sandboxClass}
        </Badge>
        <Badge variant="outline" className="font-mono">
          {session.template}
        </Badge>
        {running &&
          (recording ? (
            <span
              className="inline-flex items-center gap-1 text-xs text-destructive"
              data-testid="recording-state"
              data-recording="true"
            >
              <Circle className="h-2.5 w-2.5 fill-current animate-pulse" />
              Recording
            </span>
          ) : (
            <span
              className="inline-flex items-center gap-1 text-xs text-muted-foreground"
              data-testid="recording-state"
              data-recording="false"
            >
              <VideoOff className="h-3 w-3" />
              Not recording
            </span>
          ))}
        {(tab.repo || tab.branch) && (
          <span
            className="inline-flex items-center gap-1 text-xs text-muted-foreground"
            title="Provisional (dx#117): kept in this browser only, not applied to the session"
          >
            <GitBranch className="h-3 w-3" />
            {[tab.repo, tab.branch].filter(Boolean).join(" @ ")}
            <Badge variant="secondary" className="ml-1">
              provisional
            </Badge>
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          {canResume(session) ? (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={onResume}
            >
              <Play className="h-3.5 w-3.5 mr-1" />
              Resume
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              disabled={busy || !canSuspend(session)}
              onClick={onSuspend}
            >
              <Pause className="h-3.5 w-3.5 mr-1" />
              Suspend
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            disabled={busy || !canEditEgress(session)}
            onClick={onEgress}
          >
            <Globe className="h-3.5 w-3.5 mr-1" />
            Egress
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={busy || !canEnd(session)}
            onClick={onEnd}
          >
            <Power className="h-3.5 w-3.5 mr-1" />
            End session
          </Button>
        </div>
      </div>

      <div className="flex-1 relative min-h-0 bg-background">
        {running && !detached ? (
          <div className="absolute inset-0">
            <TerminalErrorBoundary>
              <Terminal
                key={`${session.id}:${epoch}`}
                wsUrl={`substrate:${session.id}:${epoch}`}
                connect={connect}
                onDetached={onDetached}
                onRecordingChange={setRecording}
                className="h-full w-full"
              />
            </TerminalErrorBoundary>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center p-6">
            <div
              className="max-w-md text-center space-y-3"
              data-testid="session-detached-panel"
            >
              {session.state === "suspended" ||
              session.state === "suspending" ? (
                <>
                  <p className="text-sm">
                    This session is suspended. Its memory is snapshotted and
                    nothing runs until you resume it.
                  </p>
                  <Button
                    disabled={busy || !canResume(session)}
                    onClick={onResume}
                  >
                    <Play className="h-4 w-4 mr-2" />
                    Resume
                  </Button>
                </>
              ) : session.state === "creating" ||
                session.state === "resuming" ? (
                <p className="text-sm text-muted-foreground">
                  {session.state === "creating"
                    ? "Creating the actor. The first start of a template can take a few minutes."
                    : "Resuming…"}
                </p>
              ) : session.state === "error" ? (
                <>
                  <p className="text-sm text-destructive">
                    {session.lastError ?? "The session failed."}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    A failed session can only be ended.
                  </p>
                </>
              ) : session.state === "ending" ? (
                <p className="text-sm text-muted-foreground">Ending…</p>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    Detached{detached ? `: ${detached}` : ""}. The session keeps
                    running on the server.
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setDetached(null);
                      setEpoch((e) => e + 1);
                    }}
                  >
                    <Plug className="h-4 w-4 mr-2" />
                    Reattach
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
