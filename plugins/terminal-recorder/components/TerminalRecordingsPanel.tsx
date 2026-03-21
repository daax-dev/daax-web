"use client";

/**
 * Terminal Recordings Panel
 *
 * Lists and plays terminal recordings.
 */

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import {
  Video,
  Play,
  Trash2,
  Download,
  Loader2,
  X,
  Terminal,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { TerminalRecording, TerminalRecordingData } from "../types";

// Dynamic import for TerminalPlayer to avoid SSR issues with xterm.js
const TerminalPlayer = dynamic(
  () => import("./TerminalPlayer").then((mod) => mod.TerminalPlayer),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        Loading player...
      </div>
    ),
  },
);

/**
 * Format duration in ms to human-readable string
 */
function formatDuration(startTime: number, endTime?: number): string {
  if (!endTime) return "In progress...";
  const duration = endTime - startTime;
  const seconds = Math.floor(duration / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  return `${seconds}s`;
}

/**
 * Format timestamp to human-readable string
 */
function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function TerminalRecordingsPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [recordings, setRecordings] = useState<TerminalRecording[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRecording, setSelectedRecording] =
    useState<TerminalRecordingData | null>(null);
  const [loadingRecording, setLoadingRecording] = useState<string | null>(null);

  // Load recordings
  const loadRecordings = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/terminal-recordings");
      const data = await response.json();
      setRecordings(data.recordings || []);
    } catch (error) {
      console.error("[Terminal Recordings] Failed to load recordings:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load recordings when sheet opens
  useEffect(() => {
    if (isOpen) {
      loadRecordings();
    }
  }, [isOpen, loadRecordings]);

  // Load a specific recording for playback
  const playRecording = async (id: string) => {
    try {
      setLoadingRecording(id);
      const response = await fetch(`/api/terminal-recordings/${id}`);
      if (!response.ok) {
        throw new Error("Failed to load recording");
      }
      const data: TerminalRecordingData = await response.json();
      setSelectedRecording(data);
    } catch (error) {
      console.error("[Terminal Recordings] Failed to load recording:", error);
    } finally {
      setLoadingRecording(null);
    }
  };

  // Delete a recording
  const deleteRecording = async (id: string) => {
    try {
      const response = await fetch(`/api/terminal-recordings/${id}`, {
        method: "DELETE",
      });
      if (response.ok) {
        setRecordings((prev) => prev.filter((r) => r.id !== id));
        if (selectedRecording?.metadata.id === id) {
          setSelectedRecording(null);
        }
      }
    } catch (error) {
      console.error("[Terminal Recordings] Failed to delete recording:", error);
    }
  };

  // Export recording as cast file
  const exportRecording = async (id: string) => {
    try {
      const response = await fetch(`/api/terminal-recordings/${id}`);
      if (!response.ok) {
        throw new Error("Failed to load recording");
      }
      const data: TerminalRecordingData = await response.json();

      const blob = new Blob([data.content], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${data.metadata.title || data.metadata.id}.cast`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("[Terminal Recordings] Failed to export recording:", error);
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Terminal className="h-4 w-4" />
          Terminal Recordings
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="w-[600px] sm:w-[700px] sm:max-w-none"
      >
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Video className="h-5 w-5" />
            Terminal Recordings
          </SheetTitle>
          <SheetDescription>
            View and playback recorded terminal sessions
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 flex flex-col gap-4 h-[calc(100vh-120px)]">
          {/* Player area */}
          {selectedRecording && (
            <div className="border rounded-lg p-4 bg-card">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-medium">
                    {selectedRecording.metadata.title || "Recording"}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {selectedRecording.metadata.sessionType} •{" "}
                    {formatTime(selectedRecording.metadata.startTime)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSelectedRecording(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <TerminalPlayer content={selectedRecording.content} autoPlay />
            </div>
          )}

          {/* Recordings list */}
          <div className="flex-1 overflow-hidden">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium">
                Recordings ({recordings.length})
              </h4>
              <Button
                variant="ghost"
                size="icon"
                onClick={loadRecordings}
                disabled={loading}
                title="Refresh"
                className="h-6 w-6"
              >
                <RefreshCw
                  className={`h-3 w-3 ${loading ? "animate-spin" : ""}`}
                />
              </Button>
            </div>
            <ScrollArea className="h-full">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : recordings.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Terminal className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No terminal recordings yet</p>
                  <p className="text-xs mt-1">
                    Enable terminal recording when starting a session
                  </p>
                </div>
              ) : (
                <div className="space-y-2 pr-4">
                  {recordings.map((recording) => (
                    <div
                      key={recording.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                        selectedRecording?.metadata.id === recording.id
                          ? "border-primary bg-primary/5"
                          : "hover:bg-muted/50"
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">
                          {recording.title || recording.id}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {recording.sessionType} •{" "}
                          {formatTime(recording.startTime)} •{" "}
                          {formatDuration(
                            recording.startTime,
                            recording.endTime,
                          )}
                        </p>
                      </div>

                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => playRecording(recording.id)}
                          disabled={loadingRecording === recording.id}
                          title="Play"
                        >
                          {loadingRecording === recording.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Play className="h-4 w-4" />
                          )}
                        </Button>

                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => exportRecording(recording.id)}
                          title="Export as .cast file"
                        >
                          <Download className="h-4 w-4" />
                        </Button>

                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" title="Delete">
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                Delete Recording?
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently delete the recording. This
                                action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteRecording(recording.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
