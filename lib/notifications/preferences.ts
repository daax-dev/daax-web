/**
 * Self-contained localStorage preference for desktop (browser) notifications
 * (issue #154).
 *
 * Deliberately NOT part of the shared settings store (lib/settings.ts) or the
 * settings page: that file is a hot, multi-branch surface. This is a tiny,
 * isolated boolean with a `useSyncExternalStore`-compatible subscription so the
 * bell's toggle stays local to the notification feature.
 *
 * Default is OFF — desktop notifications never fire until the user explicitly
 * enables them AND the browser has granted permission (enforced by the hook).
 */

const STORAGE_KEY = "daax.notifications.desktop";

type Listener = () => void;
const listeners = new Set<Listener>();

/** Reads the persisted preference; false when unset, unavailable, or corrupt. */
export function getDesktopEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/** SSR/first-paint snapshot for useSyncExternalStore — always the safe default. */
export function getServerSnapshot(): boolean {
  return false;
}

/** Persists the preference and notifies subscribers. No-op on the server. */
export function setDesktopEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    // Ignore quota / disabled-storage errors — the in-memory subscribers still
    // get notified so the current tab reflects the choice.
  }
  for (const l of listeners) l();
}

/**
 * Subscribes to preference changes (this tab and, via the `storage` event,
 * other tabs). Returns an unsubscribe. Shaped for useSyncExternalStore.
 */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) listener();
  };
  if (typeof window !== "undefined") {
    window.addEventListener("storage", onStorage);
  }
  return () => {
    listeners.delete(listener);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", onStorage);
    }
  };
}
