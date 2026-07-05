"use client";

import { useCallback, useRef } from "react";
import { Check, CheckCheck, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  permissionSequence,
  type PermissionAction,
} from "@/lib/mobile/pty-input";

interface ApproveDenyBarProps {
  /** Send raw bytes to the pty; returns false if the socket isn't open. */
  send: (data: string) => boolean;
  disabled?: boolean;
}

// Ignore a second press within this window so a double-tap can't submit the
// permission choice twice (which could leak an Enter into the next prompt).
const DEBOUNCE_MS = 600;

/**
 * Approve / Approve-always / Deny controls (issue #156). Each maps to the byte
 * sequence a Claude Code permission prompt expects (see lib/mobile/pty-input.ts)
 * and writes it to the same pty WebSocket the desktop terminal uses.
 */
export function ApproveDenyBar({ send, disabled }: ApproveDenyBarProps) {
  const lastRef = useRef(0);

  const act = useCallback(
    (action: PermissionAction) => {
      const now = Date.now();
      if (now - lastRef.current < DEBOUNCE_MS) return;
      // Only open the debounce window when the send actually lands. `send`
      // returns false when the socket isn't open; advancing the timestamp on a
      // failed send would lock the user out for DEBOUNCE_MS with nothing sent.
      if (send(permissionSequence(action))) lastRef.current = now;
    },
    [send],
  );

  return (
    <div className="grid grid-cols-2 gap-2">
      <Button
        size="lg"
        className="h-14 text-base"
        disabled={disabled}
        onClick={() => act("approve")}
      >
        <Check className="mr-1" /> Approve
      </Button>
      <Button
        size="lg"
        variant="destructive"
        className="h-14 text-base"
        disabled={disabled}
        onClick={() => act("deny")}
      >
        <X className="mr-1" /> Deny
      </Button>
      <Button
        size="lg"
        variant="secondary"
        className="col-span-2 h-12"
        disabled={disabled}
        onClick={() => act("approve_always")}
      >
        <CheckCheck className="mr-1" /> Approve &amp; don&apos;t ask again
      </Button>
    </div>
  );
}
