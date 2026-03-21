"use client";

/**
 * Screen Recorder Provider Component
 *
 * Provides screen recording functionality throughout the app.
 * Renders the recording indicator and recordings panel.
 */

import { useState, useEffect } from "react";
import { getSettings } from "@/lib/settings";
import { useRecorder } from "../hooks/use-recorder";
import { RecordingIndicator } from "./RecordingIndicator";
import { RecordingsPanel } from "./RecordingsPanel";

export function ScreenRecorderProvider() {
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [isEnabled, setIsEnabled] = useState(false);

  const {
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
  } = useRecorder();

  // Check if screen recording is enabled in settings
  useEffect(() => {
    const checkEnabled = () => {
      const settings = getSettings();
      setIsEnabled(settings.screenRecordingEnabled);
    };

    checkEnabled();

    // Listen for storage changes (settings updates)
    const handleStorage = (e: StorageEvent) => {
      if (e.key === "daax-settings") {
        checkEnabled();
      }
    };

    window.addEventListener("storage", handleStorage);

    // Also check periodically in case settings changed in same tab
    const interval = setInterval(checkEnabled, 2000);

    return () => {
      window.removeEventListener("storage", handleStorage);
      clearInterval(interval);
    };
  }, []);

  // Auto-start recording when enabled
  useEffect(() => {
    if (isEnabled && state === "idle") {
      // Small delay to ensure everything is loaded
      const timer = setTimeout(startRecording, 500);
      return () => clearTimeout(timer);
    }
  }, [isEnabled, state, startRecording]);

  // Auto-stop recording when disabled
  useEffect(() => {
    if (!isEnabled && (state === "recording" || state === "paused")) {
      stopRecording();
    }
  }, [isEnabled, state, stopRecording]);

  const handleStop = async () => {
    await stopRecording();
  };

  // Don't render anything if not enabled and no recordings
  if (!isEnabled && recordings.length === 0 && state === "idle") {
    return null;
  }

  return (
    <>
      <RecordingIndicator
        state={state}
        currentRecording={currentRecording}
        onStop={handleStop}
        onPause={pauseRecording}
        onResume={resumeRecording}
        onOpenPanel={() => setIsPanelOpen(true)}
        recordingCount={recordings.length}
      />

      <RecordingsPanel
        isOpen={isPanelOpen}
        onClose={() => setIsPanelOpen(false)}
        recordings={recordings}
        onDelete={deleteRecording}
        onExport={exportRecording}
        onGetRecordingData={getRecordingData}
      />
    </>
  );
}
