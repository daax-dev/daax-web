/**
 * Presentation / mask mode global state (issue #155).
 *
 * A single app-wide boolean: when ON, the live terminal and recording playback
 * visually redact secrets so a session can be safely screen-shared. State is
 * persisted in localStorage so it survives navigation within the app and syncs
 * across tabs; no React context/provider is required, so consumers can opt in
 * anywhere without touching shared layout.
 */

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "daax-presentation-mode";

const listeners = new Set<() => void>();
let cache = false;
let initialized = false;

function emit(): void {
  for (const listener of listeners) listener();
}

/** Lazily hydrate from localStorage and wire cross-tab sync (client only). */
function ensureInit(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  try {
    cache = window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    cache = false;
  }
  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY) return;
    const next = event.newValue === "1";
    if (next !== cache) {
      cache = next;
      emit();
    }
  });
}

function subscribe(callback: () => void): () => void {
  ensureInit();
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function getSnapshot(): boolean {
  ensureInit();
  return cache;
}

function getServerSnapshot(): boolean {
  return false;
}

/** Imperative setter — usable outside React (e.g. inside terminal effects). */
export function setPresentationMode(enabled: boolean): void {
  ensureInit();
  if (cache === enabled) return;
  cache = enabled;
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    /* storage unavailable — in-memory value still drives this tab */
  }
  emit();
}

/** Imperative getter — current value without subscribing (for render-time reads
 *  inside non-React code such as WebSocket message handlers). */
export function getPresentationMode(): boolean {
  ensureInit();
  return cache;
}

/** Subscribe to changes outside React (returns an unsubscribe fn). */
export function subscribePresentationMode(callback: () => void): () => void {
  return subscribe(callback);
}

export interface PresentationModeState {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  toggle: () => void;
}

/** React hook: reactive presentation-mode state. */
export function usePresentationMode(): PresentationModeState {
  const enabled = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  return {
    enabled,
    setEnabled: setPresentationMode,
    toggle: () => setPresentationMode(!getPresentationMode()),
  };
}
