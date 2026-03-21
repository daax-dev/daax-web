/**
 * Screen Recorder Plugin Types
 */

import type { eventWithTime } from "@rrweb/types";

/**
 * A recording session
 */
export interface Recording {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** Recording start timestamp */
  startTime: number;
  /** Recording end timestamp */
  endTime: number;
  /** Duration in milliseconds */
  duration: number;
  /** Number of events */
  eventCount: number;
  /** Created date */
  createdAt: Date;
  /** Page URL where recording was made */
  url: string;
}

/**
 * Full recording data including events
 */
export interface RecordingData extends Recording {
  /** rrweb events */
  events: eventWithTime[];
}

/**
 * Recording state
 */
export type RecordingState = "idle" | "recording" | "paused";

/**
 * Recording context for hooks
 */
export interface RecordingContext {
  state: RecordingState;
  currentRecording: Recording | null;
  recordings: Recording[];
  startRecording: () => void;
  stopRecording: () => Promise<Recording | null>;
  pauseRecording: () => void;
  resumeRecording: () => void;
  deleteRecording: (id: string) => Promise<void>;
  getRecordingData: (id: string) => Promise<RecordingData | null>;
  exportRecording: (id: string) => Promise<void>;
}

/**
 * Storage interface
 */
export interface RecordingStorage {
  saveRecording: (recording: RecordingData) => Promise<void>;
  getRecording: (id: string) => Promise<RecordingData | null>;
  getAllRecordings: () => Promise<Recording[]>;
  deleteRecording: (id: string) => Promise<void>;
  clearAllRecordings: () => Promise<void>;
}
