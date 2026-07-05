"use client";

/**
 * Attention board (issue #153): one card per active agent session with a live,
 * derived status orb. Handles loading, disconnected (Watchtower unreachable),
 * and empty (no sessions) states so it degrades gracefully and never crashes.
 */

import { useEffect, useState } from "react";
import { RefreshCw, WifiOff, Inbox, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAttentionPoll } from "@/hooks/useAttentionPoll";
import { AttentionCard } from "./AttentionCard";

export function AttentionBoard() {
  const { cards, conn, refresh } = useAttentionPoll();

  // A 1s ticker keeps "time-in-state" ages live between the (2s) data polls.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Radio
            className={
              conn === "connected"
                ? "h-4 w-4 text-success"
                : "h-4 w-4 text-muted-foreground"
            }
            aria-hidden
          />
          <span>
            {conn === "connected"
              ? `${cards.length} active ${cards.length === 1 ? "session" : "sessions"}`
              : conn === "loading"
                ? "Connecting…"
                : "Disconnected"}
          </span>
        </div>
        <Button variant="ghost" size="sm" onClick={refresh}>
          <RefreshCw className="mr-1 h-4 w-4" aria-hidden />
          Refresh
        </Button>
      </div>

      {conn === "loading" && cards.length === 0 ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <RefreshCw className="mr-2 h-5 w-5 animate-spin" aria-hidden />
          <span>Loading sessions…</span>
        </div>
      ) : conn === "disconnected" ? (
        <div
          className="flex flex-col items-center justify-center rounded-lg border border-destructive/40 bg-destructive/5 py-16 text-center"
          data-testid="disconnected-state"
        >
          <WifiOff
            className="mb-3 h-10 w-10 text-destructive opacity-70"
            aria-hidden
          />
          <h3 className="mb-1 text-sm font-medium text-foreground">
            Watchtower unreachable
          </h3>
          <p className="mb-4 max-w-sm text-xs text-muted-foreground">
            Could not reach the session monitor. Retrying automatically every
            couple of seconds.
          </p>
          <Button variant="outline" size="sm" onClick={refresh}>
            <RefreshCw className="mr-1 h-4 w-4" aria-hidden />
            Retry now
          </Button>
        </div>
      ) : cards.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground"
          data-testid="empty-state"
        >
          <Inbox className="mb-3 h-10 w-10 opacity-30" aria-hidden />
          <h3 className="mb-1 text-sm font-medium">No active sessions</h3>
          <p className="text-xs">
            Agent sessions will appear here as they start reporting activity.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => (
            <AttentionCard key={card.id} card={card} now={now} />
          ))}
        </div>
      )}
    </div>
  );
}
