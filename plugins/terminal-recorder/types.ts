/**
 * Terminal Recorder Plugin Types
 */

/**
 * Terminal recording metadata (from terminal-server)
 */
export interface TerminalRecording {
  id: string;
  sessionId: string;
  sessionType: string;
  command: string;
  startTime: number;
  endTime?: number;
  cols: number;
  rows: number;
  title?: string;
}

/**
 * Terminal recording with cast content
 */
export interface TerminalRecordingData {
  metadata: TerminalRecording;
  content: string; // asciinema v2 cast file content
}

/**
 * Asciinema v2 header
 */
export interface AsciinemaHeader {
  version: number;
  width: number;
  height: number;
  timestamp?: number;
  duration?: number;
  idle_time_limit?: number;
  command?: string;
  title?: string;
  env?: Record<string, string>;
}

/**
 * Asciinema v2 event
 * [time, type, data]
 * type: "o" = output, "i" = input
 */
export type AsciinemaEvent = [number, "o" | "i", string];

/**
 * Parsed asciinema recording
 */
export interface ParsedAsciinema {
  header: AsciinemaHeader;
  events: AsciinemaEvent[];
}
