"use client";

/**
 * Recordings Panel Component
 *
 * Displays a list of recordings with playback, delete, and export options.
 * Opens as a slide-over panel from the right side.
 */

import { useState, useCallback } from "react";
import {
  Video,
  Play,
  Trash2,
  Download,
  X,
  Clock,
  Link2,
  ChevronLeft,
  Loader2,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Recording, RecordingData } from "../types";
import { RecordingPlayer } from "./RecordingPlayer";

interface RecordingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  recordings: Recording[];
  onDelete: (id: string) => Promise<void>;
  onExport: (id: string) => Promise<void>;
  onGetRecordingData: (id: string) => Promise<RecordingData | null>;
}

// Format duration in human-readable format
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins < 60) return `${mins}m ${secs}s`;
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  return `${hours}h ${remainingMins}m`;
}

// Format relative time
function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - new Date(date).getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(date).toLocaleDateString();
}

export function RecordingsPanel({
  isOpen,
  onClose,
  recordings,
  onDelete,
  onExport,
  onGetRecordingData,
}: RecordingsPanelProps) {
  const [selectedRecording, setSelectedRecording] =
    useState<RecordingData | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const handlePlay = useCallback(
    async (id: string) => {
      setLoadingId(id);
      const data = await onGetRecordingData(id);
      setLoadingId(null);
      if (data) {
        setSelectedRecording(data);
      }
    },
    [onGetRecordingData],
  );

  const handleBack = useCallback(() => {
    setSelectedRecording(null);
  }, []);

  const handleDelete = useCallback(async () => {
    if (!deleteId) return;
    await onDelete(deleteId);
    setDeleteId(null);
    // If we're viewing this recording, go back
    if (selectedRecording?.id === deleteId) {
      setSelectedRecording(null);
    }
  }, [deleteId, onDelete, selectedRecording]);

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50"
              onClick={onClose}
            />

            {/* Panel */}
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="fixed right-0 top-0 h-full w-full max-w-lg bg-background border-l shadow-xl z-50 flex flex-col"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b">
                <div className="flex items-center gap-2">
                  {selectedRecording ? (
                    <>
                      <Button variant="ghost" size="icon" onClick={handleBack}>
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <h2 className="font-semibold truncate max-w-[200px]">
                        {selectedRecording.name}
                      </h2>
                    </>
                  ) : (
                    <>
                      <Video className="h-5 w-5" />
                      <h2 className="font-semibold">Recordings</h2>
                      <span className="text-xs text-muted-foreground">
                        ({recordings.length})
                      </span>
                    </>
                  )}
                </div>
                <Button variant="ghost" size="icon" onClick={onClose}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Content */}
              {selectedRecording ? (
                /* Player view */
                <div className="flex-1 flex flex-col p-4 gap-4 overflow-auto">
                  <RecordingPlayer recording={selectedRecording} autoPlay />

                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      <span>{formatDuration(selectedRecording.duration)}</span>
                      <span className="mx-1">·</span>
                      <span>{selectedRecording.eventCount} events</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Link2 className="h-4 w-4" />
                      <span className="truncate">{selectedRecording.url}</span>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onExport(selectedRecording.id)}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Export JSON
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-red-500 hover:text-red-600"
                      onClick={() => setDeleteId(selectedRecording.id)}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </Button>
                  </div>
                </div>
              ) : (
                /* Recordings list */
                <ScrollArea className="flex-1">
                  {recordings.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                      <Video className="h-12 w-12 mb-4 opacity-50" />
                      <p>No recordings yet</p>
                      <p className="text-xs mt-1">
                        Enable recording in Settings to start
                      </p>
                    </div>
                  ) : (
                    <div className="p-4 space-y-2">
                      {recordings.map((recording) => (
                        <div
                          key={recording.id}
                          className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors group"
                        >
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-10 w-10 shrink-0"
                            onClick={() => handlePlay(recording.id)}
                            disabled={loadingId === recording.id}
                          >
                            {loadingId === recording.id ? (
                              <Loader2 className="h-5 w-5 animate-spin" />
                            ) : (
                              <Play className="h-5 w-5" />
                            )}
                          </Button>

                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">
                              {recording.name}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>{formatDuration(recording.duration)}</span>
                              <span>·</span>
                              <span>
                                {formatRelativeTime(recording.createdAt)}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => onExport(recording.id)}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-red-500 hover:text-red-600"
                              onClick={() => setDeleteId(recording.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Recording?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the recording. This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-500 hover:bg-red-600"
              onClick={handleDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
