"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConnectionStatus } from "@/components/mobile/ConnectionStatus";
import { PromptView } from "@/components/mobile/PromptView";
import { ApproveDenyBar } from "@/components/mobile/ApproveDenyBar";
import { ModifierKeyRow } from "@/components/mobile/ModifierKeyRow";
import { FollowUpInput } from "@/components/mobile/FollowUpInput";
import { useUnblockSession } from "@/hooks/useUnblockSession";

/**
 * Mobile terminal control surface (issue #156).
 *
 * IMPORTANT — what this is and is NOT:
 *   The terminal server mints a FRESH pty per WebSocket
 *   (server/handlers/connection-handler.ts assigns a new sessionId every
 *   connect; there is no attach-by-id). So this view drives a NEW shell/agent
 *   session that it opens — it does NOT yet attach to an already-running agent.
 *   Approve/Deny/keys here affect THIS session only. Attaching to a running
 *   agent needs server-side pty multiplexing (deferred). The UI states this
 *   plainly so a user never believes a prod agent was approved when it wasn't.
 *
 * The buttons send the SAME `{ type: "input", data }` frames and ticket auth
 * the desktop terminal uses. Connection target via query params:
 *   ?mode=local|container|shell-tmux  (default: local — a raw shell)
 *   ?containerName=daax-xxxxxxxx      (exec a new shell in a running container)
 *   ?command=…  ?cwd=…
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

  // The follow-up field writes raw text to a shell (in mode=local, a real
  // root/docker.sock shell). Gate it behind an explicit acknowledgement so a
  // user can't type prose thinking it's an "agent reply" and run it as a
  // command unawares.
  const [ackRawShell, setAckRawShell] = useState(false);

  const live = status === "open";
  const dead =
    status === "closed" || status === "error" || status === "unauthorized";

  return (
    <div
      className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-4 p-4"
      style={{
        paddingTop: "max(1rem, env(safe-area-inset-top))",
        paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
        paddingLeft: "max(1rem, env(safe-area-inset-left))",
        paddingRight: "max(1rem, env(safe-area-inset-right))",
      }}
    >
      <header>
        <h1 className="text-lg font-semibold text-foreground">
          Mobile terminal
        </h1>
        <p className="text-xs text-muted-foreground">
          Sends keystrokes to a shell session on your workbench
        </p>
      </header>

      {/* Persistent, unmissable statement of the actual capability. */}
      <div
        role="alert"
        className="flex gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs leading-snug text-foreground"
      >
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
        <span>
          This opens a <strong>new shell session</strong>
          {mode === "local" ? " (a raw shell on the host)" : ""}. It does{" "}
          <strong>not yet attach</strong> to an already-running agent — anything
          you send here affects this new session only, not a blocked agent
          elsewhere. Live attach arrives with server-side pty multiplexing.
        </span>
      </div>

      <ConnectionStatus status={status} sessionId={sessionId} />

      <PromptView output={output} />

      {dead && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          <span>
            {status === "unauthorized"
              ? "Not authorized to connect to the terminal server."
              : "Connection closed."}
          </span>
          <Button
            size="sm"
            variant="outline"
            className="ml-auto"
            onClick={reconnect}
          >
            <RefreshCw className="mr-1" /> Reconnect
          </Button>
        </div>
      )}

      <section className="flex flex-col gap-3">
        <ApproveDenyBar send={send} disabled={!live} />

        <label className="flex items-start gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-primary"
            checked={ackRawShell}
            onChange={(e) => setAckRawShell(e.target.checked)}
            aria-label="Acknowledge follow-up types into a raw shell"
          />
          <span>
            The follow-up field types into a <strong>raw shell</strong>, not
            your agent — text is run as a command. I understand.
          </span>
        </label>
        <FollowUpInput send={send} disabled={!live || !ackRawShell} />

        <ModifierKeyRow send={send} disabled={!live} />
      </section>

      <p className="mt-auto pt-2 text-center text-[11px] leading-tight text-muted-foreground">
        Approve/Deny map to a Claude Code permission prompt. Background alerts
        (wake-on-lockscreen) are not available yet — the Web Push backend is
        pending.
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
