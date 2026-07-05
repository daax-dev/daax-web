"use client";

import { useCallback, useState } from "react";
import { Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { followUpInput } from "@/lib/mobile/pty-input";

interface FollowUpInputProps {
  send: (data: string) => boolean;
  disabled?: boolean;
}

/**
 * Short free-text follow-up to the agent (issue #156). Sanitizes control chars
 * and submits with a single Enter (lib/mobile/pty-input.ts:followUpInput), then
 * clears the field. Empty input is a no-op (never sends a bare newline).
 */
export function FollowUpInput({ send, disabled }: FollowUpInputProps) {
  const [value, setValue] = useState("");

  const submit = useCallback(() => {
    const data = followUpInput(value);
    if (data && send(data)) setValue("");
  }, [value, send]);

  // Enable Send only when the SANITIZED payload is non-empty: control-only
  // input (tabs/newlines) sanitizes to "" and would be a no-op click. Reuse the
  // send-path sanitizer (submit=false → no trailing Enter) so the button state
  // reflects exactly what would be sent.
  const canSend = followUpInput(value, false).length > 0;

  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Input
        value={value}
        disabled={disabled}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Send a short follow-up…"
        aria-label="Follow-up message to the agent"
        enterKeyHint="send"
        autoCapitalize="off"
        autoCorrect="off"
      />
      <Button type="submit" size="icon" disabled={disabled || !canSend}>
        <Send />
      </Button>
    </form>
  );
}
