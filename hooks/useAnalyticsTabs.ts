"use client";

import { useMemo, useSyncExternalStore } from "react";
import { FileJson, Video, MessageSquareText } from "lucide-react";
import {
  isSubFeatureVisible,
  getSettings,
  subscribeToSettings,
} from "@/lib/settings";
import type { DaaxSettings } from "@/lib/settings";
import type { LucideIcon } from "lucide-react";

export interface AnalyticsTab {
  href: string;
  label: string;
  icon: LucideIcon;
  subFeatureId: string;
}

// Static tabs configuration - defined once, never recreated
const ANALYTICS_TABS_CONFIG: AnalyticsTab[] = [
  {
    href: "/analytics",
    label: "Recordings",
    icon: Video,
    subFeatureId: "recordings",
  },
  {
    href: "/analytics/transcripts",
    label: "Transcripts",
    icon: MessageSquareText,
    subFeatureId: "transcripts",
  },
  {
    href: "/analytics/logs",
    label: "Logs",
    icon: FileJson,
    subFeatureId: "logs",
  },
];

// Empty array for SSR - stable reference
const EMPTY_TABS: AnalyticsTab[] = [];

// External store backed by the settings module so the hook re-renders when
// settings change (e.g. a sub-feature is toggled). getSnapshot must return a
// stable reference between updates, so the snapshot is cached and only replaced
// when subscribeToSettings notifies with a fresh settings object.
let settingsSnapshot: DaaxSettings | null = null;
const storeListeners = new Set<() => void>();
let unsubscribeFromSettings: (() => void) | null = null;

const settingsStore = {
  subscribe: (callback: () => void) => {
    if (storeListeners.size === 0) {
      // Lazily attach a single settings subscription shared by all consumers.
      unsubscribeFromSettings = subscribeToSettings((updated) => {
        settingsSnapshot = updated;
        storeListeners.forEach((listener) => listener());
      });
    }
    storeListeners.add(callback);
    return () => {
      storeListeners.delete(callback);
      if (storeListeners.size === 0 && unsubscribeFromSettings) {
        unsubscribeFromSettings();
        unsubscribeFromSettings = null;
        // Drop the cached snapshot once there are no subscribers. While
        // unsubscribed no notification refreshes it, so a settings change made
        // in the meantime would otherwise be missed; clearing it forces
        // getSnapshot() to re-seed from getSettings() on the next mount. This
        // only fires at zero subscribers, so the stable-reference contract
        // during an active subscription is unaffected.
        settingsSnapshot = null;
      }
    };
  },
  // Client snapshot: seed from getSettings() once, then reuse the cached
  // reference so React does not see a spurious change on every render.
  getSnapshot: (): DaaxSettings | null => {
    if (settingsSnapshot === null) {
      settingsSnapshot = getSettings();
    }
    return settingsSnapshot;
  },
  // Server snapshot: null → empty tabs, avoiding hydration mismatch.
  getServerSnapshot: (): DaaxSettings | null => null,
};

/**
 * Hook to get analytics tabs filtered by settings-based visibility.
 * Subscribes to settings changes so the tab list stays current when a
 * sub-feature's visibility is toggled.
 *
 * @returns Array of visible analytics tabs, or empty array during SSR
 */
export function useAnalyticsTabs(): AnalyticsTab[] {
  // SSR-safe + reactive: null during SSR/initial hydration, then the live
  // settings object, and re-renders whenever settings are saved.
  const settings = useSyncExternalStore(
    settingsStore.subscribe,
    settingsStore.getSnapshot,
    settingsStore.getServerSnapshot,
  );

  // Memoize the filtered tabs to prevent array reference changes
  const tabs = useMemo(() => {
    if (!settings) {
      // Return empty array during SSR to avoid hydration mismatch
      return EMPTY_TABS;
    }

    return ANALYTICS_TABS_CONFIG.filter((tab) =>
      isSubFeatureVisible("analytics", tab.subFeatureId, settings),
    );
  }, [settings]);

  return tabs;
}
