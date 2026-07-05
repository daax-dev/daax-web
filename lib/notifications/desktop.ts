/**
 * Thin, guarded wrapper over the browser Notification API (issue #154).
 *
 * Isolated from React so it can be unit-tested with a mocked global
 * `Notification`, and so every call site is null-safe on runtimes/tabs where
 * the API is missing (SSR, older browsers, insecure contexts). No state — the
 * dedup/transition logic lives in lib/attention/notifications.ts.
 */

import type { NotifyCard } from "@/lib/attention/notifications";

export type DesktopPermission = "granted" | "denied" | "default" | "unsupported";

/** True when the Notification API is usable in this environment. */
export function desktopSupported(): boolean {
  return typeof window !== "undefined" && typeof Notification !== "undefined";
}

/** Current permission, or "unsupported" when the API is unavailable. */
export function permissionState(): DesktopPermission {
  if (!desktopSupported()) return "unsupported";
  return Notification.permission as DesktopPermission;
}

/**
 * Requests notification permission. Resolves with the resulting state (or
 * "unsupported"). Tolerates both the promise and legacy callback signatures.
 */
export async function requestPermission(): Promise<DesktopPermission> {
  if (!desktopSupported()) return "unsupported";
  try {
    const result = await Notification.requestPermission();
    return result as DesktopPermission;
  } catch {
    return permissionState();
  }
}

/**
 * Fires one browser Notification for a newly-blocked session. Returns true if a
 * notification was actually posted.
 *
 * `tag` is set to the session id so the OS coalesces/replaces per session — a
 * second-layer defence against duplicates on top of the pure engine's edge
 * detection. Firing is fully guarded: unsupported API or non-granted permission
 * is a silent no-op (the caller decides policy; this never throws).
 */
export function fireBlockedNotification(card: NotifyCard): boolean {
  if (!desktopSupported() || Notification.permission !== "granted") return false;
  const label = card.label || card.id.slice(0, 8);
  try {
    new Notification("Agent waiting for input", {
      body: card.cwd ? `${label} — ${card.cwd}` : label,
      tag: `daax-waiting-${card.id}`,
      // Re-fire audibly/visibly even if a stale notification with the same tag
      // lingers from a previous blocked episode of this session.
      renotify: true,
    } as NotificationOptions);
    return true;
  } catch {
    return false;
  }
}

/**
 * Fires a single summary Notification when many sessions block at once, instead
 * of one popup per session. Prevents a notification storm (e.g. Watchtower
 * reconnecting and surfacing a batch of already-blocked sessions). Same guards
 * as fireBlockedNotification.
 */
export function fireAggregateNotification(count: number): boolean {
  if (!desktopSupported() || Notification.permission !== "granted") return false;
  try {
    new Notification(`${count} agents waiting for input`, {
      body: "Open daax to review the blocked sessions.",
      tag: "daax-waiting-aggregate",
      renotify: true,
    } as NotificationOptions);
    return true;
  } catch {
    return false;
  }
}
