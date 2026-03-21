/**
 * Terminal Recorder Plugin
 *
 * Records and plays back terminal sessions using asciinema v2 format.
 */

import { Terminal } from "lucide-react";
import type { Plugin } from "@/lib/plugins/types";

export const terminalRecorderPlugin: Plugin = {
  id: "terminal-recorder",
  name: "Terminal Recorder",
  description:
    "Record and playback terminal sessions for training and debugging",
  version: "1.0.0",
  author: "Daax",
  category: "tools",
  enabledByDefault: true,
  icon: Terminal,

  // Plugin lifecycle hooks
  onLoad: () => {
    console.log("[Terminal Recorder] Plugin loaded");
  },

  onEnable: () => {
    console.log("[Terminal Recorder] Plugin enabled");
  },

  onDisable: () => {
    console.log("[Terminal Recorder] Plugin disabled");
  },
};

// Re-export TerminalRecordingsPanel (safe - uses dynamic import internally for xterm)
export { TerminalRecordingsPanel } from "./components/TerminalRecordingsPanel";

// NOTE: TerminalPlayer must be imported with next/dynamic and ssr: false
// Do not add a direct export here - it will break SSR

// Re-export types
export type * from "./types";
