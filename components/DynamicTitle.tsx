"use client";

import { useEffect } from "react";
import {
  getSettings,
  subscribeToSettings,
  DEFAULT_BRANDING,
  type DaaxSettings,
} from "@/lib/settings";

export function DynamicTitle() {
  useEffect(() => {
    // Set initial title
    const settings = getSettings();
    const appName = settings?.branding?.appName || DEFAULT_BRANDING.appName;
    document.title = appName;

    // Subscribe to settings changes
    const unsubscribe = subscribeToSettings((updatedSettings: DaaxSettings) => {
      const newAppName =
        updatedSettings?.branding?.appName || DEFAULT_BRANDING.appName;
      document.title = newAppName;
    });

    return unsubscribe;
  }, []);

  // This component only manages the title, renders nothing
  return null;
}
