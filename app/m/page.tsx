"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Bell, BellRing, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConnectionStatus } from "@/components/mobile/ConnectionStatus";
import { PromptView } from "@/components/mobile/PromptView";
import { ApproveDenyBar } from "@/components/mobile/ApproveDenyBar";
import { ModifierKeyRow } from "@/components/mobile/ModifierKeyRow";
import { FollowUpInput } from "@/components/mobile/FollowUpInput";
import { useUnblockSession } from "@/hooks/useUnblockSession";
import {
  permissionState,
  requestPermission,
  type DesktopPermission,
} from "@/lib/notifications/desktop";

/**
 * Mobile agent-unblock view (issue #156).
 *
 * Lets a developer see a pending agent prompt and Approve / Deny / send a short
 * follow-up from a phone, writing to the same terminal WebSocket (:4201) the
 * desktop uses. Installable as a PWA (app/manifest.ts + public/sw.js).
 *
 * Connection target is chosen via query params, mirroring desktop semantics:
 *   ?mode=local|container|shell-tmux  (default: local)
 *   ?containerName=daax-xxxxxxxx      (exec into a running container)
 *   ?command=…  ?cwd=…
 *
 * The auto-trigger that flags WHICH session is waiting-for-input is deferred
 * (depends on watchtower exposing notification events — same wall as #153/#154).
 * This view works for any reachable session regardless.
 */
function UnblockView() {
  const params = useSearchParams();
  const mode = params.get("mode") || "local";
  const containerName = params.get("containerName") || undefined;
  const command = params.get("command") || undefined;
  const cwd = params.get("cwd") || undefined;

  const { status, sessionId, output, send, reconnect } = useUnblockSession({
    mode,
    containerName,
    command,
    cwd,
  });

  const [perm, setPerm] = useState<DesktopPermission>("default");
  useEffect(() => setPerm(permissionState()), []);
  const enableNotifications = useCallback(async () => {
    setPerm(await requestPermission());
  }, []);

  const live = status === "open";
  const dead =
    status === "closed" || status === "error" || status === "unauthorized";

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-4 p-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">
            Unblock agent
          </h1>
          <p className="text-xs text-muted-foreground">
            Approve, deny, or reply from your phone
          </p>
        </div>
        {perm !== "granted" && perm !== "unsupported" && (
          <Button
            size="sm"
            variant="ghost"
            onClick={enableNotifications}
            aria-label="Enable notifications"
          >
            <Bell className="mr-1" /> Notify
          </Button>
        )}
        {perm === "granted" && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <BellRing className="size-4" /> On
          </span>
        )}
      </header>

      <ConnectionStatus status={status} sessionId={sessionId} />

      <PromptView output={output} />

      {dead && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {status === "unauthorized"
            ? "Not authorized to connect to the terminal server."
            : "Connection closed."}
          <Button
            size="sm"
            variant="outline"
            className="ml-2"
            onClick={reconnect}
          >
            <RefreshCw className="mr-1" /> Reconnect
          </Button>
        </div>
      )}

      <section className="flex flex-col gap-3">
        <ApproveDenyBar send={send} disabled={!live} />
        <FollowUpInput send={send} disabled={!live} />
        <ModifierKeyRow send={send} disabled={!live} />
      </section>

      <p className="mt-auto pt-2 text-center text-[11px] leading-tight text-muted-foreground">
        Approve/Deny map to a Claude Code permission prompt. If the agent uses a
        different prompt, use the follow-up field or the key row.
      </p>
    </div>
  );
}

export default function MobileUnblockPage() {
  // useSearchParams requires a Suspense boundary in the App Router.
  return (
    <Suspense
      fallback={
        <div className="p-4 text-sm text-muted-foreground">Loading…</div>
      }
    >
      <UnblockView />
    </Suspense>
  );
}
