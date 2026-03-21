"use client";

import { useMemo, useSyncExternalStore } from "react";
import { FileJson, Video, MessageSquareText } from "lucide-react";
import { isSubFeatureVisible, getSettings } from "@/lib/settings";
import type { LucideIcon } from "lucide-react";

export interface AnalyticsTab {
  href: string;
  label: string;
  icon: LucideIcon;
  subFeatureId: string;
}

// Static tabs configuration - defined once, never recreated
const ANALYTICS_TABS_CONFIG: AnalyticsTab[] = [
  { href: "/analytics", label: "Recordings", icon: Video, subFeatureId: "recordings" },
  { href: "/analytics/transcripts", label: "Transcripts", icon: MessageSquareText, subFeatureId: "transcripts" },
  { href: "/analytics/logs", label: "Logs", icon: FileJson, subFeatureId: "logs" },
];

// Empty array for SSR - stable reference
const EMPTY_TABS: AnalyticsTab[] = [];

// Simple store for tracking client-side hydration
const clientStore = {
  subscribe: (_: () => void) => () => {},
  getSnapshot: () => true,
  getServerSnapshot: () => false,
};

/**
 * Hook to get analytics tabs filtered by settings-based visibility.
 * Memoized to prevent unnecessary re-renders.
 *
 * @returns Array of visible analytics tabs, or empty array during SSR
 */
export function useAnalyticsTabs(): AnalyticsTab[] {
  // Use useSyncExternalStore for SSR-safe hydration detection
  const isClient = useSyncExternalStore(
    clientStore.subscribe,
    clientStore.getSnapshot,
    clientStore.getServerSnapshot
  );

  // Memoize the filtered tabs to prevent array reference changes
  const tabs = useMemo(() => {
    if (!isClient) {
      // Return empty array during SSR to avoid hydration mismatch
      return EMPTY_TABS;
    }

    const settings = getSettings();
    return ANALYTICS_TABS_CONFIG.filter(tab =>
      isSubFeatureVisible("analytics", tab.subFeatureId, settings)
    );
  }, [isClient]);

  return tabs;
}
