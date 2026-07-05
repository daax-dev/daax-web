"use client";

/**
 * App-wide blocked-agent notification bell (issue #154).
 *
 * Mounted once in the Titlebar. Shows an unacknowledged-count badge, a dropdown
 * of currently-blocked (🟡 waiting-for-input) agent sessions that deep-link to
 * each session's detail/terminal, and a self-contained desktop-notification
 * toggle (kept out of the shared settings page on purpose).
 *
 * All detection/dedup lives in useBlockedAgents + the pure engine; this file is
 * presentation only.
 */

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { Bell, BellRing, Clock, FolderGit2, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { formatAge } from "@/lib/attention/format";
import { useBlockedAgents } from "@/hooks/useBlockedAgents";

export function NotificationBell() {
  const {
    entries,
    count,
    acknowledgeAll,
    acknowledgeOne,
    desktopEnabled,
    permission,
    supported,
    enableDesktop,
    disableDesktop,
  } = useBlockedAgents();

  const hasWaiting = entries.length > 0;
  const now = Date.now();

  const onOpenChange = (open: boolean) => {
    // Opening the bell = the user has seen the alerts → clear the badge.
    if (open && count > 0) acknowledgeAll();
  };

  const onToggleDesktop = (next: boolean) => {
    if (next) void enableDesktop();
    else disableDesktop();
  };

  return (
    <Popover onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={
            count > 0
              ? `Notifications: ${count} agent${count === 1 ? "" : "s"} waiting for input`
              : "Notifications"
          }
        >
          {hasWaiting ? (
            <motion.span
              key="ring"
              initial={{ rotate: 0 }}
              animate={{ rotate: [0, -12, 10, -6, 4, 0] }}
              transition={{ duration: 0.6, repeat: Infinity, repeatDelay: 2 }}
              className="inline-flex"
            >
              <BellRing className="h-4 w-4 text-warning" aria-hidden />
            </motion.span>
          ) : (
            <Bell className="h-4 w-4" aria-hidden />
          )}

          <AnimatePresence>
            {count > 0 && (
              <motion.span
                key="badge"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                className={cn(
                  "absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center",
                  "rounded-full bg-warning px-1 text-[10px] font-semibold leading-none",
                  "text-warning-foreground tabular-nums",
                )}
                data-testid="bell-badge"
              >
                {count > 9 ? "9+" : count}
              </motion.span>
            )}
          </AnimatePresence>
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <span className="text-sm font-medium text-foreground">
            Waiting for input
          </span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {entries.length} active
          </span>
        </div>

        {hasWaiting ? (
          <ul className="max-h-72 divide-y divide-border overflow-y-auto">
            {entries.map((e) => (
              <li key={e.id}>
                <Link
                  href={`/ai-coding/sessions/${encodeURIComponent(e.id)}`}
                  onClick={() => acknowledgeOne(e.id)}
                  className={cn(
                    "flex flex-col gap-1 px-4 py-3 transition-colors",
                    "hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 truncate">
                      <span
                        className="inline-flex h-2 w-2 shrink-0 rounded-full bg-warning"
                        aria-hidden
                      />
                      <span className="truncate text-sm font-medium text-foreground">
                        {e.label}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground tabular-nums">
                      <Clock className="h-3 w-3" aria-hidden />
                      {e.since != null ? formatAge(now - e.since) : "—"}
                    </span>
                  </div>
                  {e.cwd && (
                    <span className="flex items-center gap-1 truncate pl-4 font-mono text-xs text-muted-foreground">
                      <FolderGit2 className="h-3 w-3 shrink-0" aria-hidden />
                      {e.cwd}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-col items-center justify-center px-4 py-8 text-center text-muted-foreground">
            <Inbox className="mb-2 h-8 w-8 opacity-30" aria-hidden />
            <p className="text-xs">No agents are waiting for input.</p>
          </div>
        )}

        <div className="border-t px-4 py-3">
          <label className="flex items-center justify-between gap-3">
            <span className="flex flex-col">
              <span className="text-sm text-foreground">
                Desktop notifications
              </span>
              <span className="text-xs text-muted-foreground">
                {!supported
                  ? "Not supported in this browser"
                  : permission === "denied"
                    ? "Blocked in browser settings"
                    : desktopEnabled && permission === "granted"
                      ? "On — alerts when an agent is blocked"
                      : "Off"}
              </span>
            </span>
            <Switch
              checked={desktopEnabled && permission === "granted"}
              onCheckedChange={onToggleDesktop}
              disabled={!supported || permission === "denied"}
              aria-label="Toggle desktop notifications"
            />
          </label>
        </div>
      </PopoverContent>
    </Popover>
  );
}
