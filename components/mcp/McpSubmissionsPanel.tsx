"use client";

import { useState } from "react";
import { Check, X, Clock, Loader2, User, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useMcpSubmissions, reviewSubmission } from "@/hooks/use-mcp";
import type { McpSubmission } from "@/lib/mcp-registry";
import { cn } from "@/lib/utils";

interface McpSubmissionsPanelProps {
  onApproved?: () => void;
}

export function McpSubmissionsPanel({ onApproved }: McpSubmissionsPanelProps) {
  const { submissions, loading, refetch } = useMcpSubmissions("pending");
  const [selectedSubmission, setSelectedSubmission] =
    useState<McpSubmission | null>(null);
  const [reviewerName, setReviewerName] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleReview = async (action: "approve" | "reject") => {
    if (!selectedSubmission) return;
    if (!reviewerName) {
      setError("Please enter your name");
      return;
    }
    if (action === "reject" && !reviewNotes) {
      setError("Please provide a reason for rejection");
      return;
    }

    setProcessing(true);
    setError(null);

    const result = await reviewSubmission(
      selectedSubmission.id,
      action,
      reviewerName,
      reviewNotes || undefined,
    );

    setProcessing(false);

    if (result.success) {
      setSelectedSubmission(null);
      setReviewNotes("");
      refetch();
      if (action === "approve") {
        onApproved?.();
      }
    } else {
      setError(result.error || "Failed to process review");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (submissions.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p>No pending submissions</p>
      </div>
    );
  }

  return (
    <>
      <ScrollArea className="h-[400px]">
        <div className="space-y-3">
          {submissions.map((submission) => (
            <div
              key={submission.id}
              className="p-4 rounded-lg border bg-card hover:border-primary/50 cursor-pointer transition-colors"
              onClick={() => setSelectedSubmission(submission)}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="font-medium">{submission.mcp.name}</h4>
                  <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                    {submission.mcp.description}
                  </p>
                </div>
                <Badge variant="outline" className="ml-2">
                  {submission.mcp.category}
                </Badge>
              </div>
              <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <User className="h-3 w-3" />
                  {submission.submittedBy}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {new Date(submission.submittedAt).toLocaleDateString()}
                </span>
                <span>v{submission.mcp.version}</span>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* Review Dialog */}
      <Dialog
        open={!!selectedSubmission}
        onOpenChange={() => setSelectedSubmission(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Review Submission</DialogTitle>
            <DialogDescription>
              Review and approve or reject this MCP submission
            </DialogDescription>
          </DialogHeader>

          {selectedSubmission && (
            <div className="space-y-4">
              {error && (
                <div className="p-3 rounded bg-destructive/10 text-destructive text-sm">
                  {error}
                </div>
              )}

              {/* Submission Details */}
              <div className="space-y-3 p-4 rounded-lg bg-muted/50">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-lg">
                    {selectedSubmission.mcp.name}
                  </h3>
                  <Badge>{selectedSubmission.mcp.category}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {selectedSubmission.mcp.description}
                </p>

                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Version:</span>{" "}
                    {selectedSubmission.mcp.version}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Gateway:</span>{" "}
                    {selectedSubmission.mcp.useGateway ? "Yes" : "No"}
                  </div>
                  {selectedSubmission.mcp.source && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground">Source:</span>{" "}
                      <a
                        href={`https://${selectedSubmission.mcp.source}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        {selectedSubmission.mcp.source}
                      </a>
                    </div>
                  )}
                </div>

                {selectedSubmission.mcp.tools &&
                  selectedSubmission.mcp.tools.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium mb-1">
                        Tools ({selectedSubmission.mcp.tools.length})
                      </h4>
                      <div className="flex flex-wrap gap-1">
                        {selectedSubmission.mcp.tools.map((tool) => (
                          <code
                            key={tool.name}
                            className="text-xs px-1.5 py-0.5 bg-background rounded"
                          >
                            {tool.name}
                          </code>
                        ))}
                      </div>
                    </div>
                  )}

                {selectedSubmission.mcp.resources &&
                  selectedSubmission.mcp.resources.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium mb-1">
                        Resources ({selectedSubmission.mcp.resources.length})
                      </h4>
                      <div className="flex flex-wrap gap-1">
                        {selectedSubmission.mcp.resources.map((resource) => (
                          <code
                            key={resource.uri}
                            className="text-xs px-1.5 py-0.5 bg-background rounded"
                          >
                            {resource.uri}
                          </code>
                        ))}
                      </div>
                    </div>
                  )}

                <div className="pt-2 border-t text-xs text-muted-foreground">
                  Submitted by {selectedSubmission.submittedBy} on{" "}
                  {new Date(selectedSubmission.submittedAt).toLocaleString()}
                </div>
              </div>

              {/* Reviewer Info */}
              <div className="grid gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="reviewer">Your Name *</Label>
                  <Input
                    id="reviewer"
                    value={reviewerName}
                    onChange={(e) => setReviewerName(e.target.value)}
                    placeholder="Enter your name"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="notes">Review Notes</Label>
                  <Textarea
                    id="notes"
                    value={reviewNotes}
                    onChange={(e) => setReviewNotes(e.target.value)}
                    placeholder="Optional notes (required for rejection)"
                    rows={3}
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={() => setSelectedSubmission(null)}
                  disabled={processing}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => handleReview("reject")}
                  disabled={processing}
                >
                  {processing ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <X className="h-4 w-4 mr-2" />
                  )}
                  Reject
                </Button>
                <Button
                  onClick={() => handleReview("approve")}
                  disabled={processing}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {processing ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4 mr-2" />
                  )}
                  Approve
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
