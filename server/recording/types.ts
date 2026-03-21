/**
 * Recording Types
 *
 * Type definitions for terminal session recording.
 */

/**
 * Metadata for a recording session
 */
export interface RecordingMetadata {
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
 * Internal state for an active recording
 */
export interface ActiveRecordingState {
  metadata: RecordingMetadata;
  filePath: string;
  startTime: number;
  buffer: string[];
  lastFlush: number;
  clientSessionId?: string; // Track client-provided session ID for deduplication
}
