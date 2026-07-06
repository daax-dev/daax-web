"use client";

/**
 * App-wide blocked-agent detection for the notification bell (issue #154).
 *
 * Composition of existing pieces — no new data source:
 *   useAttentionPoll (issue #153) → NotifyCard[] → reconcile (pure engine) →
 *   bell entries + browser Notifications.
 *
 * A session is "blocked / waiting-for-input" iff its derived Attention status is
 * `waiting`. See lib/attention/notifications.ts for why that is the correct and
 * only honest signal today (Watchtower exposes no readable notification stream
 * to the REST board) and how this lights up automatically once it does.
 *
 * Resilience:
 *  - Polling continues while the tab is hidden (pauseWhenHidden:false) so alerts
 *    fire when the user is away.
 *  - The pure engine guarantees exactly one notification per not-waiting →
 *    waiting transition and auto-clears entries when a session leaves waiting.
 *  - Firing is a no-op unless the user enabled desktop notifications AND the
 *    browser granted permission; fireBlockedNotification is itself fully guarded.
 *  - State updates are skipped when nothing changed, so the app-wide mount does
 *    not re-render every poll.
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useAttentionPoll } from "./useAttentionPoll";
import {
  acknowledgeAll,
  acknowledgeOne,
  entryList,
  initialState,
  reconcile,
  unacknowledgedCount,
  type NotifyCard,
  type NotifyEntry,
  type NotifyState,
} from "@/lib/attention/notifications";
import {
  getDesktopEnabled,
  getServerSnapshot,
  setDesktopEnabled,
  subscribe as subscribePref,
} from "@/lib/notifications/preferences";
import {
  desktopSupported,
  fireAggregateNotification,
  fireBlockedNotification,
  permissionState,
  requestPermission,
  type DesktopPermission,
} from "@/lib/notifications/desktop";

/**
 * Above this many simultaneous new blocks in one poll, fire a single aggregate
 * popup instead of one-per-session (anti-storm, e.g. a Watchtower reconnect
 * surfacing a batch of already-waiting sessions at once).
 */
const MAX_INDIVIDUAL_NOTIFICATIONS = 3;

/**
 * The bell is mounted app-wide, so its cadence sets the floor for background
 * polling on every page. It does not need the board's 2s freshness — a slower
 * interval keeps app-wide load (and daax's intermittent 429s) down. When the
 * board is also mounted, the shared source polls at the board's faster rate and
 * the bell simply rides those updates for free.
 */
const BELL_POLL_MS = 8000;

function keysEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const ak = Object.keys(a);
  if (ak.length !== Object.keys(b).length) return false;
  for (const k of ak) if (!(k in b)) return false;
  return true;
}

/** Shallow structural equality so we only re-render on real changes. */
function statesEqual(a: NotifyState, b: NotifyState): boolean {
  if (!keysEqual(a.waiting, b.waiting)) return false;
  if (!keysEqual(a.entries, b.entries)) return false;
  // Unchanged entries are carried forward by reference; changed ones (e.g.
  // acknowledged) get a new object, so reference identity is sufficient.
  for (const k in a.entries) if (a.entries[k] !== b.entries[k]) return false;
  return true;
}

export interface BlockedAgentsResult {
  /** Currently-blocked sessions (bell dropdown rows). */
  entries: NotifyEntry[];
  /** Unacknowledged count (bell badge). */
  count: number;
  /** Acknowledge every entry (call when the bell opens). */
  acknowledgeAll: () => void;
  /** Acknowledge one entry (call when a row is clicked / navigated to). */
  acknowledgeOne: (id: string) => void;
  /** User preference (localStorage). */
  desktopEnabled: boolean;
  /** Live browser permission state. */
  permission: DesktopPermission;
  /** Whether the browser exposes the Notification API at all. */
  supported: boolean;
  /**
   * Enable desktop notifications: requests permission if needed; only persists
   * the preference when permission is granted (default stays OFF otherwise).
   */
  enableDesktop: () => Promise<void>;
  /** Disable desktop notifications (keeps browser permission untouched). */
  disableDesktop: () => void;
}

export function useBlockedAgents(): BlockedAgentsResult {
  // Keep watching even when backgrounded — that is when a desktop alert matters.
  const { cards, conn, truncated } = useAttentionPoll(BELL_POLL_MS, {
    pauseWhenHidden: false,
  });

  const [state, setState] = useState<NotifyState>(initialState);
  const stateRef = useRef(state);
  stateRef.current = state;

  const desktopEnabled = useSyncExternalStore(
    subscribePref,
    getDesktopEnabled,
    getServerSnapshot,
  );
  const [permission, setPermission] = useState<DesktopPermission>("default");

  // Read the real permission on mount (post-hydration) to avoid SSR mismatch.
  useEffect(() => setPermission(permissionState()), []);

  // Fresh values read inside the reconcile effect without making it a dependency
  // (so toggling the preference never retro-fires for already-waiting sessions).
  const enabledRef = useRef(desktopEnabled);
  enabledRef.current = desktopEnabled;
  const permissionRef = useRef(permission);
  permissionRef.current = permission;

  // The first connected poll only PRIMES state: sessions already blocked when
  // the app loads populate the bell badge but must not fire desktop popups
  // (that would be noise on every page open / would storm on reconnect). Only
  // transitions observed AFTER priming fire browser notifications.
  const primedRef = useRef(false);

  useEffect(() => {
    // Ignore loading/disconnected polls: keep the last known state (a transient
    // Watchtower outage must not clear the bell or, on recovery, re-fire for
    // sessions that were already waiting before it dropped).
    if (conn !== "connected") return;

    const mapped: NotifyCard[] = cards.map((c) => ({
      id: c.id,
      label: c.label,
      status: c.status,
      since: c.since,
      cwd: c.cwd,
    }));
    const { state: next, toNotify } = reconcile(stateRef.current, mapped, {
      truncated,
    });

    const firstConnected = !primedRef.current;
    primedRef.current = true;

    const canFire =
      !firstConnected &&
      toNotify.length > 0 &&
      enabledRef.current &&
      permissionRef.current === "granted";
    if (canFire) {
      if (toNotify.length > MAX_INDIVIDUAL_NOTIFICATIONS) {
        fireAggregateNotification(toNotify.length);
      } else {
        for (const card of toNotify) fireBlockedNotification(card);
      }
    }

    if (!statesEqual(stateRef.current, next)) {
      stateRef.current = next;
      setState(next);
    }
  }, [cards, conn, truncated]);

  const ackAll = useCallback(() => {
    const next = acknowledgeAll(stateRef.current);
    if (!statesEqual(stateRef.current, next)) {
      stateRef.current = next;
      setState(next);
    }
  }, []);

  const ackOne = useCallback((id: string) => {
    const next = acknowledgeOne(stateRef.current, id);
    if (next !== stateRef.current) {
      stateRef.current = next;
      setState(next);
    }
  }, []);

  const enableDesktop = useCallback(async () => {
    const result = await requestPermission();
    setPermission(result);
    if (result === "granted") setDesktopEnabled(true);
  }, []);

  const disableDesktop = useCallback(() => setDesktopEnabled(false), []);

  return {
    entries: entryList(state),
    count: unacknowledgedCount(state),
    acknowledgeAll: ackAll,
    acknowledgeOne: ackOne,
    desktopEnabled,
    permission,
    supported: desktopSupported(),
    enableDesktop,
    disableDesktop,
  };
}
