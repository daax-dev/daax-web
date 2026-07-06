"use client";

import { Button } from "@/components/ui/button";
import { controlSequence, type ControlKey } from "@/lib/mobile/pty-input";

interface ModifierKeyRowProps {
  send: (data: string) => boolean;
  disabled?: boolean;
}

// Common terminal keys a phone keyboard can't produce, in display order.
const KEYS: { key: ControlKey; label: string }[] = [
  { key: "escape", label: "Esc" },
  { key: "tab", label: "Tab" },
  { key: "ctrlC", label: "Ctrl-C" },
  { key: "up", label: "↑" },
  { key: "down", label: "↓" },
  { key: "left", label: "←" },
  { key: "right", label: "→" },
  { key: "enter", label: "⏎" },
];

/**
 * Row of terminal modifier / navigation keys (issue #156). Each sends the exact
 * VT100 control sequence (lib/mobile/pty-input.ts) to the pty — the affordance a
 * mobile soft keyboard lacks for driving a TUI.
 */
export function ModifierKeyRow({ send, disabled }: ModifierKeyRowProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {KEYS.map(({ key, label }) => (
        <Button
          key={key}
          size="sm"
          variant="outline"
          disabled={disabled}
          className="min-w-11 font-mono"
          aria-label={`Send ${label}`}
          onClick={() => send(controlSequence(key))}
        >
          {label}
        </Button>
      ))}
    </div>
  );
}
