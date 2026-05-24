"use client";

import { useState, useEffect, useCallback } from "react";
import {
  MessageSquareText,
  ExternalLink,
  RefreshCw,
  Loader2,
  Calendar,
  Clock,
  FolderOpen,
  Search,
  Eye,
  GitBranch,
  X,
  Hash,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import type { TranscriptSession } from "@/app/api/transcripts/route";

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatTime(dateString: string): string {
  return new Date(dateString).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function TranscriptsPage() {
  const [transcripts, setTranscripts] = useState<TranscriptSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);

  const loadTranscripts = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/transcripts");
      const data = await response.json();
      setTranscripts(data.transcripts || []);
    } catch (error) {
      console.error("[Transcripts] Failed to load:", error);
      toast.error("Failed to load transcripts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTranscripts();
  }, [loadTranscripts]);

  const loadPreview = useCallback(async (id: string) => {
    try {
      const response = await fetch(`/api/transcripts/${id}`);
      const data = await response.json();
      setPreviewContent(JSON.stringify(data, null, 2));
    } catch (error) {
      console.error("[Transcripts] Failed to load preview:", error);
      setPreviewContent("Failed to load preview");
    }
  }, []);

  useEffect(() => {
    if (previewId) {
      loadPreview(previewId);
    } else {
      setPreviewContent(null);
    }
  }, [previewId, loadPreview]);

  const filteredTranscripts = transcripts.filter((t) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      t.projectName.toLowerCase().includes(query) ||
      t.summary.toLowerCase().includes(query) ||
      t.firstPrompt.toLowerCase().includes(query) ||
      t.gitBranch?.toLowerCase().includes(query) ||
      t.sessionId.toLowerCase().includes(query)
    );
  });

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-zinc-800">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <MessageSquareText className="h-5 w-5" />
            Transcripts
          </h1>
          <p className="text-sm text-muted-foreground">
            AI agent session history — Claude, Codex, and Copilot
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={loadTranscripts}
          disabled={loading}
        >
          <RefreshCw
            className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </div>

      {/* Search */}
      <div className="flex items-center gap-4 p-4 border-b border-zinc-800 bg-zinc-900/50">
        <div className="flex items-center gap-2 flex-1">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by project, summary, branch..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="max-w-md bg-zinc-900"
          />
        </div>
        <Badge variant="secondary">
          {filteredTranscripts.length} session
          {filteredTranscripts.length !== 1 ? "s" : ""}
        </Badge>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Transcripts List */}
        <ScrollArea className={cn("flex-1", previewId && "w-1/3 border-r border-zinc-800")}>
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredTranscripts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <FolderOpen className="h-12 w-12 mb-4 opacity-50" />
              <p className="text-lg font-medium">No sessions found</p>
              <p className="text-sm mt-1">
                {transcripts.length > 0
                  ? "Try adjusting your search"
                  : "No agent session data found (Claude ~/.claude, Codex ~/.codex, Copilot ~/.copilot)"}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-800">
              {filteredTranscripts.map((session) => (
                <div
                  key={session.id}
                  className={cn(
                    "group flex items-start gap-4 p-4 cursor-pointer hover:bg-zinc-800/50 transition-colors",
                    previewId === session.id && "bg-zinc-800/50",
                  )}
                  onClick={() =>
                    setPreviewId(previewId === session.id ? null : session.id)
                  }
                >
                  <div className="p-2 rounded-md bg-primary/10 mt-1">
                    <MessageSquareText className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="secondary" className="text-xs capitalize">
                        {session.tool}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {session.projectName}
                      </Badge>
                      {session.gitBranch && (
                        <Badge variant="secondary" className="text-xs gap-1">
                          <GitBranch className="h-3 w-3" />
                          {session.gitBranch}
                        </Badge>
                      )}
                    </div>
                    <p className="font-medium text-sm">
                      {session.summary || "No summary"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {session.firstPrompt}
                    </p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-2">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDate(session.modified)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatTime(session.modified)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Hash className="h-3 w-3" />
                        {session.messageCount} msgs
                      </span>
                      <span>{formatSize(session.size)}</span>
                    </div>
                  </div>
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
                            onClick={() =>
                              setPreviewId(
                                previewId === session.id ? null : session.id,
                              )
                            }
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Preview</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              window.open(
                                `/api/transcripts/${session.id}?format=raw`,
                                "_blank",
                              )
                            }
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Open raw JSONL</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Preview Panel */}
        {previewId && (
          <div className="flex-1 flex flex-col bg-zinc-950">
            <div className="flex items-center justify-between p-3 border-b border-zinc-800">
              <h3 className="font-medium text-sm">Preview</h3>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    window.open(
                      `/api/transcripts/${previewId}?format=raw`,
                      "_blank",
                    )
                  }
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Open raw
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setPreviewId(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <ScrollArea className="flex-1 p-4">
              <pre className="text-xs text-zinc-400 whitespace-pre-wrap font-mono">
                {previewContent || "Loading..."}
              </pre>
            </ScrollArea>
          </div>
        )}
      </div>
    </div>
  );
}
