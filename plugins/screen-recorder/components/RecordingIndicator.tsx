"use client";

/**
 * Recording Indicator Component
 *
 * Shows a small, non-intrusive indicator when recording is active.
 * Can be clicked to stop recording or access recordings panel.
 */

import { useState, useEffect } from "react";
import { Circle, Square, Pause, Play, Video } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { RecordingState, Recording } from "../types";

interface RecordingIndicatorProps {
  state: RecordingState;
  currentRecording: Recording | null;
  onStop: () => void;
  onPause: () => void;
  onResume: () => void;
  onOpenPanel: () => void;
  recordingCount: number;
}

// Format duration in mm:ss
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function RecordingIndicator({
  state,
  currentRecording,
  onStop,
  onPause,
  onResume,
  onOpenPanel,
  recordingCount,
}: RecordingIndicatorProps) {
  const [elapsed, setElapsed] = useState(0);

  // Update elapsed time every second while recording
  useEffect(() => {
    if (state !== "recording" || !currentRecording) {
      return;
    }

    const updateElapsed = () => {
      setElapsed(Date.now() - currentRecording.startTime);
    };

    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);

    return () => clearInterval(interval);
  }, [state, currentRecording]);

  const isActive = state === "recording" || state === "paused";

  return (
    <TooltipProvider>
      <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2">
        <AnimatePresence>
          {isActive && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8, x: 20 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.8, x: 20 }}
              className="flex items-center gap-2 bg-background/95 backdrop-blur border rounded-full px-3 py-1.5 shadow-lg"
            >
              {/* Recording dot */}
              <motion.div
                animate={{
                  opacity: state === "recording" ? [1, 0.3, 1] : 0.5,
                }}
                transition={{
                  duration: 1,
                  repeat: state === "recording" ? Infinity : 0,
                }}
              >
                <Circle
                  className={`h-3 w-3 fill-current ${
                    state === "recording" ? "text-red-500" : "text-yellow-500"
                  }`}
                />
              </motion.div>

              {/* Duration */}
              <span className="text-xs font-mono text-muted-foreground min-w-[40px]">
                {formatDuration(elapsed)}
              </span>

              {/* Pause/Resume button */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={state === "recording" ? onPause : onResume}
                  >
                    {state === "recording" ? (
                      <Pause className="h-3 w-3" />
                    ) : (
                      <Play className="h-3 w-3" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {state === "recording" ? "Pause" : "Resume"}
                </TooltipContent>
              </Tooltip>

              {/* Stop button */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-red-500 hover:text-red-600 hover:bg-red-500/10"
                    onClick={onStop}
                  >
                    <Square className="h-3 w-3 fill-current" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Stop Recording</TooltipContent>
              </Tooltip>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Recordings button (always visible when there are recordings) */}
        {(recordingCount > 0 || !isActive) && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 rounded-full shadow-lg"
                onClick={onOpenPanel}
              >
                <Video className="h-4 w-4" />
                {recordingCount > 0 && !isActive && (
                  <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[10px] rounded-full h-4 w-4 flex items-center justify-center">
                    {recordingCount > 9 ? "9+" : recordingCount}
                  </span>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {recordingCount > 0
                ? `View ${recordingCount} recording${recordingCount > 1 ? "s" : ""}`
                : "No recordings"}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
}
