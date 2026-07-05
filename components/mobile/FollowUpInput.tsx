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
      <Button
        type="submit"
        size="icon"
        disabled={disabled || value.length === 0}
      >
        <Send />
      </Button>
    </form>
  );
}
