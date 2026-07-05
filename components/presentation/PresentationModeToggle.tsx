"use client";

/**
 * Presentation / mask mode toggle + active indicator (issue #155).
 *
 * A self-contained, globally-mounted control (no shared-layout edits needed).
 * Toggling ON visually redacts secrets in the live terminal and recording
 * playback so a session can be safely screen-shared. Masking is BEST-EFFORT and
 * visual-only — the underlying recording data is never modified.
 */

import { Presentation, ShieldCheck } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";
import { usePresentationMode } from "@/lib/presentation-mode";

/** Fixed banner shown while presentation mode is active. */
function ActiveBanner() {
  return (
    <motion.div
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      className="pointer-events-none fixed inset-x-0 top-0 z-[80] flex justify-center px-4 pt-2"
      role="status"
      aria-live="polite"
    >
      <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-primary/40 bg-primary/15 px-3 py-1 text-xs font-medium text-primary shadow-sm backdrop-blur">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
        </span>
        <span>Presentation mode — secrets visually masked (best-effort)</span>
      </div>
    </motion.div>
  );
}

export function PresentationModeToggle() {
  const { enabled, toggle } = usePresentationMode();

  return (
    <>
      <AnimatePresence>{enabled && <ActiveBanner />}</AnimatePresence>

      <motion.button
        type="button"
        onClick={toggle}
        whileTap={{ scale: 0.95 }}
        aria-pressed={enabled}
        aria-label={
          enabled
            ? "Presentation mode on — secrets visually masked. Click to turn off."
            : "Presentation mode off — click to visually mask secrets for screen-sharing."
        }
        title={
          enabled
            ? "Presentation mode ON — secrets are visually masked (best-effort, not a security guarantee). Click to turn off."
            : "Presentation mode OFF — click to visually mask secrets for screen-sharing (best-effort, not a security guarantee)."
        }
        className={cn(
          "fixed bottom-4 left-4 z-[80] flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-medium shadow-md transition-colors",
          enabled
            ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
            : "border-border bg-background/90 text-muted-foreground backdrop-blur hover:bg-accent hover:text-foreground",
        )}
      >
        {enabled ? (
          <ShieldCheck className="h-4 w-4" />
        ) : (
          <Presentation className="h-4 w-4" />
        )}
        <span className="hidden sm:inline-block">
          {enabled ? "Masking on" : "Presentation mode"}
        </span>
      </motion.button>
    </>
  );
}
