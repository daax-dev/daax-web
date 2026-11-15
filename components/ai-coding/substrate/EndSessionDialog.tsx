"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { SessionView } from "@/lib/substrate/client";
import { sessionLabel } from "./state";

/**
 * Confirmation for End session: the ONLY action that kills an agent (dx#114).
 * It deletes the actor and its egress policy; nothing can bring it back.
 */
export function EndSessionDialog({
  session,
  open,
  onOpenChange,
  onConfirm,
}: {
  session: Pick<SessionView, "agent" | "actorName"> | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <AlertDialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>End this session?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>
                {session ? (
                  <span className="font-medium text-foreground">
                    {sessionLabel(session)}
                  </span>
                ) : (
                  "This session"
                )}{" "}
                will be stopped for good: the agent, its working state and its
                egress policy are deleted.
              </p>
              <p>
                This is the only way a session ends. To stop watching it, close
                the tab instead (it keeps running). To pause it, Suspend.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
                onOpenChange(false);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            End session
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
