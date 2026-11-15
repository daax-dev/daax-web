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
  /**
   * Owner key (subject, or "local" for the operator) — dx#119. Absent on
   * recordings made before multi-tenancy; those are visible to admins only.
   */
  owner?: string;
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
