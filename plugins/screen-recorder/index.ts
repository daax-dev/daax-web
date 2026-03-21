/**
 * Screen Recorder Plugin
 *
 * Records user sessions using rrweb for playback and analysis.
 * Can be toggled on/off in settings.
 */

import { Video } from "lucide-react";
import type { Plugin } from "@/lib/plugins";

export const screenRecorderPlugin: Plugin = {
  // Manifest
  id: "screen-recorder",
  name: "Screen Recorder",
  description: "Record browser sessions for playback using rrweb",
  version: "1.0.0",
  author: "Daax",
  category: "tools",
  enabledByDefault: true, // Plugin is enabled, but recording requires settings toggle
  icon: Video,

  // Lifecycle hooks
  onLoad: async () => {
    console.log("[Screen Recorder] Plugin loaded");
  },

  onEnable: async () => {
    console.log("[Screen Recorder] Plugin enabled");
  },

  onDisable: async () => {
    console.log("[Screen Recorder] Plugin disabled");
  },
};

// Re-export components for use in the app
export { ScreenRecorderProvider } from "./components/ScreenRecorderProvider";
export { RecordingIndicator } from "./components/RecordingIndicator";
export { RecordingsPanel } from "./components/RecordingsPanel";
export { RecordingPlayer } from "./components/RecordingPlayer";
export { useRecorder } from "./hooks/use-recorder";
export * from "./types";
