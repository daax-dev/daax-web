"use client";

/**
 * AI Coding > Substrate (dx#123)
 *
 * Persistent agent sessions on Agent Substrate (dx#113 / #114): a Sessions
 * tab (the caller's sessions; admins see all, with an Owner column) plus one
 * tab per opened session. Sessions always come from the server; which tabs
 * are open is a per-browser convenience. Closing a tab only detaches. End
 * session (with confirmation) is the only kill.
 */
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Boxes, List, Plus, RefreshCw, Shield, X } from "lucide-react";
import { toast } from "sonner";

import { AGENT_ACCENTS, AGENT_ICONS } from "@/components/icons/AgentIcons";
import { AgentLaunchDialog } from "@/components/ai-coding/substrate/AgentLaunchDialog";
import { EgressEditorSheet } from "@/components/ai-coding/substrate/EgressEditorSheet";
import { EndSessionDialog } from "@/components/ai-coding/substrate/EndSessionDialog";
import { SubstrateSessionTab } from "@/components/ai-coding/substrate/SubstrateSessionTab";
import { SubstrateSessionsTable } from "@/components/ai-coding/substrate/SubstrateSessionsTable";
import {
  endSession,
  resumeSession,
  suspendSession,
} from "@/components/ai-coding/substrate/actions";
import {
  addOpenTab,
  readOpenTabs,
  removeOpenTab,
  writeOpenTabs,
  type OpenTab,
} from "@/components/ai-coding/substrate/open-tabs";
import {
  badgeState,
  isTransitional,
} from "@/components/ai-coding/substrate/state";
import { useSubstrateConfig } from "@/components/ai-coding/substrate/use-substrate-config";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useTerminalManager } from "@/components/terminal/TerminalManager";
import { useAdminAccess } from "@/hooks/use-admin-access";
import { useProject } from "@/lib/project-context";
import {
  SubstrateApiError,
  substrateApi,
  type SessionView,
} from "@/lib/substrate/client";
import { cn } from "@/lib/utils";

const POLL_MS = 5_000;
const FAST_POLL_MS = 1_500;
const SESSIONS_TAB = "sessions";

const DOT: Record<ReturnType<typeof badgeState>, string> = {
  creating: "bg-primary",
  running: "bg-success",
  suspended: "bg-warning",
  ending: "bg-muted-foreground",
  error: "bg-destructive",
};

function SubstratePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const cfg = useSubstrateConfig();
  const { isAdmin } = useAdminAccess();
  const { createAISession } = useTerminalManager();
  const { activeProject, getProjectPath, basePath } = useProject();

  const [sessions, setSessions] = useState<SessionView[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tabs, setTabs] = useState<OpenTab[]>([]);
  const [active, setActive] = useState<string>(SESSIONS_TAB);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [launchOpen, setLaunchOpen] = useState(false);
  const [endTarget, setEndTarget] = useState<SessionView | null>(null);
  const [egressTarget, setEgressTarget] = useState<SessionView | null>(null);

  useEffect(() => setTabs(readOpenTabs()), []);

  const persistTabs = useCallback((next: OpenTab[]) => {
    setTabs(next);
    writeOpenTabs(next);
  }, []);

  const load = useCallback(async () => {
    try {
      const { sessions: list } = await substrateApi.list();
      setSessions(list);
      setLoadError(null);
      setLoaded(true);
    } catch (err) {
      setLoadError((err as Error).message);
    }
  }, []);

  const enabled = cfg.status === "enabled";
  const anyMoving = sessions.some((s) => isTransitional(s.state));
  useEffect(() => {
    if (!enabled) return;
    void load();
    const t = setInterval(load, anyMoving ? FAST_POLL_MS : POLL_MS);
    return () => clearInterval(t);
  }, [enabled, anyMoving, load]);

  // ?open=<id>: open (or focus) that session's tab, then clear the param.
  const openParam = searchParams.get("open");
  useEffect(() => {
    if (!openParam) return;
    persistTabs(addOpenTab(readOpenTabs(), { id: openParam }));
    setActive(openParam);
    router.replace("/ai-coding/substrate");
  }, [openParam, persistTabs, router]);

  const byId = useMemo(
    () => new Map(sessions.map((s) => [s.id, s])),
    [sessions],
  );

  const upsert = useCallback((s: SessionView) => {
    setSessions((prev) => {
      const i = prev.findIndex((x) => x.id === s.id);
      if (i < 0) return [s, ...prev];
      const next = [...prev];
      // A mutation answer has no live actorState: keep the last one.
      next[i] = { ...prev[i], ...s };
      return next;
    });
  }, []);

  const refreshOne = useCallback(
    async (id: string): Promise<SessionView | null> => {
      try {
        const s = await substrateApi.get(id);
        upsert(s);
        return s;
      } catch (err) {
        if (err instanceof SubstrateApiError && err.status === 404) {
          setSessions((prev) => prev.filter((x) => x.id !== id));
        }
        return null;
      }
    },
    [upsert],
  );

  const withBusy = useCallback(async (id: string, fn: () => Promise<void>) => {
    setBusy((b) => new Set(b).add(id));
    try {
      await fn();
    } finally {
      setBusy((b) => {
        const n = new Set(b);
        n.delete(id);
        return n;
      });
    }
  }, []);

  const openTab = useCallback(
    (s: SessionView) => {
      persistTabs(addOpenTab(tabs, { id: s.id }));
      setActive(s.id);
    },
    [tabs, persistTabs],
  );

  const closeTab = useCallback(
    (id: string) => {
      persistTabs(removeOpenTab(tabs, id));
      if (active === id) setActive(SESSIONS_TAB);
      if (byId.has(id)) {
        toast.message(
          "Detached. The session keeps running; reattach it from Sessions.",
        );
      }
    },
    [tabs, active, byId, persistTabs],
  );

  const doSuspend = (s: SessionView) =>
    withBusy(s.id, async () => {
      const r = await suspendSession(s.id);
      if (r) upsert(r);
      await refreshOne(s.id);
    });
  const doResume = (s: SessionView) =>
    withBusy(s.id, async () => {
      const r = await resumeSession(s.id);
      if (r) upsert(r);
      await refreshOne(s.id);
    });
  const doEnd = async (s: SessionView) => {
    await withBusy(s.id, async () => {
      upsert({ ...s, state: "ending" });
      const gone = await endSession(s.id);
      if (gone) {
        setSessions((prev) => prev.filter((x) => x.id !== s.id));
        persistTabs(removeOpenTab(readOpenTabs(), s.id));
        if (active === s.id) setActive(SESSIONS_TAB);
      } else {
        await refreshOne(s.id);
      }
    });
  };

  const presetHosts = (
    cfg.status === "enabled" ? cfg.config.egressPresets : {}
  ) as Record<string, readonly string[]>;

  if (cfg.status === "loading") {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }
  if (cfg.status !== "enabled") {
    return (
      <div className="container max-w-screen-2xl mx-auto p-6">
        <Card className="p-6 space-y-2" data-testid="substrate-disabled">
          <div className="flex items-center gap-2">
            <Boxes className="h-5 w-5" />
            <h1 className="text-lg font-semibold">Substrate</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            {cfg.status === "disabled"
              ? "The substrate backend is not enabled on this daax (DAAX_SUBSTRATE_ENABLED). Container sessions are unaffected."
              : `The substrate backend is unavailable: ${cfg.message}`}
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-6rem)]">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <Boxes className="h-5 w-5" />
          <h1 className="text-xl font-bold">Substrate</h1>
          <span className="text-sm text-muted-foreground hidden sm:inline">
            persistent sessions · atespace {cfg.config.atespace}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Button variant="ghost" size="sm" asChild>
              <Link href="/ai-coding/admin">
                <Shield className="h-4 w-4 mr-1" />
                Admin
              </Link>
            </Button>
          )}
          <Button size="sm" onClick={() => setLaunchOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Launch
          </Button>
        </div>
      </div>

      <div className="flex items-center border-b bg-muted/30 px-2">
        <div
          role="tablist"
          aria-label="Substrate sessions"
          className="flex items-center gap-0.5 overflow-x-auto py-1 flex-1"
        >
          <button
            role="tab"
            type="button"
            aria-selected={active === SESSIONS_TAB}
            onClick={() => setActive(SESSIONS_TAB)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-t-md border-b-2 -mb-px text-sm",
              active === SESSIONS_TAB
                ? "bg-background border-primary"
                : "border-transparent hover:bg-muted",
            )}
          >
            <List className="h-3.5 w-3.5" />
            Sessions
            <span className="text-xs text-muted-foreground">
              ({sessions.length})
            </span>
          </button>
          {tabs.map((t) => {
            const s = byId.get(t.id);
            const Icon = s
              ? AGENT_ICONS[s.agent as keyof typeof AGENT_ICONS]
              : null;
            const accent = s
              ? AGENT_ACCENTS[s.agent as keyof typeof AGENT_ACCENTS]
              : "";
            const isActive = active === t.id;
            return (
              <div
                key={t.id}
                role="tab"
                id={`substrate-tab-${t.id}`}
                aria-selected={isActive}
                aria-controls={`substrate-tabpanel-${t.id}`}
                tabIndex={isActive ? 0 : -1}
                data-testid="substrate-tab"
                onClick={() => setActive(t.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") setActive(t.id);
                }}
                className={cn(
                  "group flex items-center gap-1.5 pl-2.5 pr-1 py-1.5 rounded-t-md border-b-2 -mb-px cursor-pointer select-none text-sm",
                  isActive
                    ? "bg-background border-primary"
                    : "border-transparent hover:bg-muted",
                )}
              >
                <span
                  className={cn(
                    "inline-block h-2 w-2 rounded-full shrink-0",
                    s ? DOT[badgeState(s.state)] : "bg-muted-foreground/50",
                  )}
                  aria-hidden
                />
                {Icon && <Icon className={cn("h-3.5 w-3.5", accent)} />}
                <span className="font-mono text-xs">
                  {s ? s.actorName.replace(/^daax-/, "") : t.id.slice(0, 8)}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(t.id);
                  }}
                  className="p-0.5 rounded hover:bg-muted"
                  aria-label="Close tab (detach; the session keeps running)"
                  title="Close tab (detach; the session keeps running)"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void load()}
          aria-label="Refresh"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 min-h-0 relative">
        {active === SESSIONS_TAB && (
          <div className="h-full overflow-y-auto p-4 space-y-3" role="tabpanel">
            <p className="text-sm text-muted-foreground">
              {isAdmin
                ? "All substrate sessions (admin)."
                : "Your substrate sessions."}{" "}
              They keep running with no tab open; only End session stops one.
            </p>
            {loadError && (
              <p className="text-sm text-destructive" role="alert">
                {loadError}
              </p>
            )}
            {!loaded && !loadError ? (
              <p className="text-sm text-muted-foreground">Loading sessions…</p>
            ) : sessions.length === 0 ? (
              <Card
                className="p-8 text-center space-y-3"
                data-testid="substrate-empty"
              >
                <Boxes className="h-10 w-10 mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  No substrate sessions.
                </p>
                <Button onClick={() => setLaunchOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Launch Agent
                </Button>
              </Card>
            ) : (
              <SubstrateSessionsTable
                sessions={sessions}
                showOwner={isAdmin}
                busy={busy}
                actions={{
                  onOpen: openTab,
                  onSuspend: (s) => void doSuspend(s),
                  onResume: (s) => void doResume(s),
                  onEnd: (s) => setEndTarget(s),
                  onEgress: (s) => setEgressTarget(s),
                }}
              />
            )}
          </div>
        )}

        {tabs.map((t) => {
          const s = byId.get(t.id);
          if (!s) {
            return active === t.id ? (
              <div
                key={t.id}
                className="flex h-full items-center justify-center p-6"
              >
                <div className="text-center space-y-3">
                  <p className="text-sm text-muted-foreground">
                    {loaded
                      ? "This session has ended or is not visible to you."
                      : "Loading session…"}
                  </p>
                  {loaded && (
                    <Button variant="outline" onClick={() => closeTab(t.id)}>
                      Close tab
                    </Button>
                  )}
                </div>
              </div>
            ) : null;
          }
          return (
            <SubstrateSessionTab
              key={t.id}
              session={s}
              tab={t}
              active={active === t.id}
              busy={busy.has(t.id)}
              refresh={() => refreshOne(t.id)}
              onSuspend={() => void doSuspend(s)}
              onResume={() => void doResume(s)}
              onEnd={() => setEndTarget(s)}
              onEgress={() => setEgressTarget(s)}
            />
          );
        })}
      </div>

      <AgentLaunchDialog
        open={launchOpen}
        onOpenChange={setLaunchOpen}
        defaultBackend="substrate"
        onLaunchContainer={(tool) => {
          // Same launch as the Coding Agents layouts; the container session
          // is shown there (its terminal lives in TerminalManager).
          if (activeProject) {
            createAISession(tool, {
              projectName: activeProject,
              mountPath: getProjectPath(),
            });
          } else {
            createAISession(tool, { mountPath: basePath });
          }
          router.push("/ai-coding");
        }}
        onLaunchedSubstrate={(s) => {
          upsert(s);
          persistTabs(addOpenTab(readOpenTabs(), { id: s.id }));
          setActive(s.id);
        }}
      />
      <EndSessionDialog
        session={endTarget}
        open={!!endTarget}
        onOpenChange={(o) => !o && setEndTarget(null)}
        onConfirm={async () => {
          if (endTarget) await doEnd(endTarget);
        }}
      />
      <EgressEditorSheet
        session={
          egressTarget ? (byId.get(egressTarget.id) ?? egressTarget) : null
        }
        presetHosts={presetHosts}
        open={!!egressTarget}
        onOpenChange={(o) => !o && setEgressTarget(null)}
        onSaved={upsert}
      />
    </div>
  );
}

export default function SubstratePage() {
  return (
    <Suspense fallback={null}>
      <SubstratePageInner />
    </Suspense>
  );
}
