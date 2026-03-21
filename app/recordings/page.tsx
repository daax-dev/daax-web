"use client";

/**
 * Terminal Recordings Page
 *
 * Full-page view of all terminal recordings with filtering, search,
 * playback, and export capabilities.
 */

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
  Video,
  Trash2,
  Download,
  Loader2,
  Search,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  FileCode2,
  Upload,
  Settings,
  Filter,
  Calendar,
  Clock,
  Terminal,
  Check,
  GitPullRequest,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import type {
  TerminalRecording,
  TerminalRecordingData,
} from "@/plugins/terminal-recorder/types";
import { getSettings } from "@/lib/settings";

// Dynamic import for TerminalPlayer to avoid SSR issues with xterm.js
const TerminalPlayer = dynamic(
  () =>
    import("@/plugins/terminal-recorder/components/TerminalPlayer").then(
      (mod) => mod.TerminalPlayer,
    ),
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
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

/**
 * Format timestamp to human-readable date
 */
function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Format timestamp to human-readable time
 */
function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Get session type display name
 */
function getSessionTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    "ai-claude": "Claude Code",
    "ai-aider": "Aider",
    shell: "Shell",
  };
  return labels[type] || type;
}

/**
 * Get session type color
 */
function getSessionTypeColor(type: string): string {
  const colors: Record<string, string> = {
    "ai-claude": "bg-purple-500/10 text-purple-500 border-purple-500/20",
    "ai-aider": "bg-blue-500/10 text-blue-500 border-blue-500/20",
    shell: "bg-green-500/10 text-green-500 border-green-500/20",
  };
  return colors[type] || "bg-muted text-muted-foreground";
}

