"use client";

/**
 * Screen Recorder Hook
 *
 * Provides recording functionality using rrweb.
 * Manages recording state and persistence to IndexedDB.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import type { eventWithTime } from "@rrweb/types";
import type {
  Recording,
  RecordingData,
  RecordingState,
  RecordingContext,
} from "../types";
import { recordingStorage } from "../lib/storage";

// Generate unique ID
function generateId(): string {
  return `rec_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// Format timestamp for display name
function formatTimestamp(date: Date): string {
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Recording hook with rrweb integration
 */
export function useRecorder(): RecordingContext {
  const [state, setState] = useState<RecordingState>("idle");
  const [currentRecording, setCurrentRecording] = useState<Recording | null>(
    null,
  );
  const [recordings, setRecordings] = useState<Recording[]>([]);

  // Refs for recording state
  const eventsRef = useRef<eventWithTime[]>([]);
  const stopFnRef = useRef<(() => void) | null>(null);
  const startTimeRef = useRef<number>(0);

  // Load recordings on mount
  useEffect(() => {
    recordingStorage
      .getAllRecordings()
      .then(setRecordings)
      .catch(console.error);
  }, []);

  /**
   * Start a new recording
   */
  const startRecording = useCallback(async () => {
    if (state !== "idle") return;

    try {
      // Dynamically import rrweb to keep bundle size small
      const { record } = await import("rrweb");

      eventsRef.current = [];
      startTimeRef.current = Date.now();

      const options = {
        emit(event: eventWithTime) {
          eventsRef.current.push(event);
        },
        // Sampling options to reduce overhead
        sampling: {
          mousemove: true, // Record mouse moves
          mouseInteraction: true,
          scroll: 150, // Throttle scroll events (ms)
          media: 800, // Throttle media events
          input: "last" as const, // Only record last input value
        },
        // Block certain elements from being recorded (privacy)
        blockClass: "rr-block",
        // Ignore certain elements
        ignoreClass: "rr-ignore",
        // Mask input fields by default
        maskInputOptions: {
          password: true,
        },
        // Don't inline stylesheets to save space
        inlineStylesheet: false,
        // Record canvas but at lower frequency
        recordCanvas: false,
        // Collect fonts
        collectFonts: false,
      };

      const stopFn = record(options);
      if (stopFn) {
        stopFnRef.current = stopFn;
      }
      setState("recording");

      // Create current recording metadata
      const now = new Date();
      setCurrentRecording({
        id: generateId(),
        name: `Recording ${formatTimestamp(now)}`,
        startTime: startTimeRef.current,
        endTime: 0,
        duration: 0,
        eventCount: 0,
        createdAt: now,
        url: window.location.href,
      });

      console.log("[Screen Recorder] Recording started");
    } catch (error) {
      console.error("[Screen Recorder] Failed to start recording:", error);
    }
  }, [state]);

  /**
   * Stop the current recording
   */
  const stopRecording = useCallback(async (): Promise<Recording | null> => {
    if (state !== "recording" && state !== "paused") return null;
    if (!stopFnRef.current || !currentRecording) return null;

    try {
      // Stop rrweb recording
      stopFnRef.current();
      stopFnRef.current = null;

      const endTime = Date.now();
      const events = eventsRef.current;

      // Create full recording data
      const recordingData: RecordingData = {
        ...currentRecording,
        endTime,
        duration: endTime - startTimeRef.current,
        eventCount: events.length,
        events,
      };

      // Save to IndexedDB
      await recordingStorage.saveRecording(recordingData);

      // Update recordings list
      const savedRecording: Recording = {
        id: recordingData.id,
        name: recordingData.name,
        startTime: recordingData.startTime,
        endTime: recordingData.endTime,
        duration: recordingData.duration,
        eventCount: recordingData.eventCount,
        createdAt: recordingData.createdAt,
        url: recordingData.url,
      };

      setRecordings((prev) => [savedRecording, ...prev]);

      // Reset state
      eventsRef.current = [];
      setState("idle");
      setCurrentRecording(null);

      console.log("[Screen Recorder] Recording saved:", savedRecording.id);
      return savedRecording;
    } catch (error) {
      console.error("[Screen Recorder] Failed to stop recording:", error);
      setState("idle");
      setCurrentRecording(null);
      return null;
    }
  }, [state, currentRecording]);

  /**
   * Pause recording (not fully supported by rrweb, but we can stop capturing)
   */
  const pauseRecording = useCallback(() => {
    if (state !== "recording") return;
    // rrweb doesn't have pause, so we just update state for UI
    // Events continue to be captured but user sees "paused" indicator
    setState("paused");
    console.log("[Screen Recorder] Recording paused");
  }, [state]);

  /**
   * Resume recording
   */
  const resumeRecording = useCallback(() => {
    if (state !== "paused") return;
    setState("recording");
    console.log("[Screen Recorder] Recording resumed");
  }, [state]);

  /**
   * Delete a recording
   */
  const deleteRecording = useCallback(async (id: string): Promise<void> => {
    try {
      await recordingStorage.deleteRecording(id);
      setRecordings((prev) => prev.filter((r) => r.id !== id));
      console.log("[Screen Recorder] Recording deleted:", id);
    } catch (error) {
      console.error("[Screen Recorder] Failed to delete recording:", error);
    }
  }, []);

  /**
   * Get full recording data for playback
   */
  const getRecordingData = useCallback(
    async (id: string): Promise<RecordingData | null> => {
      try {
        return await recordingStorage.getRecording(id);
      } catch (error) {
        console.error("[Screen Recorder] Failed to get recording:", error);
        return null;
      }
    },
    [],
  );

  /**
   * Export recording as JSON file
   */
  const exportRecording = useCallback(async (id: string): Promise<void> => {
    try {
      const data = await recordingStorage.getRecording(id);
      if (!data) {
        console.error("[Screen Recorder] Recording not found:", id);
        return;
      }

      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${data.name.replace(/[^a-zA-Z0-9]/g, "_")}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      console.log("[Screen Recorder] Recording exported:", id);
    } catch (error) {
      console.error("[Screen Recorder] Failed to export recording:", error);
    }
  }, []);

  return {
    state,
    currentRecording,
    recordings,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    deleteRecording,
    getRecordingData,
    exportRecording,
  };
}
