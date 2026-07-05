"use client";

import { useEffect, useMemo, useRef } from "react";

import { tailLines } from "@/lib/mobile/ansi";

interface PromptViewProps {
  /** Raw accumulated pty output. */
  output: string;
  /** How many trailing lines of prompt context to show. */
  maxLines?: number;
}

/**
 * Compact, read-only view of the pending prompt (issue #156). Shows the tail of
 * the pty output with ANSI stripped — enough to read a permission question or
 * agent prompt on a phone without loading xterm. Auto-scrolls to the bottom as
 * new output arrives.
 */
export function PromptView({ output, maxLines = 18 }: PromptViewProps) {
  const ref = useRef<HTMLPreElement>(null);
  const text = useMemo(() => tailLines(output, maxLines), [output, maxLines]);

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [text]);

  return (
    <pre
      ref={ref}
      aria-label="Pending agent output"
      className="max-h-[45vh] min-h-[8rem] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-muted/40 p-3 font-mono text-xs leading-relaxed text-foreground"
    >
      {text || "Waiting for output…"}
    </pre>
  );
}