export default function RecordingsPage() {
  const router = useRouter();
  const [recordings, setRecordings] = useState<TerminalRecording[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loadingRecording, setLoadingRecording] = useState<string | null>(null);
  const [recordingData, setRecordingData] =
    useState<TerminalRecordingData | null>(null);
  const [publishing, setPublishing] = useState<string | null>(null);
  const [creatingPr, setCreatingPr] = useState<string | null>(null);

  // Load recordings
  const loadRecordings = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/terminal-recordings");
      const data = await response.json();
      setRecordings(data.recordings || []);
    } catch (error) {
      console.error("[Recordings] Failed to load:", error);
      toast.error("Failed to load recordings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRecordings();
  }, [loadRecordings]);

  // Filter recordings
  const filteredRecordings = recordings.filter((r) => {
    // Type filter
    if (typeFilter !== "all" && r.sessionType !== typeFilter) return false;

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        r.title?.toLowerCase().includes(query) ||
        r.command.toLowerCase().includes(query) ||
        r.id.toLowerCase().includes(query)
      );
    }

    return true;
  });

  // Get unique session types for filter
  const sessionTypes = [...new Set(recordings.map((r) => r.sessionType))];

  // Load recording for playback
  const playRecording = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      setRecordingData(null);
      return;
    }

    try {
      setLoadingRecording(id);
      const response = await fetch(`/api/terminal-recordings/${id}`);
      if (!response.ok) throw new Error("Failed to load recording");
      const data: TerminalRecordingData = await response.json();
      setRecordingData(data);
      setExpandedId(id);
    } catch (error) {
      console.error("[Recordings] Failed to load recording:", error);
      toast.error("Failed to load recording");
    } finally {
      setLoadingRecording(null);
    }
  };

  // Delete recording
  const deleteRecording = async (id: string) => {
    try {
      const response = await fetch(`/api/terminal-recordings/${id}`, {
        method: "DELETE",
      });
      if (response.ok) {
        setRecordings((prev) => prev.filter((r) => r.id !== id));
        if (expandedId === id) {
          setExpandedId(null);
          setRecordingData(null);
        }
        toast.success("Recording deleted");
      }
    } catch (error) {
      console.error("[Recordings] Failed to delete:", error);
      toast.error("Failed to delete recording");
    }
  };

  // Export as HTML download
  const exportHtml = async (id: string) => {
    try {
      const link = document.createElement("a");
      link.href = `/api/terminal-recordings/${id}/export`;
      link.download = "";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success("Download started");
    } catch (error) {
      console.error("[Recordings] Failed to export:", error);
      toast.error("Failed to export recording");
    }
  };

  // Export as .cast file
  const exportCast = async (id: string) => {
    try {
      const response = await fetch(`/api/terminal-recordings/${id}`);
      if (!response.ok) throw new Error("Failed to load recording");
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
      toast.success("Cast file downloaded");
    } catch (error) {
      console.error("[Recordings] Failed to export cast:", error);
      toast.error("Failed to export cast file");
    }
  };

  // Publish to project
  const publishToProject = async (id: string) => {
    try {
      setPublishing(id);
      const settings = getSettings();
      const response = await fetch(`/api/terminal-recordings/${id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exportPath: settings.recordingsExportPath }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to publish");
      }

      toast.success(`Published to ${data.files.html}`, {
        description: "Recording is ready to commit with your PR",
        action: {
          label: "View Files",
          onClick: () => {
            // Could open file explorer or terminal here
          },
        },
      });
    } catch (error) {
      console.error("[Recordings] Failed to publish:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to publish recording",
      );
    } finally {
      setPublishing(null);
    }
  };

  // Create PR with recording
  const createPullRequest = async (id: string) => {
    try {
      setCreatingPr(id);
      const settings = getSettings();
      const response = await fetch(`/api/terminal-recordings/${id}/create-pr`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exportPath: settings.recordingsExportPath,
          title: "Add AI session recording for audit",
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create PR");
      }

      toast.success(`PR #${data.pr.number} created!`, {
        description: data.pr.title,
        action: {
          label: "Open PR",
          onClick: () => window.open(data.pr.url, "_blank"),
        },
        duration: 10000,
      });
    } catch (error) {
      console.error("[Recordings] Failed to create PR:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to create PR",
      );
    } finally {
      setCreatingPr(null);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-3">
          <Video className="h-6 w-6 text-muted-foreground" />
          <div>
            <h1 className="text-xl font-semibold">Terminal Recordings</h1>
            <p className="text-sm text-muted-foreground">
              {recordings.length} recording{recordings.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push("/settings")}
          >
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={loadRecordings}
            disabled={loading}
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 p-4 border-b bg-muted/30">
        <div className="flex items-center gap-2 flex-1">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by title, command, or ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="max-w-md"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {sessionTypes.map((type) => (
                <SelectItem key={type} value={type}>
                  {getSessionTypeLabel(type)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Recordings List */}
      <ScrollArea className="flex-1">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredRecordings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Terminal className="h-12 w-12 mb-4 opacity-50" />
            <p className="text-lg font-medium">No recordings found</p>
            <p className="text-sm mt-1">
              {recordings.length > 0
                ? "Try adjusting your filters"
                : "Enable terminal recording in Settings to start capturing sessions"}
            </p>
            {recordings.length === 0 && (
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => router.push("/settings")}
              >
                Go to Settings
              </Button>
            )}
          </div>
        ) : (
          <div className="divide-y">
            {filteredRecordings.map((recording) => (
              <div key={recording.id} className="group">
                {/* Recording row */}
                <div
                  className={`flex items-center gap-4 p-4 cursor-pointer hover:bg-muted/50 transition-colors ${
                    expandedId === recording.id ? "bg-muted/50" : ""
                  }`}
                  onClick={() => playRecording(recording.id)}
                >
                  {/* Expand icon */}
                  <div className="w-5">
                    {loadingRecording === recording.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : expandedId === recording.id ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </div>

                  {/* Date/Time */}
                  <div className="w-32 flex-shrink-0">
                    <div className="flex items-center gap-1.5 text-sm">
                      <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                      {formatDate(recording.startTime)}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                      <Clock className="h-3 w-3" />
                      {formatTime(recording.startTime)}
                    </div>
                  </div>

                  {/* Session type badge */}
                  <div className="w-28 flex-shrink-0">
                    <Badge
                      variant="outline"
                      className={`${getSessionTypeColor(recording.sessionType)}`}
                    >
                      {getSessionTypeLabel(recording.sessionType)}
                    </Badge>
                  </div>

                  {/* Title/Command */}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">
                      {recording.title || recording.id}
                    </p>
                    <p className="text-xs text-muted-foreground font-mono truncate">
                      {recording.command}
                    </p>
                  </div>

                  {/* Duration */}
                  <div className="w-24 text-right flex-shrink-0">
                    <span
                      className={`text-sm ${
                        recording.endTime
                          ? "text-foreground"
                          : "text-yellow-500"
                      }`}
                    >
                      {formatDuration(recording.startTime, recording.endTime)}
                    </span>
                  </div>

                  {/* Status */}
                  <div className="w-8 flex-shrink-0">
                    {recording.endTime ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <div className="h-2 w-2 rounded-full bg-yellow-500 animate-pulse" />
                    )}
                  </div>

                  {/* Actions */}
                  <div
                    className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => exportHtml(recording.id)}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Download HTML</TooltipContent>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => exportCast(recording.id)}
                          >
                            <FileCode2 className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Download .cast</TooltipContent>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => publishToProject(recording.id)}
                            disabled={publishing === recording.id}
                          >
                            {publishing === recording.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Upload className="h-4 w-4" />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Export to Project</TooltipContent>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => createPullRequest(recording.id)}
                            disabled={creatingPr === recording.id}
                            className="text-primary"
                          >
                            {creatingPr === recording.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <GitPullRequest className="h-4 w-4" />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Create PR for Audit</TooltipContent>
                      </Tooltip>

                      <AlertDialog>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </AlertDialogTrigger>
                          </TooltipTrigger>
                          <TooltipContent>Delete</TooltipContent>
                        </Tooltip>
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
                    </TooltipProvider>
                  </div>
                </div>

                {/* Expanded player */}
                {expandedId === recording.id && recordingData && (
                  <div className="px-4 pb-4 bg-muted/30 border-t">
                    <div className="max-w-4xl mx-auto pt-4">
                      <TerminalPlayer
                        content={recordingData.content}
                        autoPlay
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
